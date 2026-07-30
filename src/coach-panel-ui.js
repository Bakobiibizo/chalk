import { $, $$ } from './dom.js';
import {
  CoachHistoryController,
  createCoachThread,
  ensureCoachThreads,
} from './coach-history-controller.js';
import { CoachMessageRenderer } from './coach-message-renderer.js';
import { CoachPopoutController } from './coach-popout-controller.js';
import { CoachPromptFormController } from './coach-prompt-form-controller.js';
import { FloatingWidgetController } from './floating-widget-controller.js';

export { createCoachThread, ensureCoachThreads };

/**
 * @typedef {import('./coach-contracts.js').CoachDesktopBridge} CoachDesktopBridge
 * @typedef {import('./coach-contracts.js').CoachIdentifier} CoachIdentifier
 * @typedef {import('./coach-contracts.js').CoachMessageRole} CoachMessageRole
 * @typedef {import('./coach-contracts.js').CoachService} CoachService
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 * @typedef {import('./coach-contracts.js').PreparedCoachRequest} PreparedCoachRequest
 */

export class CoachPanelUI {
  /**
   * @param {{
   *   coachService: CoachService,
   *   desktopBridge: CoachDesktopBridge | null | undefined,
   *   getSession: () => CoachSession | null,
   *   persistSession: () => void,
   *   prepareRequest: (prompt: string) => PreparedCoachRequest | Promise<PreparedCoachRequest>,
   *   renderLatex: (element: HTMLElement) => void,
   *   showToast: (message: string) => void,
   *   beforeOpen: () => void,
   *   createIdentifier?: () => CoachIdentifier,
   *   createTimestamp?: () => string,
   * }} options
   */
  constructor({
    coachService,
    desktopBridge,
    getSession,
    persistSession,
    prepareRequest,
    renderLatex,
    showToast,
    beforeOpen,
    createIdentifier,
    createTimestamp,
  }) {
    this.beforeOpen = beforeOpen;
    /** @type {AbortController | null} */
    this.abortController = null;
    this.panel = /** @type {HTMLElement} */ ($('#coach-panel'));
    this.prompt = /** @type {HTMLTextAreaElement} */ ($('#coach-prompt'));

    this.popout = new CoachPopoutController({
      desktopBridge,
      getSession,
      getActiveThread: () => this.activeThread(),
      showToast,
    });
    this.messageRenderer = new CoachMessageRenderer({
      conversation: /** @type {HTMLElement} */ ($('#coach-conversation')),
      renderLatex,
      persistMessage: (text, role) => this.history.persistMessage(text, role),
      getMessages: () => this.activeThread()?.messages || [],
      afterRestore: () => this.popout.sync(),
    });
    this.history = new CoachHistoryController({
      list: /** @type {HTMLElement | null} */ ($('#coach-history-list')),
      getSession,
      persistSession,
      isRequestActive: () => coachService.isActive,
      useCodexThread: (threadId) => coachService.useThread(threadId),
      restoreTranscript: () => this.messageRenderer.restoreConversation(),
      syncPopout: () => this.popout.sync(),
      focusPrompt: () => this.promptForm.focus(),
      createIdentifier,
      createTimestamp,
    });
    this.promptForm = new CoachPromptFormController({
      form: /** @type {HTMLFormElement} */ ($('#coach-form')),
      prompt: this.prompt,
      sendButton: /** @type {HTMLButtonElement} */ ($('.send-page')),
      presetButtons: /** @type {HTMLElement[]} */ ($$('[data-coach-prompt]')),
      coachService,
      messageRenderer: this.messageRenderer,
      prepareRequest,
    });
    /** @type {FloatingWidgetController | null} */
    this.widget = null;
    this.widgetOptions = {
      element: this.panel,
      handle: /** @type {HTMLElement} */ ($('.coach-head')),
      getOwner: getSession,
      saveOwner: persistSession,
    };
  }

  /** @returns {CoachThread | null} */
  activeThread() {
    return this.history.activeThread();
  }

  initialize() {
    if (this.abortController) return;
    this.abortController = new window.AbortController();
    const options = { signal: this.abortController.signal };
    this.widget = new FloatingWidgetController(this.widgetOptions);
    $('#ask-codex')?.addEventListener('click', () => this.open(), options);
    $('#codex-status')?.addEventListener('click', () => this.open(), options);
    $('#close-coach')?.addEventListener(
      'click',
      () => this.panel.classList.remove('open'),
      options,
    );
    $('#new-coach-thread')?.addEventListener('click', () => this.startNewThread(), options);
    $('#toggle-coach-history')?.addEventListener(
      'click',
      () => this.panel.classList.toggle('history-open'),
      options,
    );
    $('#popout-coach')?.addEventListener('click', () => this.openPopout(), options);
    this.promptForm.initialize(options.signal);
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
    this.widget?.destroy();
    this.widget = null;
    this.promptForm.destroy();
    this.popout.destroy();
  }

  open() {
    this.beforeOpen();
    this.widget?.restore();
    this.panel.classList.add('open');
    this.promptForm.focus(200);
  }

  restoreForSession() {
    this.history.restoreForSession();
    this.widget?.restore();
  }

  startNewThread() {
    this.history.startNewThread();
  }

  /** @param {CoachIdentifier} id */
  selectThread(id) {
    this.history.selectThread(id);
  }

  renderHistory() {
    this.history.render();
  }

  /**
   * @param {string} text
   * @param {CoachMessageRole} role
   */
  persistMessage(text, role) {
    this.history.persistMessage(text, role);
  }

  /** @returns {string} */
  popoutMarkup() {
    return this.popout.markup();
  }

  syncPopout() {
    return this.popout.sync();
  }

  async openPopout() {
    return this.popout.open();
  }
}
