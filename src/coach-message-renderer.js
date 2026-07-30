const DEFAULT_GREETING = 'I can see the page you’re working on. What would you like help with?';

/**
 * @typedef {import('./coach-contracts.js').CoachMessage} CoachMessage
 * @typedef {import('./coach-contracts.js').CoachMessageRole} CoachMessageRole
 */

export class CoachMessageRenderer {
  /**
   * @param {{
   *   conversation: HTMLElement,
   *   renderLatex: (element: HTMLElement) => void,
   *   persistMessage: (text: string, role: CoachMessageRole) => void,
   *   getMessages: () => readonly CoachMessage[],
   *   afterRestore: () => void,
   * }} options
   */
  constructor({ conversation, renderLatex, persistMessage, getMessages, afterRestore }) {
    this.conversation = conversation;
    this.renderLatex = renderLatex;
    this.persistMessage = persistMessage;
    this.getMessages = getMessages;
    this.afterRestore = afterRestore;
  }

  scrollToBottom() {
    this.conversation.scrollTop = this.conversation.scrollHeight;
  }

  /**
   * @param {string} text
   * @param {CoachMessageRole | 'system'} role
   * @param {string} [extraClass]
   * @param {boolean} [persist]
   * @returns {HTMLDivElement}
   */
  appendMessage(text, role, extraClass = '', persist = true) {
    const message = document.createElement('div');
    message.className = `coach-message ${role} ${extraClass}`.trim();
    message.textContent = text;
    this.conversation.append(message);
    if (!extraClass.includes('thinking')) this.renderLatex(message);
    this.scrollToBottom();
    if (persist && role !== 'system') this.persistMessage(text, role);
    return message;
  }

  restoreConversation() {
    if (!this.conversation) return;
    this.conversation.replaceChildren();
    const greeting = document.createElement('div');
    greeting.className = 'coach-message system';
    greeting.textContent = DEFAULT_GREETING;
    this.conversation.append(greeting);
    for (const message of this.getMessages()) {
      this.appendMessage(message.text, message.role, '', false);
    }
    this.afterRestore();
  }

  /** @returns {HTMLDivElement} */
  beginAssistantReply() {
    return this.appendMessage('Thinking', 'assistant', 'thinking', false);
  }

  /**
   * @param {HTMLDivElement} message
   * @param {string} text
   */
  updateAssistantReply(message, text) {
    message.textContent = text;
    message.classList.remove('thinking');
    this.scrollToBottom();
  }

  /**
   * @param {HTMLDivElement} message
   * @param {string} text
   */
  completeAssistantReply(message, text) {
    const finalText = text || message.textContent;
    message.classList.remove('thinking');
    message.textContent = finalText;
    this.renderLatex(message);
    this.persistMessage(finalText, 'assistant');
  }

  /**
   * @param {HTMLDivElement} message
   * @param {string} text
   */
  failAssistantReply(message, text) {
    message.textContent = text;
    message.classList.remove('thinking');
  }
}
