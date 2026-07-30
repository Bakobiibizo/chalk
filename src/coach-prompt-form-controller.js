/**
 * @typedef {import('./coach-contracts.js').CoachMessageRendererPort} CoachMessageRendererPort
 * @typedef {import('./coach-contracts.js').CoachService} CoachService
 * @typedef {import('./coach-contracts.js').PreparedCoachRequest} PreparedCoachRequest
 */

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class CoachPromptFormController {
  /**
   * @param {{
   *   form: HTMLFormElement,
   *   prompt: HTMLTextAreaElement,
   *   sendButton: HTMLButtonElement,
   *   presetButtons: readonly HTMLElement[],
   *   coachService: CoachService,
   *   messageRenderer: CoachMessageRendererPort,
   *   prepareRequest: (prompt: string) => PreparedCoachRequest | Promise<PreparedCoachRequest>,
   * }} options
   */
  constructor({
    form,
    prompt,
    sendButton,
    presetButtons,
    coachService,
    messageRenderer,
    prepareRequest,
  }) {
    this.form = form;
    this.prompt = prompt;
    this.sendButton = sendButton;
    this.presetButtons = presetButtons;
    this.coachService = coachService;
    this.messageRenderer = messageRenderer;
    this.prepareRequest = prepareRequest;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.focusTimer = null;
  }

  /** @param {AbortSignal} signal */
  initialize(signal) {
    for (const button of this.presetButtons) {
      button.addEventListener(
        'click',
        () => {
          this.prompt.value = button.dataset.coachPrompt || '';
          this.prompt.focus();
        },
        { signal },
      );
    }
    this.form.addEventListener('submit', (event) => this.submit(event), { signal });
  }

  /** @param {number} [delay] */
  focus(delay = 0) {
    if (this.focusTimer !== null) clearTimeout(this.focusTimer);
    if (!delay) {
      this.prompt.focus();
      return;
    }
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      this.prompt.focus();
    }, delay);
  }

  /** @param {SubmitEvent} event */
  async submit(event) {
    event.preventDefault();
    const prompt = this.prompt.value.trim();
    if (!prompt) return;

    this.messageRenderer.appendMessage(prompt, 'user');
    const reply = this.messageRenderer.beginAssistantReply();
    this.prompt.value = '';
    this.sendButton.disabled = true;
    try {
      const { request, image } = await this.prepareRequest(prompt);
      const finalReply = await this.coachService.run(request, image, (text) => {
        this.messageRenderer.updateAssistantReply(reply, text);
      });
      this.messageRenderer.completeAssistantReply(reply, finalReply);
    } catch (error) {
      this.messageRenderer.failAssistantReply(
        reply,
        `${errorMessage(error)} Start the app with npm run dev and make sure Codex CLI is signed in.`,
      );
    } finally {
      this.sendButton.disabled = false;
    }
  }

  destroy() {
    if (this.focusTimer !== null) clearTimeout(this.focusTimer);
    this.focusTimer = null;
  }
}
