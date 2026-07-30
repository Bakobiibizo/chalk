export class ProjectMenuController {
  /** @param {{button: HTMLButtonElement, menu: HTMLElement}} options */
  constructor({ button, menu }) {
    this.button = button;
    this.menu = menu;
    this.initialized = false;
    this.handleButtonClick = () => this.toggle();
    /** @param {MouseEvent} event */
    this.handleMenuClick = (event) => {
      if (event.target instanceof Element && event.target.closest('[role="menuitem"]')) {
        this.close();
      }
    };
    /** @param {MouseEvent} event */
    this.handleDocumentClick = (event) => {
      const target = /** @type {Node | null} */ (event.target);
      if (target && !this.menu.contains(target) && !this.button.contains(target)) {
        this.close();
      }
    };
    /** @param {KeyboardEvent} event */
    this.handleDocumentKeydown = (event) => {
      if (event.key !== 'Escape' || this.menu.hidden) return;
      this.close();
      this.button.focus();
    };
  }

  initialize() {
    if (this.initialized || !this.button || !this.menu) return;
    this.initialized = true;
    this.button.addEventListener('click', this.handleButtonClick);
    this.menu.addEventListener('click', this.handleMenuClick);
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  toggle() {
    if (this.menu.hidden) this.open();
    else this.close();
  }

  open() {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    /** @type {HTMLElement | null} */ (this.menu.querySelector('[role="menuitem"]'))?.focus();
  }

  close() {
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  destroy() {
    if (!this.initialized) return;
    this.initialized = false;
    this.button.removeEventListener('click', this.handleButtonClick);
    this.menu.removeEventListener('click', this.handleMenuClick);
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
    this.close();
  }
}
