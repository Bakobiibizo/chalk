import { NavigationFocusController } from './navigation-focus-controller.js';
import { ShortcutsController } from './shortcuts-controller.js';

/**
 * @typedef {import('./application-contracts.js').InitializableLifecycle} InitializableLifecycle
 * @typedef {import('./lessons-application-composition.js').LessonsApplicationComposition} LessonsApplicationComposition
 * @typedef {import('./sketch-canvas-controller.js').SketchCanvasController} SketchCanvasController
 *
 * @typedef {object} NavigationComposition
 * @property {NavigationFocusController} navigation
 * @property {ShortcutsController} shortcuts
 * @property {(page?: 'sketch' | 'lessons', updateHash?: boolean) => void} showPage
 * @property {() => void} initialize
 * @property {() => void} destroy
 */

/**
 * @param {{
 *   $: (selector: string) => HTMLElement,
 *   showToast: (message: string) => void,
 *   sketchCanvasController: SketchCanvasController,
 *   lessonsComposition: LessonsApplicationComposition,
 *   undoButton: HTMLButtonElement,
 *   redoButton: HTMLButtonElement,
 * }} options
 * @returns {NavigationComposition}
 */
export function composeNavigation({
  $,
  showToast,
  sketchCanvasController,
  lessonsComposition,
  undoButton,
  redoButton,
}) {
  const navigation = new NavigationFocusController({
    resizeCanvas: () => sketchCanvasController.resize(),
    showToast,
    openLessonLibrary: () => lessonsComposition.openLessonLibrary(),
    clearActiveLesson: () => lessonsComposition.clearActiveLesson(),
  });
  /**
   * @param {'sketch' | 'lessons'} [page]
   * @param {boolean} [updateHash]
   */
  const showPage = (page = 'sketch', updateHash = true) => navigation.showPage(page, updateHash);

  const shortcuts = new ShortcutsController({
    isLessonOpen: () => $('#lesson-detail').classList.contains('open'),
    getLessonPracticeController: () => lessonsComposition.getPracticeController(),
    undo: () => undoButton.click(),
    redo: () => redoButton.click(),
    setTool: (tool) => sketchCanvasController.setTool(tool),
    toggleFocusMode: () => navigation.toggleFocusMode(),
    isFocusMode: () => $('#app').classList.contains('focus-mode'),
    exitFocusMode: () => navigation.setFocusMode(false),
    isLessonModalOpen: () => $('#lesson-modal').classList.contains('open'),
    hideLessonModal: () => lessonsComposition.hideLessonModal(),
    setPenSize: (size) => sketchCanvasController.setPenSize(size),
    getPenSize: () => sketchCanvasController.getPenSize(),
    deleteSelection: () => sketchCanvasController.deleteSelection(),
    isSketchActive: () => $('#sketch-view').classList.contains('active'),
  });
  return {
    navigation,
    shortcuts,
    showPage,
    initialize() {
      navigation.initialize();
      shortcuts.initialize();
    },
    destroy() {
      shortcuts.destroy();
      navigation.destroy();
    },
  };
}
