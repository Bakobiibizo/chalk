/**
 * Shared contracts for browser application composition and lifecycle ownership.
 *
 * @typedef {import('./coach-contracts.js').CoachService} CoachService
 * @typedef {import('./lessons-application-composition.js').LessonsApplicationComposition} LessonsApplicationComposition
 *
 * @typedef {{
 *   initialize: () => void,
 *   destroy: () => void,
 * }} InitializableLifecycle
 *
 * @typedef {{
 *   start: () => void,
 *   destroy: () => void,
 * }} ApplicationLifecycle
 *
 * @typedef {{
 *   initialize: () => void,
 *   ensureModalRoot: () => void,
 *   renderLessons: () => void,
 *   destroy: () => void,
 * }} LessonsLifecyclePort
 *
 * @typedef {{
 *   initialize: () => void,
 * }} ProjectStoreLifecyclePort
 *
 * @typedef {{
 *   destroy: () => void,
 * }} DestroyablePort
 *
 * @typedef {{
 *   start?: () => void,
 *   stop?: () => void,
 * }} LifecycleStage
 *
 * @typedef {object} ApplicationLifecycleDependencies
 * @property {Element} paper
 * @property {InitializableLifecycle} desktopShellController
 * @property {InitializableLifecycle} appearanceController
 * @property {InitializableLifecycle | null | undefined} [projectMenuController]
 * @property {InitializableLifecycle} calculatorAndCards
 * @property {InitializableLifecycle} sketchCanvasController
 * @property {InitializableLifecycle} projectsComposition
 * @property {LessonsLifecyclePort} lessonsComposition
 * @property {ProjectStoreLifecyclePort} projectStore
 * @property {() => void} loadDrawing
 * @property {() => void} renderProjects
 * @property {() => void} showSketchPage
 * @property {InitializableLifecycle} coach
 * @property {InitializableLifecycle} pageInterpretationController
 * @property {InitializableLifecycle} navigationComposition
 * @property {InitializableLifecycle} previewExport
 * @property {InitializableLifecycle} importExportComposition
 * @property {DestroyablePort} toastController
 * @property {() => void} resizeCanvas
 * @property {{saveDrawing: () => void, loadDrawing: () => void}} drawingSessionCoordinator
 * @property {typeof ResizeObserver} [ResizeObserverConstructor]
 */

export {};
