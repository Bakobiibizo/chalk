export const MAIN_WINDOW_URL = 'chalk://app/index.html';

/**
 * @typedef {typeof import('electron').BrowserWindow} BrowserWindowConstructor
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 * @typedef {Pick<typeof import('electron').shell, 'openExternal'>} ShellAdapter
 *
 * @typedef {{
 *   port: number,
 *   token: string,
 *   close: () => boolean,
 * }} CodexBridge
 *
 * @typedef {{
 *   createWindow: () => Promise<BrowserWindow>,
 *   destroy: () => boolean,
 * }} MainWindowFactory
 */

/**
 * @param {{
 *   bridge: CodexBridge,
 *   platform: NodeJS.Platform,
 *   preloadPath: string,
 * }} options
 * @returns {import('electron').BrowserWindowConstructorOptions}
 */
function createWindowOptions({ bridge, platform, preloadPath }) {
  return {
    title: 'Chalk',
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#f4f1e9',
    autoHideMenuBar: true,
    frame: false,
    hasShadow: platform !== 'linux',
    show: false,
    webPreferences: {
      additionalArguments: [
        `--chalk-codex-port=${bridge.port}`,
        `--chalk-codex-token=${bridge.token}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
  };
}

/**
 * @param {BrowserWindow} window
 * @param {ShellAdapter} shellAdapter
 */
function configureNavigationPolicy(window, shellAdapter) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') return { action: 'allow' };
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shellAdapter.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('chalk://app/')) event.preventDefault();
  });
}

/**
 * @param {{
 *   browserWindowAdapter: BrowserWindowConstructor,
 *   shellAdapter: ShellAdapter,
 *   createBridge: () => Promise<CodexBridge>,
 *   registerWindowControls: (window: BrowserWindow) => unknown,
 *   platform: NodeJS.Platform,
 *   preloadPath: string,
 * }} dependencies
 * @returns {MainWindowFactory}
 */
export function createMainWindowFactory({
  browserWindowAdapter,
  shellAdapter,
  createBridge,
  registerWindowControls,
  platform,
  preloadPath,
}) {
  if (typeof browserWindowAdapter !== 'function') {
    throw new TypeError('Main window factory requires a BrowserWindow constructor.');
  }
  if (typeof shellAdapter?.openExternal !== 'function') {
    throw new TypeError('Main window factory requires an external navigation adapter.');
  }
  if (typeof createBridge !== 'function') {
    throw new TypeError('Main window factory requires a Codex bridge factory.');
  }
  if (typeof registerWindowControls !== 'function') {
    throw new TypeError('Main window factory requires window control registration.');
  }
  if (typeof platform !== 'string' || platform.length === 0) {
    throw new TypeError('Main window factory requires a platform.');
  }
  if (typeof preloadPath !== 'string' || preloadPath.length === 0) {
    throw new TypeError('Main window factory requires a preload path.');
  }

  /** @type {Set<CodexBridge>} */
  const activeBridges = new Set();

  /** @param {CodexBridge} bridge */
  const releaseBridge = (bridge) => {
    if (!activeBridges.delete(bridge)) return false;
    bridge.close();
    return true;
  };

  return Object.freeze({
    async createWindow() {
      const bridge = await createBridge();
      activeBridges.add(bridge);

      /** @type {BrowserWindow} */
      let window;
      try {
        window = new browserWindowAdapter(
          createWindowOptions({
            bridge,
            platform,
            preloadPath,
          }),
        );
      } catch (error) {
        releaseBridge(bridge);
        throw error;
      }

      configureNavigationPolicy(window, shellAdapter);
      registerWindowControls(window);
      window.once('ready-to-show', () => window.show());
      window.once('closed', () => releaseBridge(bridge));

      await window.loadURL(MAIN_WINDOW_URL);
      return window;
    },

    destroy() {
      const hadActiveBridges = activeBridges.size > 0;
      for (const bridge of [...activeBridges]) releaseBridge(bridge);
      return hadActiveBridges;
    },
  });
}
