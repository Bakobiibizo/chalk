import { readJsonFile } from './storage.js';
import { ProjectImportExportService } from './project-import-export.js';

/**
 * @typedef {import('./drawing-command-port.js').DrawingCommands} DrawingCommands
 * @typedef {import('./lessons-application-composition.js').LessonsApplicationComposition} LessonsApplicationComposition
 * @typedef {import('./navigation-composition.js').NavigationComposition} NavigationComposition
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 * @typedef {import('./projects-composition.js').ProjectsComposition} ProjectsComposition
 *
 * @typedef {{initialize: () => void, destroy: () => void}} ImportExportComposition
 */

/**
 * @param {{
 *   $: (selector: string) => HTMLElement,
 *   projectStore: ProjectStore,
 *   prepareProject: (project: Project) => unknown,
 *   drawingCommands: DrawingCommands,
 *   projectsComposition: ProjectsComposition,
 *   navigationComposition: NavigationComposition,
 *   lessonsComposition: LessonsApplicationComposition,
 *   showToast: (message: string) => void,
 * }} options
 * @returns {ImportExportComposition}
 */
export function composeImportExport({
  $,
  projectStore,
  prepareProject,
  drawingCommands,
  projectsComposition,
  navigationComposition,
  lessonsComposition,
  showToast,
}) {
  const projects = new ProjectImportExportService(projectStore, { prepareProject });
  const exportProjectButton = $('#export-project');
  const importProjectButton = $('#import-project');
  const projectImportFile = /** @type {HTMLInputElement} */ ($('#project-import-file'));
  const exportLessonsButton = $('#export-lessons');
  const importLessonsButton = $('#import-lessons');
  const lessonImportFile = /** @type {HTMLInputElement} */ ($('#lesson-import-file'));
  let initialized = false;

  /**
   * @param {File | null | undefined} file
   * @param {(payload: unknown) => void} handler
   */
  const readImport = async (file, handler) => {
    try {
      await readJsonFile(file, handler);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not import file');
    }
  };
  /** @param {unknown} payload */
  const importProject = (payload) => {
    projects.importProject(payload);
    void drawingCommands.loadDrawing();
    projectsComposition.renderProjects();
    navigationComposition.showPage('sketch');
    showToast('Project imported');
  };

  const exportProject = () => {
    if (projects.exportProject(projectStore.activeSession()))
      showToast('Project exported with pages and chat history');
  };
  const selectProjectImport = () => projectImportFile?.click();
  /** @param {Event} event */
  const importProjectFile = (event) =>
    readImport(/** @type {HTMLInputElement} */ (event.currentTarget).files?.[0], importProject);
  const exportLessons = () => {
    lessonsComposition.store.export();
    showToast('Lessons exported');
  };
  const selectLessonImport = () => lessonImportFile?.click();
  /** @param {Event} event */
  const importLessonFile = (event) =>
    readImport(/** @type {HTMLInputElement} */ (event.currentTarget).files?.[0], (payload) => {
      const imported = lessonsComposition.store.import(payload);
      lessonsComposition.renderLessons();
      showToast(`${imported.length} lessons imported`);
    });

  /** @type {Array<[EventTarget, string, EventListener]>} */
  const listeners = [
    [exportProjectButton, 'click', exportProject],
    [importProjectButton, 'click', selectProjectImport],
    [projectImportFile, 'change', importProjectFile],
    [exportLessonsButton, 'click', exportLessons],
    [importLessonsButton, 'click', selectLessonImport],
    [lessonImportFile, 'change', importLessonFile],
  ];

  return {
    initialize() {
      if (initialized) return;
      initialized = true;
      for (const [target, type, listener] of listeners) {
        target.addEventListener(type, listener);
      }
    },

    destroy() {
      if (!initialized) return;
      initialized = false;
      for (const [target, type, listener] of listeners) {
        target.removeEventListener(type, listener);
      }
    },
  };
}
