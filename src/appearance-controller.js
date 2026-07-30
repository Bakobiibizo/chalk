import { $$, requireElement } from './dom.js';

const STORAGE_KEY = 'chalk-appearance';
/** @typedef {'system' | 'light' | 'dark'} AppearanceTheme */
/** @typedef {{theme: AppearanceTheme, fontScale: number}} AppearanceState */

/** @type {Readonly<AppearanceState>} */
const DEFAULT_APPEARANCE = Object.freeze({ theme: 'system', fontScale: 100 });

export class AppearanceController {
  /** @param {{resizeCanvas: () => void}} options */
  constructor({ resizeCanvas }) {
    this.resizeCanvas = resizeCanvas;
    this.state = this.loadState();
    this.systemTheme = matchMedia('(prefers-color-scheme: dark)');
    /** @type {AbortController | null} */
    this.abortController = null;
  }

  /** @returns {AppearanceState} */
  loadState() {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (serialized === null) return { ...DEFAULT_APPEARANCE };

    /** @type {unknown} */
    const stored = JSON.parse(serialized);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      throw new TypeError('Stored appearance settings must be an object.');
    }
    const candidate = /** @type {Record<string, unknown>} */ (stored);
    if (candidate.theme !== 'light' && candidate.theme !== 'dark' && candidate.theme !== 'system') {
      throw new TypeError('Stored appearance theme is invalid.');
    }
    if (typeof candidate.fontScale !== 'number' || !Number.isFinite(candidate.fontScale)) {
      throw new TypeError('Stored appearance font scale is invalid.');
    }
    return { theme: candidate.theme, fontScale: candidate.fontScale };
  }

  initialize() {
    if (this.abortController) return;
    this.abortController = new window.AbortController();
    const options = { signal: this.abortController.signal };
    requireElement('#appearance-button').addEventListener(
      'click',
      (event) => {
        event.stopPropagation();
        requireElement('#appearance-popover').classList.toggle('show');
      },
      options,
    );
    requireElement('#appearance-popover').addEventListener(
      'click',
      (event) => event.stopPropagation(),
      options,
    );
    requireElement('#close-appearance').addEventListener(
      'click',
      () => this.closePopover(),
      options,
    );
    $$('[data-theme-choice]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          const theme = button.dataset.themeChoice;
          if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
          this.state.theme = theme;
          this.apply();
        },
        options,
      ),
    );
    requireElement('#font-scale').addEventListener(
      'input',
      (event) => this.setFontScale(/** @type {HTMLInputElement} */ (event.currentTarget).value),
      options,
    );
    requireElement('#font-smaller').addEventListener(
      'click',
      () => this.setFontScale(this.state.fontScale - 5),
      options,
    );
    requireElement('#font-larger').addEventListener(
      'click',
      () => this.setFontScale(this.state.fontScale + 5),
      options,
    );
    requireElement('#reset-appearance').addEventListener(
      'click',
      () => {
        Object.assign(this.state, DEFAULT_APPEARANCE);
        this.apply();
      },
      options,
    );
    document.addEventListener('click', () => this.closePopover(), options);
    this.systemTheme.addEventListener(
      'change',
      () => {
        if (this.state.theme === 'system') this.apply(false);
      },
      options,
    );
    this.apply(false);
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
  }

  closePopover() {
    requireElement('#appearance-popover').classList.remove('show');
  }

  /** @param {string | number} value */
  setFontScale(value) {
    this.state.fontScale = Math.max(80, Math.min(140, Number(value)));
    this.apply();
  }

  /** @param {boolean} [save] */
  apply(save = true) {
    const resolvedTheme =
      this.state.theme === 'system'
        ? this.systemTheme.matches
          ? 'dark'
          : 'light'
        : this.state.theme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.setProperty('--font-scale', String(this.state.fontScale / 100));
    /** @type {HTMLMetaElement} */ (requireElement('meta[name="theme-color"]')).content =
      resolvedTheme === 'dark' ? '#1b1c19' : '#f4f1e9';
    /** @type {HTMLInputElement} */ (requireElement('#font-scale')).value = String(
      this.state.fontScale,
    );
    requireElement('#font-scale-value').textContent = `${this.state.fontScale}%`;
    $$('[data-theme-choice]').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeChoice === this.state.theme);
    });
    /** @type {HTMLElement} */ (requireElement('#appearance-button')).title =
      `Appearance · ${this.state.theme} · ${this.state.fontScale}% text`;
    if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    requestAnimationFrame(() => {
      if (/** @type {HTMLElement} */ (requireElement('#paper')).offsetParent) {
        this.resizeCanvas();
      }
    });
  }
}
