/**
 * @typedef {Pick<
 *   import('electron').App,
 *   'requestSingleInstanceLock' | 'quit' | 'on' | 'removeListener'
 * >} AppAdapter
 *
 * @typedef {Pick<typeof import('electron').BrowserWindow, 'getAllWindows'>} BrowserWindowAdapter
 *
 * @typedef {{
 *   initialize: () => boolean,
 *   destroy: () => boolean,
 * }} SingleInstanceLifecycle
 */

/** @param {BrowserWindowAdapter} browserWindowAdapter */
function focusPrimaryWindow(browserWindowAdapter) {
  const window = browserWindowAdapter.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

/**
 * @param {{
 *   appAdapter: AppAdapter,
 *   browserWindowAdapter: BrowserWindowAdapter,
 * }} dependencies
 * @returns {SingleInstanceLifecycle}
 */
export function createSingleInstanceLifecycle({ appAdapter, browserWindowAdapter }) {
  if (typeof appAdapter?.requestSingleInstanceLock !== 'function') {
    throw new TypeError('Single-instance lifecycle requires an application adapter.');
  }
  if (typeof appAdapter?.quit !== 'function') {
    throw new TypeError('Single-instance lifecycle requires application shutdown.');
  }
  if (typeof appAdapter?.on !== 'function' || typeof appAdapter?.removeListener !== 'function') {
    throw new TypeError('Single-instance lifecycle requires application events.');
  }
  if (typeof browserWindowAdapter?.getAllWindows !== 'function') {
    throw new TypeError('Single-instance lifecycle requires a BrowserWindow adapter.');
  }

  let initialized = false;
  let ownsLock = false;
  const handleSecondInstance = () => focusPrimaryWindow(browserWindowAdapter);

  return Object.freeze({
    initialize() {
      if (initialized) return ownsLock;
      initialized = true;
      ownsLock = appAdapter.requestSingleInstanceLock();

      if (!ownsLock) {
        appAdapter.quit();
        return false;
      }

      appAdapter.on('second-instance', handleSecondInstance);
      return true;
    },

    destroy() {
      if (!initialized) return false;
      initialized = false;

      if (ownsLock) {
        ownsLock = false;
        appAdapter.removeListener('second-instance', handleSecondInstance);
      }
      return true;
    },
  });
}
