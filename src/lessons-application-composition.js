import { $, $$ } from './dom.js';
import { LessonLibraryUI } from './lesson-library-ui.js';
import { LessonDetailUI } from './lesson-detail-ui.js';
import { LessonPracticeController } from './lesson-practice-controller.js';
import { LessonLayoutController } from './lesson-layout-controller.js';
import { composeLessonGeneration } from './lesson-generation-composition.js';
import { resolveLessonDetailTransientElements } from './lesson-detail-dom.js';
import { LessonProgressionService } from './lesson-progression-service.js';
import { composeLessonNavigation } from './lessons-composition.js';

/**
 * @typedef {import('./active-lesson-selection.js').ActiveLessonSelection} ActiveLessonSelection
 * @typedef {import('./lesson-detail-dom.js').LessonPracticeElements} LessonPracticeElements
 * @typedef {import('./lesson-detail-ui.js').LessonDetailPersistentElements} LessonDetailPersistentElements
 * @typedef {import('./lesson-generation-composition.js').LessonGenerationElements} LessonGenerationElements
 * @typedef {import('./lesson-generation-composition.js').ModelJsonDesktopBridge} ModelJsonDesktopBridge
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-store.js').LessonStore} LessonStore
 *
 * @typedef {LessonGenerationElements & {
 *   modal: HTMLElement | null,
 *   detail: HTMLElement,
 * }} LessonsApplicationElements
 *
 * @typedef {{
 *   run: (prompt: string, threadId: string | null) => Promise<string>,
 *   isActive: boolean,
 * }} LessonsCoachService
 *
 * @typedef {object} LessonsApplicationOptions
 * @property {{root: HTMLElement | null}} application
 * @property {LessonsApplicationElements} lessons
 * @property {ModelJsonDesktopBridge | null | undefined} desktopBridge
 * @property {LessonStore} lessonStore
 * @property {ActiveLessonSelection} activeLessonSelection
 * @property {LessonsCoachService} coachService
 * @property {(root: HTMLElement) => void} renderLatex
 * @property {{open: () => void}} coach
 * @property {{saveDrawing: () => void}} drawingCommands
 * @property {(message: string) => void} showToast
 * @property {{resize: () => void}} sketchCanvasController
 * @property {LessonDetailPersistentElements} lessonDetailElements
 *
 * @typedef {object} LessonsApplicationComposition
 * @property {LessonStore} store
 * @property {() => void} initialize
 * @property {() => void} ensureModalRoot
 * @property {() => void} renderLessons
 * @property {() => void} openLessonLibrary
 * @property {() => void} hideLessonModal
 * @property {() => void} clearActiveLesson
 * @property {() => Lesson | null} getActiveLesson
 * @property {() => LessonPracticeController | null} getPracticeController
 * @property {() => void} destroy
 */

/**
 * @param {LessonsApplicationOptions} options
 * @returns {LessonsApplicationComposition}
 */
