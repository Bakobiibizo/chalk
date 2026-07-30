import { PageTabsUI } from './page-tabs-ui.js';
import { ProjectsPanelUI } from './projects-panel-ui.js';

/**
 * @typedef {import('./coach-contracts.js').CoachService} CoachService
 * @typedef {import('./drawing-command-port.js').DrawingCommands} DrawingCommands
 * @typedef {import('./navigation-composition.js').NavigationComposition} NavigationComposition
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 * @typedef {import('./sketch-canvas-controller.js').SketchCanvasController} SketchCanvasController
 *
 * @typedef {object} ProjectsComposition
 * @property {ProjectStore} store
 * @property {() => void} initialize
 * @property {() => void} createProject
 * @property {() => void} renderPages
 * @property {() => void} renderProjects
 * @property {() => void} destroy
 */

/**
 * @param {{
 *   $: (selector: string) => HTMLElement,
 *   projectStore: ProjectStore,
 *   coachService: CoachService,
 *   drawingCommands: DrawingCommands,
 *   navigationComposition: NavigationComposition,
 *   sketchCanvasController: SketchCanvasController,
 *   newProjectButton: HTMLButtonElement,
 *   showToast: (message: string) => void,
 * }} options
 * @returns {ProjectsComposition}
 */
export function composeProjects({
  $,
  projectStore,
  coachService,
  drawingCommands,
  navigationComposition,
  sketchCanvasController,
  newProjectButton,
  showToast,
}) {
  const projectsPanel = new ProjectsPanelUI({
    projectStore,
    list: $('#sessions-list'),
    panel: $('#sessions-panel'),
    scrim: $('#panel-scrim'),
    openButton: $('#sessions-button'),
    closeButton: $('#close-sessions'),
    newButton: $('#new-session-row'),
    isBlocked: () => coachService.isActive,
    beforeChange: () => void drawingCommands.saveDrawing(),
    showToast,
    onProjectChanged: ({ focusTitle = false } = {}) => {
      void drawingCommands.loadDrawing();
      navigationComposition.showPage('sketch');
      requestAnimationFrame(() => {
        if (focusTitle) {
          const pageTitle = /** @type {HTMLInputElement} */ ($('#page-title'));
          pageTitle.focus();
          pageTitle.select();
        }
        sketchCanvasController.resize();
      });
    },
  });
  const pageTabs = new PageTabsUI({
    projectStore,
    tabs: $('#page-tabs'),
    isBlocked: () => coachService.isActive,
    beforeChange: () => void drawingCommands.saveDrawing(),
    showToast,
    onPageChanged: () => {
      void drawingCommands.loadDrawing();
      requestAnimationFrame(() => sketchCanvasController.resize());
    },
    onProjectsChanged: () => projectsPanel.render(),
  });
  return {
    store: projectStore,
    initialize() {
      projectsPanel.initialize();
      newProjectButton.addEventListener('click', projectsPanel.handleCreateProject);
    },
    createProject: () => projectsPanel.createProject(),
    renderPages: () => pageTabs.render(),
    renderProjects: () => projectsPanel.render(),
    destroy() {
      newProjectButton.removeEventListener('click', projectsPanel.handleCreateProject);
      projectsPanel.destroy();
    },
  };
}
