export const CHAT_POPOUT_CHANNEL = 'chalk-chat:popout';

/**
 * @typedef {Pick<import('electron').IpcMain, 'handle' | 'removeHandler'>} IpcMainAdapter
 * @typedef {typeof import('electron').BrowserWindow} BrowserWindowConstructor
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 *
 * @typedef {{
 *   initialize: () => boolean,
 *   destroy: () => boolean,
 * }} ChatPopoutLifecycle
 */

/** @returns {import('electron').BrowserWindowConstructorOptions} */
function createWindowOptions() {
  return {
    title: 'Chalk Chat',
    width: 430,
    height: 760,
    minWidth: 320,
    minHeight: 420,
    parent: undefined,
    backgroundColor: '#1f201d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

/**
 * @param {{
 *   ipcMainAdapter: IpcMainAdapter,
 *   browserWindowAdapter: BrowserWindowConstructor,
 * }} dependencies
 * @returns {ChatPopoutLifecycle}
 */
export function createChatPopoutLifecycle({ ipcMainAdapter, browserWindowAdapter }) {
  if (typeof ipcMainAdapter?.handle !== 'function') {
    throw new TypeError('Chat popout lifecycle requires an ipcMain adapter.');
  }
  if (typeof ipcMainAdapter?.removeHandler !== 'function') {
    throw new TypeError('Chat popout lifecycle requires ipcMain handler removal.');
  }
  if (typeof browserWindowAdapter !== 'function') {
    throw new TypeError('Chat popout lifecycle requires a BrowserWindow constructor.');
  }

  let initialized = false;
  /** @type {BrowserWindow | null} */
  let popoutWindow = null;

  /** @returns {BrowserWindow} */
  const createPopoutWindow = () => {
    const window = new browserWindowAdapter(createWindowOptions());
    popoutWindow = window;

    window.once('ready-to-show', () => {
      if (popoutWindow === window && !window.isDestroyed()) window.show();
    });
    window.once('closed', () => {
      if (popoutWindow === window) popoutWindow = null;
    });

    return window;
  };

  /**
   * @param {import('electron').IpcMainInvokeEvent} _event
   * @param {string} html
   */
  const openPopout = async (_event, html) => {
    const window =
      !popoutWindow || popoutWindow.isDestroyed() ? createPopoutWindow() : popoutWindow;

    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return true;
  };

  return Object.freeze({
    initialize() {
      if (initialized) return false;
      initialized = true;
      ipcMainAdapter.handle(CHAT_POPOUT_CHANNEL, openPopout);
      return true;
    },

    destroy() {
      const window = popoutWindow;
      const hadLifecycle = initialized || Boolean(window);

      if (initialized) {
        initialized = false;
        ipcMainAdapter.removeHandler(CHAT_POPOUT_CHANNEL);
      }

      popoutWindow = null;
      if (window && !window.isDestroyed()) window.close();
      return hadLifecycle;
    },
  });
}
