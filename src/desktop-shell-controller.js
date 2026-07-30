import { requireElement } from './dom.js';

/** @typedef {import('./chalk-desktop-bridge.js').ChalkDesktopBridge} DesktopBridge */

/** @returns {DesktopBridge | undefined} */
function defaultDesktopBridge() {
  return /** @type {typeof globalThis & {chalkDesktop?: DesktopBridge}} */ (globalThis)
    .chalkDesktop;
}

export class DesktopShellController {
  /** @param {DesktopBridge | undefined} [desktopBridge] */
  constructor(desktopBridge = defaultDesktopBridge()) {
    this.desktopBridge = desktopBridge;
    /** @type {AbortController | null} */
    this.abortController = null;
    /** @type {(() => void) | null} */
    this.unsubscribeMaximized = null;
  }

  initialize() {
    if (!this.desktopBridge || this.abortController) return;
    this.abortController = new window.AbortController();
    const options = { signal: this.abortController.signal };
    document.body.classList.add('desktop-shell', `desktop-${this.desktopBridge.platform}`);
    requireElement('#window-minimize').addEventListener(
      'click',
      this.desktopBridge.minimizeWindow,
      options,
    );
    requireElement('#window-maximize').addEventListener(
      'click',
      this.desktopBridge.toggleMaximizeWindow,
      options,
    );
    requireElement('#window-close').addEventListener(
      'click',
      this.desktopBridge.closeWindow,
      options,
    );
    requireElement('#desktop-titlebar-drag').addEventListener(
      'dblclick',
      this.desktopBridge.toggleMaximizeWindow,
      options,
    );
    this.unsubscribeMaximized = this.desktopBridge.onMaximizedChange((maximized) => {
      document.body.classList.toggle('desktop-maximized', maximized);
      /** @type {HTMLElement} */ (requireElement('#window-maximize')).title = maximized
        ? 'Restore'
        : 'Maximize';
      requireElement('#window-maximize').setAttribute(
        'aria-label',
        maximized ? 'Restore' : 'Maximize',
      );
    });
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
    this.unsubscribeMaximized?.();
    this.unsubscribeMaximized = null;
  }
}
