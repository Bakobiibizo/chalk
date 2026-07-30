/**
 * @typedef {object} LessonPracticeElements
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLElement} paper
 * @property {HTMLElement} emptyState
 * @property {HTMLElement} selectionBox
 * @property {HTMLButtonElement} undoButton
 * @property {HTMLButtonElement} clearButton
 * @property {HTMLElement[]} toolButtons
 * @property {HTMLElement} inputLabel
 *
 * @typedef {object} LessonDetailTransientElements
 * @property {HTMLButtonElement} completeButton
 * @property {HTMLButtonElement} practiceButton
 * @property {HTMLButtonElement} askCoachButton
 * @property {HTMLButtonElement | null} nextGraphNodeButton
 * @property {LessonPracticeElements} practice
 */

/**
 * @template {Element} ElementType
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {ElementType}
 */
const selectRequired = (root, selector) => {
  return /** @type {ElementType} */ (root.querySelector(selector));
};

/**
 * @param {HTMLElement} content
 * @returns {LessonDetailTransientElements}
 */
export function resolveLessonDetailTransientElements(content) {
  return {
    completeButton: selectRequired(content, '[data-complete]'),
    practiceButton: selectRequired(content, '[data-practice]'),
    askCoachButton: selectRequired(content, '[data-ask-lesson]'),
    nextGraphNodeButton: content.querySelector('[data-next-graph-node]'),
    practice: {
      canvas: selectRequired(content, '.lesson-practice-canvas'),
      paper: selectRequired(content, '.lesson-practice-paper'),
      emptyState: selectRequired(content, '.lesson-practice-empty'),
      selectionBox: selectRequired(content, '.lesson-selection-box'),
      undoButton: selectRequired(content, '[data-practice-undo]'),
      clearButton: selectRequired(content, '[data-practice-clear]'),
      toolButtons: /** @type {HTMLElement[]} */ ([
        ...content.querySelectorAll('[data-practice-tool]'),
      ]),
      inputLabel: selectRequired(content, '.practice-input-status'),
    },
  };
}
