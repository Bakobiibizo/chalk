/**
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-payload-contract.js').ProjectCard} ProjectCard
 * @typedef {import('./project-payload-contract.js').ProjectPage} ProjectPage
 * @typedef {import('./project-payload-contract.js').ProjectStroke} ProjectStroke
 * @typedef {import('./project-payload-contract.js').ProjectCoachThread} ProjectCoachThread
 *
 * @typedef {object} DrawingSessionCoordinatorOptions
 * @property {{pageTitle: {value: string}}} sketch
 * @property {() => Project | null | undefined} activeSession
 * @property {() => ProjectPage | null | undefined} activePage
 * @property {(project: Project) => ProjectCoachThread | null | undefined} ensureCoachThreads
 * @property {() => void} persistSession
 * @property {{
 *   getStrokes: () => ProjectStroke[],
 *   loadStrokes: (strokes: ProjectStroke[]) => void,
 *   redraw: () => void,
 * }} sketchCanvasController
 * @property {{
 *   getCards: () => ProjectCard[],
 *   setCards: (cards: ProjectCard[]) => void,
 * }} mathCardsController
 * @property {{restoreForSession: () => void}} coachPanelUI
 * @property {{renderProjects: () => void, renderPages: () => void}} projectsComposition
 * @property {() => string} [currentTimestamp]
 *
 * @typedef {object} DrawingSessionCoordinator
 * @property {() => void} saveDrawing
 * @property {() => void} loadDrawing
 */

/**
 * @param {DrawingSessionCoordinatorOptions} options
 * @returns {DrawingSessionCoordinator}
 */
export function createDrawingSessionCoordinator({
  sketch,
  activeSession,
  activePage,
  ensureCoachThreads,
  persistSession,
  sketchCanvasController,
  mathCardsController,
  coachPanelUI,
  projectsComposition,
  currentTimestamp = () => new Date().toISOString(),
}) {
  function saveDrawing() {
    const project = activeSession();
    const page = activePage();
    if (!project || !page) return;

    project.title = sketch.pageTitle.value.trim() || 'Untitled project';
    page.strokes = sketchCanvasController.getStrokes();
    page.cards = mathCardsController.getCards();
    page.updatedAt = currentTimestamp();
    project.updatedAt = page.updatedAt;
    persistSession();
    projectsComposition.renderProjects();
    projectsComposition.renderPages();
  }

  function loadDrawing() {
    const project = activeSession();
    const page = activePage();
    if (!project || !page) return;

    sketchCanvasController.loadStrokes(page.strokes);
    mathCardsController.setCards(page.cards || []);
    sketch.pageTitle.value = project.title || 'Untitled project';
    const thread = ensureCoachThreads(project);
    project.codexThreadId = thread?.codexThreadId || project.codexThreadId || null;
    coachPanelUI.restoreForSession();
    projectsComposition.renderPages();
    sketchCanvasController.redraw();
  }

  return {
    saveDrawing,
    loadDrawing,
  };
}
