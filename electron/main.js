import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGristProcessAdapter } from '../src/grist-process-adapter.js';
import { registerChalkAppProtocol, registerChalkAppScheme } from './app-protocol.js';
import { createChatPopoutLifecycle } from './chat-popout-lifecycle.js';
import { startElectronCodexBridge } from './codex-bridge.js';
import { createCodexExecutableResolver } from './codex-executable-resolver.js';
import { createGristIpc } from './grist-ipc.js';
import { createMainWindowFactory } from './main-window-factory.js';
import { createSingleInstanceLifecycle } from './single-instance-lifecycle.js';
import { createWindowControlsIpc } from './window-controls-ipc.js';

/** @typedef {import('../src/node-process-contracts.js').PipedSpawnRequest} PipedSpawnRequest */

const appDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distributionDirectory = path.join(appDirectory, 'dist');
const findCodexExecutable = createCodexExecutableResolver({
  platform: process.platform,
  pathDelimiter: path.delimiter,
  joinPath: path.join,
  readDirectory: (directory) => readdirSync(directory, { withFileTypes: true }),
  pathExists: existsSync,
  getHomeDirectory: () => app.getPath('home'),
  getEnvironmentVariable: (name) => process.env[name],
});
const gristProcessAdapter = createGristProcessAdapter({
  spawnPolicy: ({ command, arguments: commandArguments, options }) =>
    spawn(command, commandArguments, {
      ...options,
      windowsHide: true,
      shell: process.platform === 'win32',
    }),
});
const gristIpc = createGristIpc({
  ipcMainAdapter: ipcMain,
  parseModelJson: (text) => gristProcessAdapter.parseModelJson(text),
});
const windowControlsIpc = createWindowControlsIpc({
  ipcMainAdapter: ipcMain,
  browserWindowAdapter: BrowserWindow,
});
const chatPopoutLifecycle = createChatPopoutLifecycle({
  ipcMainAdapter: ipcMain,
  browserWindowAdapter: BrowserWindow,
});
const mainWindowFactory = createMainWindowFactory({
  browserWindowAdapter: BrowserWindow,
  shellAdapter: shell,
  createBridge: () =>
    startElectronCodexBridge({
      spawnPolicy: ({ command, arguments: commandArguments, options }) =>
        spawn(command, commandArguments, {
          ...options,
          windowsHide: true,
          shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
        }),
      resolveExecutable: findCodexExecutable,
      workingDirectory: app.getPath('userData'),
    }),
  registerWindowControls: (window) => windowControlsIpc.registerWindow(window),
  platform: process.platform,
  preloadPath: path.join(appDirectory, 'electron', 'preload.cjs'),
});
const singleInstanceLifecycle = createSingleInstanceLifecycle({
  appAdapter: app,
  browserWindowAdapter: BrowserWindow,
});
const isWslg =
  process.platform === 'linux' &&
  Boolean(process.env.WSL_DISTRO_NAME) &&
  Boolean(process.env.WAYLAND_DISPLAY);

if (isWslg) app.commandLine.appendSwitch('ozone-platform', 'wayland');

registerChalkAppScheme(protocol);

if (singleInstanceLifecycle.initialize()) {
  windowControlsIpc.initialize();
  chatPopoutLifecycle.initialize();
  gristIpc.initialize();

  app.whenReady().then(async () => {
    registerChalkAppProtocol({
      protocolAdapter: protocol,
      networkAdapter: net,
      distributionDirectory,
    });
    await mainWindowFactory.createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindowFactory.createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  mainWindowFactory.destroy();
  gristIpc.destroy();
  chatPopoutLifecycle.destroy();
  windowControlsIpc.destroy();
  singleInstanceLifecycle.destroy();
});
