import { $, $$, escapeHtml, requireElement } from './dom.js';
import { calculateExpression } from './math-parser.js';

const CALCULATIONS_STORAGE_KEY = 'chalk-calculations';

/**
 * @typedef {'RAD' | 'DEG'} AngleMode
 * @typedef {{expression: string, result: string}} Calculation
 * @typedef {{target: EventTarget, type: string, listener: EventListener}} OwnedListener
 */

/** @returns {HTMLInputElement} */
function expressionInput() {
  return /** @type {HTMLInputElement} */ (requireElement('#expression'));
}

/** @param {unknown} value @returns {value is Calculation} */
function isCalculation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = /** @type {Record<string, unknown>} */ (value);
  return typeof candidate.expression === 'string' && typeof candidate.result === 'string';
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class CalculatorPanelController {
  /** @param {{onPinResult: (result: Calculation) => void}} options */
  constructor({ onPinResult }) {
    this.onPinResult = onPinResult;
    this.calculations = this.loadCalculations();
    /** @type {Calculation | null} */
    this.currentResult = null;
    this.panel = /** @type {HTMLElement} */ (requireElement('#math-panel'));
    /** @type {AngleMode} */
    this.angleMode = 'RAD';
    /** @type {HTMLElement | null} */
    this.previousFocus = null;
    /** @type {OwnedListener[]} */
    this.listeners = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.focusTimer = null;
    this.initialized = false;
  }

  /**
   * @param {EventTarget} target
   * @param {string} type
   * @param {EventListener} listener
   */
  addListener(target, type, listener) {
    target.addEventListener(type, listener);
    this.listeners.push({ target, type, listener });
  }

  initialize() {
    if (this.initialized) return;
    this.addListener(requireElement('#panel-toggle'), 'click', () => this.open());
    this.addListener(requireElement('#close-panel'), 'click', () => this.close());
    const scrim = $('#calculator-scrim');
    if (scrim) this.addListener(scrim, 'click', () => this.close());
    this.addListener(requireElement('#math-form'), 'submit', (event) => this.calculate(event));
    $$('[data-insert]').forEach((button) => {
      this.addListener(button, 'click', () => this.insert(button.dataset.insert ?? ''));
    });
    this.addListener(requireElement('#clear-history'), 'click', () => this.clearHistory());
    this.addListener(requireElement('#pin-result'), 'click', () => this.pinResult());
    const clearButton = $('[data-calculator-action="clear"]');
    if (clearButton) this.addListener(clearButton, 'click', () => this.clearExpression());
    const backspaceButton = $('[data-calculator-action="backspace"]');
    if (backspaceButton) this.addListener(backspaceButton, 'click', () => this.backspace());
    const angleModeButton = $('#angle-mode');
    if (angleModeButton) this.addListener(angleModeButton, 'click', () => this.toggleAngleMode());
    this.addListener(requireElement('#history-list'), 'click', (event) =>
      this.selectHistoryEntry(event),
    );
    this.addListener(document, 'keydown', (event) =>
      this.handleKeydown(/** @type {KeyboardEvent} */ (event)),
    );
    this.renderHistory();
    this.initialized = true;
  }

  destroy() {
    if (!this.initialized) return;
    for (const { target, type, listener } of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners = [];
    this.clearFocusTimer();
    this.initialized = false;
  }

  open() {
    this.previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    this.panel.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.clearFocusTimer();
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      /** @type {HTMLElement | null} */ ($('#expression'))?.focus();
    }, 0);
  }

  /** @param {string} expression */
  openWithExpression(expression) {
    expressionInput().value = expression;
    this.open();
  }

  close() {
    this.clearFocusTimer();
    this.panel.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.previousFocus?.focus();
  }

  clearFocusTimer() {
    if (this.focusTimer === null) return;
    clearTimeout(this.focusTimer);
    this.focusTimer = null;
  }

  /** @param {Event} event */
  calculate(event) {
    event.preventDefault();
    const expression = expressionInput().value;
    try {
      const result = calculateExpression(expression, { angleMode: this.angleMode });
      this.currentResult = { expression, result };
      requireElement('#result-value').textContent = result;
      requireElement('#result-value').classList.remove('error');
      /** @type {HTMLButtonElement} */ (requireElement('#pin-result')).disabled = false;
      this.calculations.unshift(this.currentResult);
      this.calculations = this.calculations.slice(0, 6);
      localStorage.setItem(CALCULATIONS_STORAGE_KEY, JSON.stringify(this.calculations));
      this.renderHistory();
    } catch (error) {
      this.currentResult = null;
      requireElement('#result-value').textContent = errorMessage(error);
      requireElement('#result-value').classList.add('error');
      /** @type {HTMLButtonElement} */ (requireElement('#pin-result')).disabled = true;
    }
  }

  /** @param {string} insertion */
  insert(insertion) {
    const input = expressionInput();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + insertion + input.value.slice(end);
    const emptyGroup = insertion.indexOf('()');
    const cursor =
      emptyGroup >= 0
        ? start + emptyGroup + 1
        : start +
          (insertion === '\\frac{}{}' ? 6 : insertion === '\\sqrt{}' ? 6 : insertion.length);
    input.setSelectionRange(cursor, cursor);
    input.focus();
  }

  renderHistory() {
    const list = /** @type {HTMLElement} */ (requireElement('#history-list'));
    if (!this.calculations.length) {
      list.innerHTML = '<p>No calculations yet.</p>';
      return;
    }
    list.innerHTML = this.calculations
      .map(
        (item, index) => `
      <div class="history-row" data-history="${index}"><span>${escapeHtml(item.expression)}</span><b>${escapeHtml(item.result)}</b></div>
    `,
      )
      .join('');
  }

  /** @param {Event} event */
  selectHistoryEntry(event) {
    if (!(event.target instanceof Element) || !(event.currentTarget instanceof Element)) return;
    const row = /** @type {HTMLElement | null} */ (event.target.closest('[data-history]'));
    if (!row || !event.currentTarget.contains(row)) return;
    const item = this.calculations[Number(row.dataset.history)];
    if (!item) return;
    expressionInput().value = item.expression;
    this.currentResult = item;
    requireElement('#result-value').textContent = item.result;
    requireElement('#result-value').classList.remove('error');
    /** @type {HTMLButtonElement} */ (requireElement('#pin-result')).disabled = false;
  }

  clearHistory() {
    this.calculations = [];
    localStorage.removeItem(CALCULATIONS_STORAGE_KEY);
    this.renderHistory();
  }

  /** @returns {Calculation[]} */
  loadCalculations() {
    const serialized = localStorage.getItem(CALCULATIONS_STORAGE_KEY);
    if (serialized === null) return [];

    /** @type {unknown} */
    const stored = JSON.parse(serialized);
    if (!Array.isArray(stored) || !stored.every(isCalculation)) {
      throw new TypeError('Stored calculator history is invalid.');
    }
    return stored;
  }

  clearExpression() {
    expressionInput().value = '';
    this.currentResult = null;
    requireElement('#result-value').textContent = '—';
    requireElement('#result-value').classList.remove('error');
    /** @type {HTMLButtonElement} */ (requireElement('#pin-result')).disabled = true;
    expressionInput().focus();
  }

  backspace() {
    const input = expressionInput();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start === end && start > 0) {
      input.value = input.value.slice(0, start - 1) + input.value.slice(end);
      input.setSelectionRange(start - 1, start - 1);
    } else {
      input.value = input.value.slice(0, start) + input.value.slice(end);
      input.setSelectionRange(start, start);
    }
    input.focus();
  }

  toggleAngleMode() {
    this.angleMode = this.angleMode === 'RAD' ? 'DEG' : 'RAD';
    const button = $('#angle-mode');
    if (!button) return;
    button.textContent = this.angleMode;
    button.setAttribute('aria-label', `Angle mode: ${this.angleMode}`);
  }

  /** @param {KeyboardEvent} event */
  handleKeydown(event) {
    if (!this.panel.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = /** @type {HTMLElement[]} */ ([
      ...this.panel.querySelectorAll('button:not([disabled]), input'),
    ]);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  pinResult() {
    if (!this.currentResult) return;
    this.onPinResult(this.currentResult);
    this.close();
  }
}
