export const WINDOW_CONTROL_CHANNELS = Object.freeze({
  minimize: 'chalk-window:minimize',
  toggleMaximize: 'chalk-window:toggle-maximize',
  close: 'chalk-window:close',
  maximizedState: 'chalk-window:maximized',
});

/**
 * @typedef {Pick<import('electron').IpcMain, 'on' | 'removeListener'>} IpcMainAdapter
 * @typedef {Pick<typeof import('electron').BrowserWindow, 'fromWebContents'>} BrowserWindowAdapter
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 * @typedef {(event: import('electron').IpcMainEvent) => void} IpcWindowListener
 *
 * @typedef {{
 *   initialize: () => boolean,
 *   registerWindow: (window: BrowserWindow) => () => boolean,
 *   destroy: () => boolean,
 * }} WindowControlsIpc
 */

/**
 * @param {{
 *   ipcMainAdapter: IpcMainAdapter,
 *   browserWindowAdapter: BrowserWindowAdapter,
 * }} dependencies
 * @returns {WindowControlsIpc}
 */
export function createWindowControlsIpc({ ipcMainAdapter, browserWindowAdapter }) {
  if (typeof ipcMainAdapter?.on !== 'function') {
    throw new TypeError('Window controls IPC requires an ipcMain adapter.');
  }
  if (typeof ipcMainAdapter?.removeListener !== 'function') {
    throw new TypeError('Window controls IPC requires ipcMain listener removal.');
  }
  if (typeof browserWindowAdapter?.fromWebContents !== 'function') {
    throw new TypeError('Window controls IPC requires a BrowserWindow adapter.');
  }

  let initialized = false;
  /** @type {Map<BrowserWindow, () => boolean>} */
  const windowRegistrations = new Map();
  /** @param {import('electron').IpcMainEvent} event */
  const resolveSenderWindow = (event) => browserWindowAdapter.fromWebContents(event.sender);
  /** @param {import('electron').IpcMainEvent} event */
  const minimize = (event) => resolveSenderWindow(event)?.minimize();
  /** @param {import('electron').IpcMainEvent} event */
  const toggleMaximize = (event) => {
    const window = resolveSenderWindow(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  };
  /** @param {import('electron').IpcMainEvent} event */
  const close = (event) => resolveSenderWindow(event)?.close();
  /** @type {readonly (readonly [string, IpcWindowListener])[]} */
  const ipcListeners = [
    [WINDOW_CONTROL_CHANNELS.minimize, minimize],
    [WINDOW_CONTROL_CHANNELS.toggleMaximize, toggleMaximize],
    [WINDOW_CONTROL_CHANNELS.close, close],
  ];

  return Object.freeze({
    initialize() {
      if (initialized) return false;
      initialized = true;
      for (const [channel, listener] of ipcListeners) {
        ipcMainAdapter.on(channel, listener);
      }
      return true;
    },

    registerWindow(window) {
      const existingRegistration = windowRegistrations.get(window);
      if (existingRegistration) return existingRegistration;

      const sendMaximizedState = () => {
        window.webContents.send(WINDOW_CONTROL_CHANNELS.maximizedState, window.isMaximized());
      };
      let registered = true;
      const dispose = () => {
        if (!registered) return false;
        registered = false;
        window.removeListener('maximize', sendMaximizedState);
        window.removeListener('unmaximize', sendMaximizedState);
        window.removeListener('closed', dispose);
        windowRegistrations.delete(window);
        return true;
      };

      window.on('maximize', sendMaximizedState);
      window.on('unmaximize', sendMaximizedState);
      window.once('closed', dispose);
      windowRegistrations.set(window, dispose);
      return dispose;
    },

    destroy() {
      const hadRegistrations = initialized || windowRegistrations.size > 0;
      if (initialized) {
        initialized = false;
        for (const [channel, listener] of ipcListeners) {
          ipcMainAdapter.removeListener(channel, listener);
        }
      }
      for (const dispose of [...windowRegistrations.values()]) dispose();
      return hadRegistrations;
    },
  });
}
