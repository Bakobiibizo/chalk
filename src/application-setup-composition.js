import renderMathInElement from 'katex/contrib/auto-render';
import { requireElement } from './dom.js';
import { createActiveLessonSelection } from './active-lesson-selection.js';
import { resolveApplicationDomRegistry } from './application-dom-registry.js';
import { ensureCoachThreads as ensureCoachThreadsWithRuntime } from './coach-panel-ui.js';
import { createRuntimeCoachIdentifier, currentCoachTime } from './coach-runtime-factories.js';
import { ToastController } from './toast-controller.js';
import { DesktopShellController } from './desktop-shell-controller.js';
import { AppearanceController } from './appearance-controller.js';
import { SketchCanvasController } from './sketch-canvas-controller.js';
import { composeCalculatorAndCards } from './calculator-cards-composition.js';
import { composeCoach, createCoachService } from './coach-composition.js';
import { composeImportExport } from './import-export-composition.js';
import { composeNavigation } from './navigation-composition.js';
import { composeProjects } from './projects-composition.js';
import { createApplicationSessionAdapters } from './application-session-adapters.js';
import { buildCoachRequest } from './coach-request-builder.js';
import { createDrawingCommandPort } from './drawing-command-port.js';
import { createDrawingSessionCoordinator } from './drawing-session-coordinator.js';
import { composeLessonsApplication } from './lessons-application-composition.js';
import { LessonStore } from './lesson-store.js';
import { composePreviewExport } from './preview-export-composition.js';
import { ProjectMenuController } from './project-menu-controller.js';
import { PageInterpretationController } from './page-interpretation-controller.js';
import { ProjectStore } from './project-store.js';

/**
 * @typedef {import('./application-contracts.js').ApplicationLifecycleDependencies} ApplicationLifecycleDependencies
 * @typedef {import('./application-dom-registry.js').ApplicationDomRegistry} ApplicationDomRegistry
 * @typedef {import('./storage.js').StorageDiagnostic} StorageDiagnostic
 */

/**
 * @param {ApplicationDomRegistry} unresolvedApplicationDom
 * @returns {ApplicationLifecycleDependencies}
 */
