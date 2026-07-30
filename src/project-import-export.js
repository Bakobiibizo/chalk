import { downloadJson, slugifyName } from './storage.js';
import {
  createRuntimeProjectIdentifier,
  currentProjectTime,
  PROJECT_IDENTIFIER_KIND,
} from './project-runtime-factories.js';
import { PROJECT_EXPORT_VERSION } from './project-payload-contract.js';

export { PROJECT_EXPORT_VERSION } from './project-payload-contract.js';

/**
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} ProjectIdentifier
 * @typedef {import('./project-runtime-factories.js').ProjectIdentifierKind} ProjectIdentifierKind
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 *
 * @typedef {object} ProjectImportExportOptions
 * @property {(project: Project) => void} [prepareProject]
 * @property {() => Date} [now]
 * @property {(kind: ProjectIdentifierKind) => ProjectIdentifier} [createIdentifier]
 */

export class ProjectImportExportService {
  /**
   * @param {ProjectStore} projectStore
   * @param {ProjectImportExportOptions} [options]
   */
  constructor(
    projectStore,
    {
      prepareProject = () => {},
      now = projectStore.now ?? currentProjectTime,
      createIdentifier = projectStore.createIdentifier ?? createRuntimeProjectIdentifier,
    } = {},
  ) {
    this.projectStore = projectStore;
    this.prepareProject = prepareProject;
    this.now = now;
    this.createIdentifier = createIdentifier;
  }

  /**
   * @param {Project | undefined} [project]
   * @returns {boolean}
   */
  exportProject(project = this.projectStore.activeSession()) {
    if (!project) return false;
    this.prepareProject(project);
    const exportedProject = this.projectStore.prepareExport(project);
    downloadJson(`${slugifyName(project.title)}.chalk-project.json`, {
      kind: 'chalk.project',
      version: PROJECT_EXPORT_VERSION,
      exportedAt: this.now().toISOString(),
      project: exportedProject,
    });
    return true;
  }

  /**
   * @param {unknown} payload
   * @returns {Project}
   */
  importProject(payload) {
    const imported = this.projectStore.parseImport(payload);
    imported.id = this.createIdentifier(PROJECT_IDENTIFIER_KIND.IMPORTED_PROJECT);
    imported.title = `${imported.title || 'Imported project'} (imported)`;
    imported.importedAt = this.now().toISOString();
    return this.projectStore.insertImportedProject(imported);
  }
}
