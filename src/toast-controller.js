export class ToastController {
  /**
   * @param {HTMLElement} element
   * @param {{displayDuration?: number}} [options]
   */
  constructor(element, { displayDuration = 1800 } = {}) {
    this.element = element;
    this.displayDuration = displayDuration;
    /** @type {number | null} */
    this.hideTimer = null;
  }

  /** @param {string} message */
  show(message) {
    this.element.textContent = message;
    this.element.classList.add('show');
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(
      () => this.element.classList.remove('show'),
      this.displayDuration,
    );
  }

  destroy() {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.element.classList.remove('show');
  }
}