export function composeApplicationSetup(unresolvedApplicationDom) {
  const applicationDom = resolveApplicationDomRegistry(unresolvedApplicationDom);
  const { application, sketch, lessons, coach: coachDom } = applicationDom;
  const desktopShellController = new DesktopShellController();
  const desktopBridge = desktopShellController.desktopBridge;
  const createCoachTimestamp = () => currentCoachTime().toISOString();
  const coachRuntimeFactories = {
    createIdentifier: createRuntimeCoachIdentifier,
    createTimestamp: createCoachTimestamp,
  };
  /** @param {import('./coach-contracts.js').CoachSession | null | undefined} session */
  const normalizeCoachThreads = (session) =>
    ensureCoachThreadsWithRuntime(session, coachRuntimeFactories);

  /** @param {HTMLElement} element */
  function renderLatex(element) {
    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
      strict: 'ignore',
    });
  }

  const { canvas, paper, emptyState, undoButton, redoButton, inputStatus } = sketch;
  const toastController = new ToastController(application.toast);
  /** @param {string} message */
  const showToast = (message) => toastController.show(message);
  /** @param {StorageDiagnostic} diagnostic */
  const reportStorageDiagnostic = (diagnostic) => {
    console.error(`[${diagnostic.code}] ${diagnostic.message}`, diagnostic.error);
    showToast(diagnostic.message);
  };
  /** @param {string} selector @returns {HTMLElement} */
  const query = (selector) => requireElement(selector);
  const projectMenuController = new ProjectMenuController({
    button: /** @type {HTMLButtonElement} */ (query('#project-menu-button')),
    menu: query('#project-menu'),
  });

  const projectStore = new ProjectStore({
    normalizeSession: normalizeCoachThreads,
    onDiagnostic: reportStorageDiagnostic,
  });
  const sessionAdapters = createApplicationSessionAdapters({
    normalizeCoachThreads,
    projectStore,
  });
  const {
    activeSession,
    activePage: activeProjectPage,
    ensureCoachThreads,
    activeCoachThread,
    persistSession: persistSessionStore,
  } = sessionAdapters;

  const drawingCommandPort = createDrawingCommandPort();
  const drawingCommands = drawingCommandPort.commands;
  const calculatorAndCards = composeCalculatorAndCards({
    $: query,
    paper,
    drawingCommands,
    showToast,
  });
  const mathCardsController = calculatorAndCards.cards;
  const calculatorPanelController = calculatorAndCards.calculator;

  const sketchCanvasController = new SketchCanvasController({
    canvas,
    paper,
    emptyState,
    undoButton,
    redoButton,
    inputStatus,
    selectionBox: sketch.selectionBox,
    getCards: () => mathCardsController.getCards(),
    clearCards: () => mathCardsController.clear(),
    getActivePage: activeProjectPage,
    onSave: drawingCommands.saveDrawing,
    onToast: showToast,
  });

  const resizeCanvas = () => sketchCanvasController.resize();
  const appearanceController = new AppearanceController({ resizeCanvas });

  const previewExport = composePreviewExport({
    sketch,
    mathCardsController,
    projectStore,
    drawingCommands,
    showToast,
  });

  const lessonStore = new LessonStore(localStorage, {
    onDiagnostic: reportStorageDiagnostic,
  });
  const activeLessonSelection = createActiveLessonSelection({ lessonStore });
  /** @param {string} prompt */
  const prepareCoachRequest = (prompt) =>
    buildCoachRequest({
      prompt,
      sketch,
      activeLesson: activeLessonSelection.getActiveLesson(),
      pageImageDataURL: previewExport.createPageImageDataURL(),
    });

  const coachService = createCoachService({
    configuredUrl: import.meta.env.VITE_CODEX_APP_SERVER,
    desktopBridge,
    location,
    statusElement: query('#codex-status'),
    activeSession,
    activeThread: activeCoachThread,
    persistSession: persistSessionStore,
    createTimestamp: createCoachTimestamp,
  });
  const coach = composeCoach({
    coachService,
    desktopBridge,
    activeSession,
    persistSession: persistSessionStore,
    renderLatex,
    showToast,
    beforeOpen: () => calculatorPanelController.close(),
    prepareRequest: prepareCoachRequest,
    createIdentifier: createRuntimeCoachIdentifier,
    createTimestamp: createCoachTimestamp,
  });

  const pageInterpretationController = new PageInterpretationController({
    button: /** @type {HTMLButtonElement} */ (query('#interpret-page')),
    interpretPage: () =>
      coachService.run(
        `Transcribe all visible handwritten math and text from the attached page.
Return only the transcription, with no explanation or Markdown fences.
For a single mathematical expression, use calculator-friendly plain text such as *, /, ^, sqrt(), sin(), cos(), tan(), log(), ln(), pi, and e.
For notes or multiple lines, preserve their reading order as plain text.`,
        previewExport.createPageImageDataURL(),
      ),
    onInterpretation: (interpretation) =>
      calculatorPanelController.openWithExpression(interpretation),
    showToast,
  });

  const lessonsComposition = composeLessonsApplication({
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
    lessonDetailElements: {
      workspace: application.workspace,
      pageButtons: application.pageButtons,
      sketchView: sketch.view,
      pageTitle: sketch.pageTitle,
      lessonsView: lessons.view,
      detail: lessons.detail,
      content: lessons.detailContent,
      coachPrompt: coachDom.prompt,
    },
  });

  const navigationComposition = composeNavigation({
    $: query,
    showToast,
    sketchCanvasController,
    lessonsComposition,
    undoButton,
    redoButton,
  });

  const projects = composeProjects({
    $: query,
    projectStore,
    coachService,
    drawingCommands,
    navigationComposition,
    sketchCanvasController,
    newProjectButton: sketch.newPageButton,
    showToast,
  });

  const drawingSessionCoordinator = createDrawingSessionCoordinator({
    sketch,
    activeSession,
    activePage: activeProjectPage,
    ensureCoachThreads,
    persistSession: persistSessionStore,
    sketchCanvasController,
    mathCardsController,
    coachPanelUI: coach.panel,
    projectsComposition: projects,
  });
  drawingCommandPort.connect({ drawingSessionCoordinator, sketchCanvasController });

  const importExportComposition = composeImportExport({
    $: query,
    projectStore,
    prepareProject: ensureCoachThreads,
    drawingCommands,
    projectsComposition: projects,
    navigationComposition,
    lessonsComposition,
    showToast,
  });

  return {
    paper,
    desktopShellController,
    appearanceController,
    projectMenuController,
    calculatorAndCards,
    sketchCanvasController,
    projectsComposition: projects,
    lessonsComposition,
    projectStore,
    drawingSessionCoordinator,
    loadDrawing: drawingCommands.loadDrawing,
    renderProjects: projects.renderProjects,
    showSketchPage: () => navigationComposition.showPage('sketch', false),
    coach,
    pageInterpretationController,
    navigationComposition,
    previewExport,
    importExportComposition,
    toastController,
    resizeCanvas,
  };
}
