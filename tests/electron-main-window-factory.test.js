import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { MAIN_WINDOW_URL, createMainWindowFactory } from '../electron/main-window-factory.js';
import {
  WINDOW_CONTROL_CHANNELS,
  createWindowControlsIpc,
} from '../electron/window-controls-ipc.js';

class TrackedWindow extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.actions = [];
    this.loadedUrls = [];
    this.maximized = false;
    this.sentMessages = [];
    this.windowOpenHandler = null;
    this.webContents = new EventEmitter();
    this.webContents.send = (...arguments_) => this.sentMessages.push(arguments_);
    this.webContents.setWindowOpenHandler = (handler) => {
      this.windowOpenHandler = handler;
    };
    TrackedWindow.instances.push(this);
  }

  async loadURL(url) {
    this.actions.push('load');
    this.loadedUrls.push(url);
  }

  show() {
    this.actions.push('show');
  }

  isMaximized() {
    return this.maximized;
  }
}

function createBridge(port, token) {
  return {
    port,
    token,
    closeCount: 0,
    close() {
      this.closeCount += 1;
    },
  };
}

function createFixture({ platform = 'win32', bridges = [createBridge(43135, 'secret')] } = {}) {
  TrackedWindow.instances = [];
  const externalUrls = [];
  const createdBridges = [];
  const windowControls = createWindowControlsIpc({
    ipcMainAdapter: {
      on() {},
      removeListener() {},
    },
    browserWindowAdapter: {
      fromWebContents() {
        return null;
      },
    },
  });
  const factory = createMainWindowFactory({
    browserWindowAdapter: TrackedWindow,
    shellAdapter: {
      openExternal: (url) => externalUrls.push(url),
    },
    createBridge: async () => {
      const bridge = bridges[createdBridges.length];
      createdBridges.push(bridge);
      return bridge;
    },
    registerWindowControls: (window) => windowControls.registerWindow(window),
    platform,
    preloadPath: 'C:\\chalk\\electron\\preload.cjs',
  });

  return { bridges, createdBridges, externalUrls, factory, windowControls };
}

test('main window creation preserves secure options, bridge arguments, load, and show', async () => {
  const fixture = createFixture();
  const window = await fixture.factory.createWindow();

  assert.equal(window, TrackedWindow.instances[0]);
  assert.deepEqual(window.options, {
    title: 'Chalk',
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#f4f1e9',
    autoHideMenuBar: true,
    frame: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      additionalArguments: ['--chalk-codex-port=43135', '--chalk-codex-token=secret'],
      contextIsolation: true,
      nodeIntegration: false,
      preload: 'C:\\chalk\\electron\\preload.cjs',
      sandbox: true,
    },
  });
  assert.deepEqual(window.loadedUrls, [MAIN_WINDOW_URL]);
  assert.deepEqual(window.actions, ['load']);

  window.emit('ready-to-show');
  assert.deepEqual(window.actions, ['load', 'show']);
});

test('main window navigation permits only app navigation and controlled external opening', async () => {
  const fixture = createFixture();
  const window = await fixture.factory.createWindow();

  assert.deepEqual(window.windowOpenHandler({ url: 'about:blank' }), { action: 'allow' });
  assert.deepEqual(window.windowOpenHandler({ url: 'https://example.com/lesson' }), {
    action: 'deny',
  });
  assert.deepEqual(window.windowOpenHandler({ url: 'http://example.com/reference' }), {
    action: 'deny',
  });
  assert.deepEqual(window.windowOpenHandler({ url: 'file:///sensitive.txt' }), {
    action: 'deny',
  });
  assert.deepEqual(fixture.externalUrls, [
    'https://example.com/lesson',
    'http://example.com/reference',
  ]);

  let allowedNavigationPrevented = false;
  window.webContents.emit(
    'will-navigate',
    {
      preventDefault() {
        allowedNavigationPrevented = true;
      },
    },
    'chalk://app/lesson.html',
  );
  assert.equal(allowedNavigationPrevented, false);

  let externalNavigationPrevented = false;
  window.webContents.emit(
    'will-navigate',
    {
      preventDefault() {
        externalNavigationPrevented = true;
      },
    },
    'https://example.com/escape',
  );
  assert.equal(externalNavigationPrevented, true);
});

test('main window registers maximize events and releases its bridge when closed', async () => {
  const fixture = createFixture();
  const window = await fixture.factory.createWindow();

  window.maximized = true;
  window.emit('maximize');
  window.maximized = false;
  window.emit('unmaximize');
  assert.deepEqual(window.sentMessages, [
    [WINDOW_CONTROL_CHANNELS.maximizedState, true],
    [WINDOW_CONTROL_CHANNELS.maximizedState, false],
  ]);

  window.emit('closed');
  window.emit('closed');
  assert.equal(fixture.bridges[0].closeCount, 1);
  assert.equal(fixture.factory.destroy(), false);
});

test('factory shutdown releases every active bridge exactly once', async () => {
  const bridges = [createBridge(1, 'first'), createBridge(2, 'second')];
  const fixture = createFixture({ platform: 'linux', bridges });
  const firstWindow = await fixture.factory.createWindow();
  const secondWindow = await fixture.factory.createWindow();

  assert.equal(firstWindow.options.hasShadow, false);
  assert.equal(secondWindow.options.hasShadow, false);
  assert.equal(fixture.factory.destroy(), true);
  assert.deepEqual(
    bridges.map((bridge) => bridge.closeCount),
    [1, 1],
  );

  firstWindow.emit('closed');
  secondWindow.emit('closed');
  assert.equal(fixture.factory.destroy(), false);
  assert.deepEqual(
    bridges.map((bridge) => bridge.closeCount),
    [1, 1],
  );
});
