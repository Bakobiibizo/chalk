export class PageInterpretationController {
  /**
   * @param {{
   *   button: HTMLButtonElement | null,
   *   interpretPage: () => Promise<string>,
   *   onInterpretation: (interpretation: string) => void,
   *   showToast: (message: string) => void,
   * }} options
   */
  constructor({ button, interpretPage, onInterpretation, showToast }) {
    this.button = button;
    this.interpretPage = interpretPage;
    this.onInterpretation = onInterpretation;
    this.showToast = showToast;
    this.initialized = false;
    this.handleButtonClick = () => this.run();
  }

  initialize() {
    if (this.initialized || !this.button) return;
    const button = this.button;
    button.addEventListener('click', this.handleButtonClick);
    this.initialized = true;
  }

  destroy() {
    if (!this.initialized || !this.button) return;
    this.button.removeEventListener('click', this.handleButtonClick);
    this.initialized = false;
  }

  async run() {
    if (!this.button || this.button.disabled) return;

    this.button.disabled = true;
    this.button.setAttribute('aria-busy', 'true');
    this.showToast('Interpreting the current page…');

    try {
      const interpretation = (await this.interpretPage()).trim();
      if (!interpretation) throw new Error('No handwriting could be interpreted.');
      this.onInterpretation(interpretation);
      this.showToast('Page interpretation added to the calculator');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'The page could not be interpreted.');
    } finally {
      this.button.disabled = false;
      this.button.removeAttribute('aria-busy');
    }
  }
}
