export const GRIST_PARSE_CHANNEL = 'chalk-grist:parse-model-json';

/**
 * @typedef {Pick<import('electron').IpcMain, 'handle' | 'removeHandler'>} IpcMainAdapter
 *
 * @typedef {{
 *   initialize: () => boolean,
 *   destroy: () => boolean,
 * }} GristIpc
 */

/**
 * @param {{
 *   ipcMainAdapter: IpcMainAdapter,
 *   parseModelJson: (text: string) => unknown | Promise<unknown>,
 * }} dependencies
 * @returns {GristIpc}
 */
export function createGristIpc({ ipcMainAdapter, parseModelJson }) {
  if (typeof ipcMainAdapter?.handle !== 'function') {
    throw new TypeError('Grist IPC requires an ipcMain adapter.');
  }
  if (typeof ipcMainAdapter?.removeHandler !== 'function') {
    throw new TypeError('Grist IPC requires ipcMain handler removal.');
  }
  if (typeof parseModelJson !== 'function') {
    throw new TypeError('Grist IPC requires a model-output parser.');
  }

  let initialized = false;
  /**
   * @param {import('electron').IpcMainInvokeEvent} _event
   * @param {string} text
   */
  const handleParseModelJson = (_event, text) => parseModelJson(text);

  return Object.freeze({
    initialize() {
      if (initialized) return false;
      initialized = true;
      ipcMainAdapter.handle(GRIST_PARSE_CHANNEL, handleParseModelJson);
      return true;
    },

    destroy() {
      if (!initialized) return false;
      initialized = false;
      ipcMainAdapter.removeHandler(GRIST_PARSE_CHANNEL);
      return true;
    },
  });
}
