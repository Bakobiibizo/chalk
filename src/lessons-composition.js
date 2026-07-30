/**
 * @typedef {object} LessonNavigationOptions
 * @property {typeof import('./dom.js').$} $
 * @property {typeof import('./dom.js').$$} $$
 * @property {() => void} openLessonLibrary
 * @property {() => void} hideLessonModal
 *
 * @typedef {object} LessonNavigationComposition
 * @property {() => void} initialize
 * @property {() => void} destroy
 *
 * @typedef {readonly [EventTarget | null, string, EventListener]} LessonNavigationListener
 */

/**
 * @param {LessonNavigationOptions} options
 * @returns {LessonNavigationComposition}
 */
export function composeLessonNavigation({ $, $$, openLessonLibrary, hideLessonModal }) {
  const createButtons = ['#create-lesson', '#add-lesson', '#empty-create'].map((selector) =>
    $(selector),
  );
  const closeButton = $('#close-lesson-modal');
  const lessonsButton = $('[data-page="lessons"]');
  let initialized = false;

  const closeLessonModal = () => {
    hideLessonModal();
    const detail = /** @type {HTMLElement} */ ($('#lesson-detail'));
    if (!detail.classList.contains('open')) {
      /** @type {HTMLElement} */ ($('#lessons-view')).classList.remove(
        'active',
        'integrated-lesson-panel',
      );
      /** @type {HTMLElement} */ ($('.workspace')).classList.remove('lesson-integrated');
      /** @type {HTMLElement[]} */ ($$('[data-page]')).forEach((button) =>
        button.classList.toggle('active', button.dataset.page === 'sketch'),
      );
    }
  };
  /** @param {Event} event */
  const openLessonLibraryFromPointer = (event) => {
    event.preventDefault();
    openLessonLibrary();
  };
  /** @param {KeyboardEvent} event */
  const openLessonLibraryFromKeyboard = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLessonLibrary();
    }
  };

  /** @type {LessonNavigationListener[]} */
  const listeners = [
    ...createButtons.map(
      (button) => /** @type {LessonNavigationListener} */ ([button, 'click', openLessonLibrary]),
    ),
    [closeButton, 'click', closeLessonModal],
    [lessonsButton, 'pointerup', openLessonLibraryFromPointer],
    [lessonsButton, 'keydown', /** @type {EventListener} */ (openLessonLibraryFromKeyboard)],
  ];

  return {
    initialize() {
      if (initialized) return;
      initialized = true;
      for (const [target, type, listener] of listeners) {
        target?.addEventListener(type, listener);
      }
    },

    destroy() {
      if (!initialized) return;
      initialized = false;
      for (const [target, type, listener] of listeners) {
        target?.removeEventListener(type, listener);
      }
    },
  };
}
