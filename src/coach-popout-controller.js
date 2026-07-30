import { escapeHtml } from './dom.js';

/**
 * @typedef {import('./coach-contracts.js').CoachDesktopBridge} CoachDesktopBridge
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 */

export class CoachPopoutController {
  /**
   * @param {{
   *   desktopBridge: CoachDesktopBridge | null | undefined,
   *   getSession: () => CoachSession | null,
   *   getActiveThread: () => CoachThread | null,
   *   showToast: (message: string) => void,
   * }} options
   */
  constructor({ desktopBridge, getSession, getActiveThread, showToast }) {
    this.desktopBridge = desktopBridge;
    this.getSession = getSession;
    this.getActiveThread = getActiveThread;
    this.showToast = showToast;
    /** @type {Window | 'desktop' | null} */
    this.popoutWindow = null;
  }

  /** @returns {string} */
  markup() {
    const session = this.getSession();
    const thread = this.getActiveThread();
    const messages =
      (thread?.messages || [])
        .map((message) => `<div class="message ${message.role}">${escapeHtml(message.text)}</div>`)
        .join('') || '<div class="message system">No messages in this thread yet.</div>';
    return `<!doctype html><html><head><title>Chalk chat</title><style>body{margin:0;font:14px system-ui;background:#1f201d;color:#efeee8}.shell{height:100vh;display:flex;flex-direction:column}.head{padding:14px 16px;border-bottom:1px solid #42423d}.head b{display:block}.head small{color:#aaa89f}.messages{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}.message{max-width:86%;white-space:pre-wrap;line-height:1.45;padding:10px 12px;border-radius:10px;background:#30312c}.message.user{align-self:flex-end;background:#efeee8;color:#252621}.message.system{align-self:center;color:#aaa89f}.note{padding:10px 14px;border-top:1px solid #42423d;color:#aaa89f;font-size:12px}</style></head><body><main class="shell"><div class="head"><b>${escapeHtml(thread?.title || 'Chalk chat')}</b><small>${escapeHtml(session?.title || 'Project')} Â· live mirror</small></div><section class="messages" id="messages">${messages}</section><div class="note">Use the main Chalk window to send messages. This pop-out stays mirrored for second-screen reference.</div></main></body></html>`;
  }

  sync() {
    const html = this.markup();
    if (this.desktopBridge?.openChatPopout && this.popoutWindow === 'desktop') {
      return this.desktopBridge.openChatPopout(html);
    }
    if (!this.popoutWindow || this.popoutWindow === 'desktop' || this.popoutWindow.closed) {
      return;
    }
    this.popoutWindow.document.open();
    this.popoutWindow.document.write(html);
    this.popoutWindow.document.close();
    this.popoutWindow.document.getElementById('messages')?.scrollTo(0, 999999);
  }

  async open() {
    const html = this.markup();
    if (this.desktopBridge?.openChatPopout) {
      await this.desktopBridge.openChatPopout(html);
      this.popoutWindow = 'desktop';
      this.showToast('Chat opened in a separate window');
      return;
    }
    this.popoutWindow = window.open('', 'chalk-chat-popout', 'popup,width=420,height=760');
    if (!this.popoutWindow) {
      throw new Error('Pop-out was blocked by the window manager.');
    }
    this.sync();
    this.showToast('Chat opened in a pop-out window');
  }

  destroy() {
    if (this.popoutWindow && this.popoutWindow !== 'desktop' && !this.popoutWindow.closed) {
      this.popoutWindow.close();
    }
    this.popoutWindow = null;
  }
}
