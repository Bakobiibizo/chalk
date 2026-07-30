const { contextBridge, ipcRenderer } = require('electron');

/** @typedef {import('../src/chalk-desktop-bridge.d.ts').ChalkDesktopBridge} ChalkDesktopBridge */

/** @param {string} name */
function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

/** @type {ChalkDesktopBridge} */
const chalkDesktop = {
  codexPort: argumentValue('chalk-codex-port'),
  codexToken: argumentValue('chalk-codex-token'),
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('chalk-window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('chalk-window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('chalk-window:close'),
  openChatPopout: (html) => ipcRenderer.invoke('chalk-chat:popout', html),
  parseModelJson: (text) => ipcRenderer.invoke('chalk-grist:parse-model-json', text),
  onMaximizedChange: (callback) => {
    /**
     * @param {import('electron').IpcRendererEvent} _event
     * @param {unknown} maximized
     */
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('chalk-window:maximized', listener);
    return () => ipcRenderer.removeListener('chalk-window:maximized', listener);
  },
};

contextBridge.exposeInMainWorld('chalkDesktop', chalkDesktop);
