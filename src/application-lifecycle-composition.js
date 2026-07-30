/**
 * @typedef {import('./application-contracts.js').ApplicationLifecycle} ApplicationLifecycle
 * @typedef {import('./application-contracts.js').ApplicationLifecycleDependencies} ApplicationLifecycleDependencies
 * @typedef {import('./application-contracts.js').LifecycleStage} LifecycleStage
 */

/**
 * @param {ApplicationLifecycleDependencies} dependencies
 * @returns {ApplicationLifecycle}
 */
export function composeApplicationLifecycle({
  paper,
  desktopShellController,
  appearanceController,
  projectMenuController,
  calculatorAndCards,
  sketchCanvasController,
  projectsComposition,
  lessonsComposition,
  projectStore,
  loadDrawing,
  renderProjects,
  showSketchPage,
  coach,
  pageInterpretationController,
  navigationComposition,
  previewExport,
  importExportComposition,
  toastController,
  resizeCanvas,
  ResizeObserverConstructor = globalThis.ResizeObserver,
}) {
  /** @type {ResizeObserver | null} */
  let paperResizeObserver = null;
  let started = false;
  /** @type {LifecycleStage[]} */
  let startedStages = [];

  /** @type {LifecycleStage[]} */
  const lifecycleStages = [
    {
      stop: () => toastController.destroy(),
    },
    {
      start: () => desktopShellController.initialize(),
      stop: () => desktopShellController.destroy(),
    },
    {
      start: () => appearanceController.initialize(),
      stop: () => appearanceController.destroy(),
    },
    {
      start: () => projectMenuController?.initialize(),
      stop: () => projectMenuController?.destroy(),
    },
    {
      start: () => projectStore.initialize(),
    },
    {
      start: () => calculatorAndCards.initialize(),
      stop: () => calculatorAndCards.destroy(),
    },
    {
      start: () => sketchCanvasController.initialize(),
      stop: () => sketchCanvasController.destroy(),
    },
    {
      start: () => previewExport.initialize(),
      stop: () => previewExport.destroy(),
    },
    {
      start: () => coach.initialize(),
      stop: () => coach.destroy(),
    },
    {
      start: () => pageInterpretationController.initialize(),
      stop: () => pageInterpretationController.destroy(),
    },
    {
      start: () => lessonsComposition.initialize(),
      stop: () => lessonsComposition.destroy(),
    },
    {
      start: () => navigationComposition.initialize(),
      stop: () => navigationComposition.destroy(),
    },
    {
      start: () => projectsComposition.initialize(),
      stop: () => projectsComposition.destroy(),
    },
    {
      start: () => importExportComposition.initialize(),
      stop: () => importExportComposition.destroy(),
    },
    {
      start() {
        lessonsComposition.ensureModalRoot();
        loadDrawing();
        renderProjects();
        lessonsComposition.renderLessons();
        showSketchPage();
      },
    },
    {
      start() {
        paperResizeObserver = new ResizeObserverConstructor(resizeCanvas);
        paperResizeObserver.observe(paper);
      },
      stop() {
        paperResizeObserver?.disconnect();
        paperResizeObserver = null;
      },
    },
  ];

  function stopStartedStages() {
    const errors = [];
    while (startedStages.length) {
      const stage = startedStages.pop();
      if (!stage) continue;
      try {
        stage.stop?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Application teardown failed.');
  }

  return {
    start() {
      if (started) return;
      started = true;
      try {
        for (const stage of lifecycleStages) {
          startedStages.push(stage);
          stage.start?.();
        }
      } catch (error) {
        started = false;
        try {
          stopStartedStages();
        } catch (teardownError) {
          throw new AggregateError(
            [error, teardownError],
            'Application startup and rollback failed.',
          );
        }
        throw error;
      }
    },

    destroy() {
      if (!started) return;
      started = false;
      stopStartedStages();
    },
  };
}
