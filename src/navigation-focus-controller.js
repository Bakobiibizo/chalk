import { $, $$, requireElement } from './dom.js';

/** @typedef {'sketch' | 'lessons'} ApplicationPage */

export class NavigationFocusController {
  /**
   * @param {{
   *   resizeCanvas: () => void,
   *   showToast: (message: string) => void,
   *   openLessonLibrary: () => void,
   *   clearActiveLesson: () => void,
   * }} options
   */
  constructor({ resizeCanvas, showToast, openLessonLibrary, clearActiveLesson }) {
    this.resizeCanvas = resizeCanvas;
    this.showToast = showToast;
    this.openLessonLibrary = openLessonLibrary;
    this.clearActiveLesson = clearActiveLesson;
    /** @type {AbortController | null} */
    this.abortController = null;
  }

  initialize() {
    if (this.abortController) return;
    this.abortController = new window.AbortController();
    const options = { signal: this.abortController.signal };
    requireElement('#focus-trigger').addEventListener(
      'click',
      () => this.toggleFocusMode(),
      options,
    );
    requireElement('#focus-canvas').addEventListener(
      'click',
      () => this.toggleFocusMode(),
      options,
    );
    document.addEventListener('fullscreenchange', () => this.handleFullscreenChange(), options);
    $$('[data-page]').forEach((button) =>
      button.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          if (button.dataset.page === 'lessons') this.openLessonLibrary();
          else this.showPage('sketch');
        },
        options,
      ),
    );
    document.addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return;
        const lessonsButton = event.target.closest('[data-page="lessons"]');
        if (!lessonsButton) return;
        event.preventDefault();
        this.openLessonLibrary();
      },
      { capture: true, signal: this.abortController.signal },
    );
    window.addEventListener('hashchange', () => this.showPage('sketch', false), options);
  }

  bind() {
    this.initialize();
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** @param {boolean} enabled */
  async setFocusMode(enabled) {
    requireElement('#app').classList.toggle('focus-mode', enabled);
    if (enabled) {
      $('#math-panel')?.classList.remove('open');
      $('#coach-panel')?.classList.remove('open');
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        }
      } catch {
        this.showToast('Focus mode is on. Your browser kept its navigation bar visible.');
      }
      this.showToast('Focus canvas · P pen · E eraser · F to exit');
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }
    requestAnimationFrame(this.resizeCanvas);
  }

  toggleFocusMode() {
    return this.setFocusMode(!requireElement('#app').classList.contains('focus-mode'));
  }

  handleFullscreenChange() {
    if (!document.fullscreenElement && requireElement('#app').classList.contains('focus-mode')) {
      requireElement('#app').classList.remove('focus-mode');
      requestAnimationFrame(this.resizeCanvas);
    }
  }

  /**
   * @param {ApplicationPage} [page]
   * @param {boolean} [updateHash]
   */
  showPage(page = 'sketch', updateHash = true) {
    requireElement('#sketch-view').classList.add('active');
    if (page !== 'lessons') {
      requireElement('#lessons-view').classList.remove('active', 'integrated-lesson-panel');
      requireElement('.workspace').classList.remove('lesson-integrated');
      requireElement('#lesson-detail').classList.remove('open');
      this.clearActiveLesson();
    }
    $$('[data-page]').forEach((button) =>
      button.classList.toggle(
        'active',
        button.dataset.page === (page === 'lessons' ? 'lessons' : 'sketch'),
      ),
    );
    $$('.sketch-action').forEach((action) => {
      action.style.display = '';
    });
    /** @type {HTMLElement} */ (requireElement('.document-title')).style.visibility = 'visible';
    if (updateHash && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    requestAnimationFrame(this.resizeCanvas);
  }
}
