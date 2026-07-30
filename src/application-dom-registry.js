/**
 * @typedef {object} ApplicationDomElements
 * @property {HTMLElement | null} root
 * @property {HTMLElement | null} toast
 * @property {HTMLElement | null} workspace
 * @property {HTMLElement[]} pageButtons
 *
 * @typedef {object} SketchDomElements
 * @property {HTMLElement | null} view
 * @property {HTMLCanvasElement | null} canvas
 * @property {HTMLElement | null} paper
 * @property {HTMLElement | null} emptyState
 * @property {HTMLElement | null} selectionBox
 * @property {HTMLButtonElement | null} undoButton
 * @property {HTMLButtonElement | null} redoButton
 * @property {HTMLElement | null} inputStatus
 * @property {HTMLInputElement | null} pageTitle
 * @property {HTMLButtonElement | null} exportButton
 * @property {HTMLButtonElement | null} newPageButton
 *
 * @typedef {object} LessonDomElements
 * @property {HTMLElement | null} view
 * @property {HTMLElement | null} modal
 * @property {HTMLElement | null} detail
 * @property {HTMLElement | null} detailContent
 * @property {HTMLFormElement | null} form
 * @property {HTMLTextAreaElement | null} goal
 * @property {HTMLSelectElement | null} level
 * @property {HTMLElement | null} generating
 *
 * @typedef {object} CoachDomElements
 * @property {HTMLTextAreaElement | null} prompt
 *
 * @typedef {{
 *   application: ApplicationDomElements,
 *   sketch: SketchDomElements,
 *   lessons: LessonDomElements,
 *   coach: CoachDomElements,
 * }} ApplicationDomRegistry
 *
 * @typedef {object} ResolvedApplicationDomElements
 * @property {HTMLElement} root
 * @property {HTMLElement} toast
 * @property {HTMLElement} workspace
 * @property {HTMLElement[]} pageButtons
 *
 * @typedef {object} ResolvedSketchDomElements
 * @property {HTMLElement} view
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLElement} paper
 * @property {HTMLElement} emptyState
 * @property {HTMLElement} selectionBox
 * @property {HTMLButtonElement} undoButton
 * @property {HTMLButtonElement} redoButton
 * @property {HTMLElement} inputStatus
 * @property {HTMLInputElement} pageTitle
 * @property {HTMLButtonElement} exportButton
 * @property {HTMLButtonElement} newPageButton
 *
 * @typedef {object} ResolvedLessonDomElements
 * @property {HTMLElement} view
 * @property {HTMLElement} modal
 * @property {HTMLElement} detail
 * @property {HTMLElement} detailContent
 * @property {HTMLFormElement} form
 * @property {HTMLTextAreaElement} goal
 * @property {HTMLSelectElement} level
 * @property {HTMLElement} generating
 *
 * @typedef {object} ResolvedCoachDomElements
 * @property {HTMLTextAreaElement} prompt
 *
 * @typedef {{
 *   application: ResolvedApplicationDomElements,
 *   sketch: ResolvedSketchDomElements,
 *   lessons: ResolvedLessonDomElements,
 *   coach: ResolvedCoachDomElements,
 * }} ResolvedApplicationDomRegistry
 */

/**
 * @template {Element} ElementType
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {ElementType | null}
 */
const select = (root, selector) => /** @type {ElementType | null} */ (root.querySelector(selector));

/**
 * @template {Element} ElementType
 * @param {ElementType | null} element
 * @param {string} selector
 * @returns {ElementType}
 */
function requireRegisteredElement(element, selector) {
  if (!element) throw new Error(`Required application DOM element not found: ${selector}`);
  return element;
}

/**
 * @param {ParentNode} [root]
 * @returns {ApplicationDomRegistry}
 */
export function createApplicationDomRegistry(root = document) {
  return {
    application: {
      root: select(root, '#app'),
      toast: select(root, '#toast'),
      workspace: select(root, '.workspace'),
      pageButtons: /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-page]')]),
    },
    sketch: {
      view: select(root, '#sketch-view'),
      canvas: select(root, '#canvas'),
      paper: select(root, '#paper'),
      emptyState: select(root, '#empty-state'),
      selectionBox: select(root, '#selection-box'),
      undoButton: select(root, '#undo'),
      redoButton: select(root, '#redo'),
      inputStatus: select(root, '#input-status'),
      pageTitle: select(root, '#page-title'),
      exportButton: select(root, '#export'),
      newPageButton: select(root, '#new-page'),
    },
    lessons: {
      view: select(root, '#lessons-view'),
      modal: select(root, '#lesson-modal'),
      detail: select(root, '#lesson-detail'),
      detailContent: select(root, '#lesson-detail-content'),
      form: select(root, '#lesson-form'),
      goal: select(root, '#lesson-goal'),
      level: select(root, '#lesson-level'),
      generating: select(root, '#lesson-generating'),
    },
    coach: {
      prompt: select(root, '#coach-prompt'),
    },
  };
}

/**
 * Validate the nullable query results once at the composition boundary.
 *
 * @param {ApplicationDomRegistry} registry
 * @returns {ResolvedApplicationDomRegistry}
 */
export function resolveApplicationDomRegistry(registry) {
  const { application, sketch, lessons, coach } = registry;
  return {
    application: {
      root: requireRegisteredElement(application.root, '#app'),
      toast: requireRegisteredElement(application.toast, '#toast'),
      workspace: requireRegisteredElement(application.workspace, '.workspace'),
      pageButtons: application.pageButtons,
    },
    sketch: {
      view: requireRegisteredElement(sketch.view, '#sketch-view'),
      canvas: requireRegisteredElement(sketch.canvas, '#canvas'),
      paper: requireRegisteredElement(sketch.paper, '#paper'),
      emptyState: requireRegisteredElement(sketch.emptyState, '#empty-state'),
      selectionBox: requireRegisteredElement(sketch.selectionBox, '#selection-box'),
      undoButton: requireRegisteredElement(sketch.undoButton, '#undo'),
      redoButton: requireRegisteredElement(sketch.redoButton, '#redo'),
      inputStatus: requireRegisteredElement(sketch.inputStatus, '#input-status'),
      pageTitle: requireRegisteredElement(sketch.pageTitle, '#page-title'),
      exportButton: requireRegisteredElement(sketch.exportButton, '#export'),
      newPageButton: requireRegisteredElement(sketch.newPageButton, '#new-page'),
    },
    lessons: {
      view: requireRegisteredElement(lessons.view, '#lessons-view'),
      modal: requireRegisteredElement(lessons.modal, '#lesson-modal'),
      detail: requireRegisteredElement(lessons.detail, '#lesson-detail'),
      detailContent: requireRegisteredElement(lessons.detailContent, '#lesson-detail-content'),
      form: requireRegisteredElement(lessons.form, '#lesson-form'),
      goal: requireRegisteredElement(lessons.goal, '#lesson-goal'),
      level: requireRegisteredElement(lessons.level, '#lesson-level'),
      generating: requireRegisteredElement(lessons.generating, '#lesson-generating'),
    },
    coach: {
      prompt: requireRegisteredElement(coach.prompt, '#coach-prompt'),
    },
  };
}