export function composeLessonsApplication({
  application,
  lessons,
  desktopBridge,
  lessonStore,
  activeLessonSelection,
  coachService,
  renderLatex,
  coach,
  drawingCommands,
  showToast,
  sketchCanvasController,
  lessonDetailElements,
}) {
  const store = lessonStore;
  /** @type {LessonPracticeController | null} */
  let practiceController = null;
  const layoutController = new LessonLayoutController({
    workspace: /** @type {HTMLElement} */ ($('.workspace')),
    sketchPane: /** @type {HTMLElement} */ ($('#sketch-view')),
    lessonPane: /** @type {HTMLElement} */ ($('#lessons-view')),
    coachPane: /** @type {HTMLElement | null} */ ($('#coach-panel')),
    toolbar: /** @type {HTMLElement | null} */ ($('#sketch-view .toolbar')),
    onResize: () => sketchCanvasController.resize(),
  });

  /** @returns {void} */
  function ensureModalRoot() {
    const modal = lessons.modal;
    const appRoot = application.root;
    if (modal && appRoot && modal.parentElement !== appRoot) appRoot.append(modal);
  }

  /** @returns {void} */
  function destroyPractice() {
    practiceController?.destroy();
    practiceController = null;
  }

  /**
   * @param {Lesson} lesson
   * @param {LessonPracticeElements} elements
   * @returns {LessonPracticeController}
   */
  function setupPractice(lesson, elements) {
    return new LessonPracticeController({
      lesson,
      ...elements,
      persistLesson: () => store.save(),
    });
  }

  /** @type {LessonDetailUI} */
  let lessonDetail;
  const lessonLibrary = new LessonLibraryUI({
    store,
    ensureModalRoot,
    openLesson: (id) => lessonDetail.open(id),
    deleteLesson,
  });

  /** @returns {void} */
  function renderLessons() {
    lessonLibrary.render();
  }
  /** @returns {void} */
  function renderLessonPicker() {
    return lessonLibrary.renderPicker();
  }
  /** @returns {void} */
  function hideLessonModal() {
    return lessonLibrary.hideModal();
  }
  /** @returns {void} */
  function clearLessonModalError() {
    return lessonLibrary.clearError();
  }
  /** @returns {void} */
  function openLessonLibrary() {
    return lessonLibrary.open();
  }
  /** @param {LessonIdentifier} id */
  function openLesson(id) {
    return lessonDetail.open(id);
  }

  /**
   * @param {string} message
   * @param {string} [detail]
   */
  function showLessonModalError(message, detail = '') {
    if (!lessonLibrary.showError(message, detail)) showToast(message);
  }

  /** @param {LessonIdentifier} id */
  function deleteLesson(id) {
    const lesson = store.lessons.find((item) => item.id === id);
    if (!lesson) return;
    if (!confirm(`Delete lesson “${lesson.title}”?`)) return;
    store.remove(id);
    renderLessons();
    renderLessonPicker();
    if (activeLessonSelection.getActiveLesson()?.id === id) {
      destroyPractice();
      lessons.detail.classList.remove('open');
      activeLessonSelection.clear();
    }
    showToast('Lesson deleted');
  }

  const lessonGeneration = composeLessonGeneration({
    lessons,
    desktopBridge,
    coachService,
    lessonStore: store,
    clearError: clearLessonModalError,
    showError: showLessonModalError,
    renderLessons,
    renderLessonPicker,
    hideLessonModal,
    openLesson,
  });
  const progressionService = new LessonProgressionService({
    store,
    coachService,
    parseModelJson: lessonGeneration.parseModelJson,
  });

  lessonDetail = new LessonDetailUI({
    persistentElements: lessonDetailElements,
    resolveTransientElements: resolveLessonDetailTransientElements,
    findLesson: (id) => store.find(id),
    toggleLessonCompleted: (id) => store.toggleCompleted(id),
    generateNextLesson: (lesson) => progressionService.generateNext(lesson),
    renderLatex,
    setupPractice: (lesson, elements) => {
      practiceController = setupPractice(lesson, elements);
    },
    destroyPractice,
    renderLessons,
    renderLessonPicker,
    openCoach: () => coach.open(),
    saveDrawing: drawingCommands.saveDrawing,
    showToast,
    setActiveLesson: (id) => {
      activeLessonSelection.select(id);
    },
    activateLayout: () => layoutController.activate(),
  });

  const lessonNavigation = composeLessonNavigation({
    $,
    $$,
    openLessonLibrary,
    hideLessonModal,
  });

  return {
    store,
    initialize() {
      lessonGeneration.initialize();
      lessonNavigation.initialize();
    },
    ensureModalRoot,
    renderLessons,
    openLessonLibrary,
    hideLessonModal,
    clearActiveLesson: () => {
      activeLessonSelection.clear();
    },
    getActiveLesson: () => activeLessonSelection.getActiveLesson(),
    getPracticeController: () => practiceController,
    destroy() {
      lessonNavigation.destroy();
      lessonGeneration.destroy();
      destroyPractice();
      layoutController.destroy();
    },
  };
}
