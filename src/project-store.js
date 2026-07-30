import {
  createRuntimeProjectIdentifier,
  currentProjectTime,
  PROJECT_IDENTIFIER_KIND,
} from './project-runtime-factories.js';
import {
  parseLegacyCardPayload,
  parseLegacyStrokePayload,
  parsePersistedProjectPayload,
  parseProjectExportPayload,
  parseProjectForExport,
  parseProjectJson,
} from './project-payload-contract.js';
import { logStorageDiagnostic, reportStorageFailure } from './storage.js';

const SESSION_STORAGE_KEY = 'chalk-sessions-v1';
const PROJECT_STORAGE_BOUNDARY = 'project storage';

/**
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-payload-contract.js').ProjectCard} ProjectCard
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} ProjectIdentifier
 * @typedef {import('./project-payload-contract.js').ProjectPage} ProjectPage
 * @typedef {import('./project-payload-contract.js').ProjectState} ProjectState
 * @typedef {import('./project-payload-contract.js').ProjectStroke} ProjectStroke
 * @typedef {import('./project-runtime-factories.js').ProjectIdentifierKind} ProjectIdentifierKind
 * @typedef {import('./storage.js').StorageDiagnostic} StorageDiagnostic
 *
 * @typedef {object} ProjectStorage
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 *
 * @typedef {object} ProjectStoreOptions
 * @property {ProjectStorage} [storage]
 * @property {(session: Project) => void} [normalizeSession]
 * @property {() => Date} [now]
 * @property {(kind: ProjectIdentifierKind) => ProjectIdentifier} [createIdentifier]
 * @property {(diagnostic: StorageDiagnostic) => void} [onDiagnostic]
 *
 * @typedef {object} ProjectTransition
 * @property {Project} project
 * @property {boolean} activeProjectChanged
 *
 * @typedef {object} PageTransition
 * @property {ProjectPage} page
 * @property {boolean} activePageChanged
 *
 * @typedef {object} ProjectStoreInitialization
 * @property {boolean} ok
 * @property {boolean} recovered
 * @property {StorageDiagnostic[]} diagnostics
 *
 */

export class ProjectStore {
  /** @param {ProjectStoreOptions} [options] */
  constructor({
    storage = localStorage,
    normalizeSession = () => {},
    now = currentProjectTime,
    createIdentifier = createRuntimeProjectIdentifier,
    onDiagnostic = logStorageDiagnostic,
  } = {}) {
    this.storage = storage;
    this.normalizeSession = normalizeSession;
    this.now = now;
    this.createIdentifier = createIdentifier;
    this.onDiagnostic = onDiagnostic;
    /** @type {ProjectState} */
    this.state = { sessions: [], activeId: null };
  }

  /**
   * @param {number} [number]
   * @param {Partial<ProjectPage>} [overrides]
   * @returns {ProjectPage}
   */
  createPage(number = 1, overrides = {}) {
    const now = this.now().toISOString();
    return {
      id: this.createIdentifier(PROJECT_IDENTIFIER_KIND.PAGE),
      title: `Page ${number}`,
      strokes: [],
      cards: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  /**
   * @param {Partial<Project>} [overrides]
   * @returns {Project}
   */
  createSession(overrides = {}) {
    const now = this.now().toISOString();
    const firstPage = this.createPage(1);
    return {
      id: this.createIdentifier(PROJECT_IDENTIFIER_KIND.PROJECT),
      title: 'Untitled project',
      pages: [firstPage],
      activePageId: firstPage.id,
      coachMessages: [],
      coachThreads: [],
      activeCoachThreadId: null,
      codexThreadId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  /**
   * @param {Partial<Project>} [overrides]
   * @returns {Project}
   */
  createProject(overrides = {}) {
    const project = this.createSession(overrides);
    this.state.sessions.unshift(project);
    this.state.activeId = project.id;
    this.persist();
    return project;
  }

  /**
   * Insert and activate a project that has already passed the import contract.
   *
   * @param {Project} project
   * @returns {Project}
   */
  insertImportedProject(project) {
    const nextState = {
      sessions: [project, ...this.state.sessions],
      activeId: project.id,
    };
    this.#persistState(nextState);
    this.state = nextState;
    return project;
  }

  /**
   * @param {ProjectIdentifier} id
   * @returns {boolean}
   */
  activateProject(id) {
    if (id === this.state.activeId) return false;
    if (!this.state.sessions.some((project) => project.id === id)) return false;

    this.state.activeId = id;
    this.persist();
    return true;
  }

  /**
   * @param {ProjectIdentifier} id
   * @returns {ProjectTransition | null}
   */
  deleteProject(id) {
    if (this.state.sessions.length <= 1) return null;

    const project = this.state.sessions.find((item) => item.id === id);
    if (!project) return null;

    const previousActiveId = this.state.activeId;
    this.state.sessions = this.state.sessions.filter((item) => item.id !== id);
    if (!this.state.sessions.some((item) => item.id === this.state.activeId)) {
      this.state.activeId = this.state.sessions[0].id;
    }
    this.persist();
    return {
      project,
      activeProjectChanged: previousActiveId !== this.state.activeId,
    };
  }

  /** @returns {ProjectPage | null} */
  addPage() {
    const project = this.activeSession();
    if (!project) return null;

    const page = this.createPage(project.pages.length + 1);
    project.pages.push(page);
    project.activePageId = page.id;
    project.updatedAt = page.updatedAt;
    this.persist();
    return page;
  }

  /**
   * @param {ProjectIdentifier} id
   * @returns {boolean}
   */
  activatePage(id) {
    const project = this.activeSession();
    if (!project || id === project.activePageId) return false;
    if (!project.pages.some((page) => page.id === id)) return false;

    project.activePageId = id;
    this.persist();
    return true;
  }

  /**
   * @param {ProjectIdentifier} id
   * @param {unknown} title
   * @returns {ProjectPage | null}
   */
  renamePage(id, title) {
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedTitle) return null;

    const project = this.activeSession();
    const page = project?.pages.find((item) => item.id === id);
    if (!project || !page) return null;

    const updatedAt = this.now().toISOString();
    page.title = normalizedTitle;
    page.updatedAt = updatedAt;
    project.updatedAt = updatedAt;
    this.persist();
    return page;
  }

  /**
   * @param {ProjectIdentifier} id
   * @returns {PageTransition | null}
   */
  deletePage(id) {
    const project = this.activeSession();
    if (!project || project.pages.length <= 1) return null;

    const pageIndex = project.pages.findIndex((page) => page.id === id);
    if (pageIndex === -1) return null;

    const page = project.pages[pageIndex];
    const previousActivePageId = project.activePageId;
    project.pages.splice(pageIndex, 1);
    if (previousActivePageId === id) {
      project.activePageId = project.pages[Math.max(0, pageIndex - 1)].id;
    }
    project.updatedAt = this.now().toISOString();
    this.persist();
    return {
      page,
      activePageChanged: previousActivePageId !== project.activePageId,
    };
  }

  /**
   * @param {unknown} session
   * @returns {Project}
   */
  normalize(session) {
    const activeId =
      session !== null && typeof session === 'object' && 'id' in session ? session.id : null;
    const normalized = /** @type {Project} */ (
      /** @type {unknown} */ (
        parsePersistedProjectPayload(
          {
            sessions: [session],
            activeId,
          },
          { createPage: (number, overrides) => this.createPage(number, overrides) },
        ).sessions[0]
      )
    );
    this.normalizeSession(normalized);
    return normalized;
  }

  /**
   * @param {unknown} payload
   * @returns {Project}
   */
  parseImport(payload) {
    const project = parseProjectExportPayload(payload, {
      createPage: (number, overrides) => this.createPage(number, overrides),
    });
    this.normalizeSession(project);
    return project;
  }

  /**
   * @param {Project} project
   * @returns {Project}
   */
  prepareExport(project) {
    return parseProjectForExport(project, {
      createPage: (number, overrides) => this.createPage(number, overrides),
    });
  }

  /** @returns {ProjectStoreInitialization} */
  initialize() {
    /** @type {StorageDiagnostic[]} */
    const diagnostics = [];
    const serializedState = this.#readStorage(SESSION_STORAGE_KEY);
    if (serializedState !== null) {
      try {
        const saved = parseProjectJson(serializedState, PROJECT_STORAGE_BOUNDARY);
        const normalized = parsePersistedProjectPayload(saved, {
          createPage: (number, overrides) => this.createPage(number, overrides),
        });
        if (normalized.sessions.length) {
          for (const session of normalized.sessions) this.normalizeSession(session);
          this.state = normalized;
          this.persist();
          return { ok: true, recovered: false, diagnostics };
        }
      } catch (error) {
        this.#reportStorageFailure('parse', SESSION_STORAGE_KEY, error);
        throw error;
      }
    }

    const legacyStrokes = this.#loadLegacyCollection(
      'chalk-strokes',
      'legacy stroke storage',
      parseLegacyStrokePayload,
    );
    const legacyCards = this.#loadLegacyCollection(
      'chalk-cards',
      'legacy card storage',
      parseLegacyCardPayload,
    );
    const legacyTitle = this.#readStorage('chalk-title');
    const legacyCodexThread = this.#readStorage('chalk-codex-thread');
    const migrated = this.createSession({
      title: legacyTitle || 'Untitled project',
      codexThreadId: legacyCodexThread,
    });
    migrated.pages[0].title = 'Page 1';
    migrated.pages[0].strokes = legacyStrokes;
    migrated.pages[0].cards = legacyCards;
    this.state.sessions = [migrated];
    this.state.activeId = migrated.id;
    this.persist();
    return {
      ok: true,
      recovered: false,
      diagnostics,
    };
  }

  /** @returns {Project | undefined} */
  activeSession() {
    return this.state.sessions.find((session) => session.id === this.state.activeId);
  }

  /** @returns {ProjectPage | undefined} */
  activePage() {
    const project = this.activeSession();
    return project?.pages?.find((page) => page.id === project.activePageId) || project?.pages?.[0];
  }

  /**
   * @returns {true}
   */
  persist() {
    return this.#persistState(this.state);
  }

  /**
   * @param {ProjectState} state
   * @returns {true}
   */
  #persistState(state) {
    const validated = parsePersistedProjectPayload(state, {
      createPage: (number, overrides) => this.createPage(number, overrides),
    });
    try {
      this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(validated));
      return true;
    } catch (error) {
      this.#reportStorageFailure('write', SESSION_STORAGE_KEY, error);
      throw error;
    }
  }

  /**
   * @param {string} key
   * @returns {string | null}
   */
  #readStorage(key) {
    try {
      return this.storage.getItem(key);
    } catch (error) {
      this.#reportStorageFailure('read', key, error);
      throw error;
    }
  }

  /**
   * @template Value
   * @param {string} key
   * @param {string} source
   * @param {(payload: unknown) => Value[]} parsePayload
   * @returns {Value[]}
   */
  #loadLegacyCollection(key, source, parsePayload) {
    const stored = this.#readStorage(key);
    if (stored === null) return [];

    try {
      return parsePayload(parseProjectJson(stored, source));
    } catch (error) {
      this.#reportStorageFailure('parse', key, error);
      throw error;
    }
  }

  /**
   * @param {import('./storage.js').StorageOperation} operation
   * @param {string} key
   * @param {unknown} error
   * @returns {StorageDiagnostic}
   */
  #reportStorageFailure(operation, key, error) {
    return reportStorageFailure({
      boundary: PROJECT_STORAGE_BOUNDARY,
      operation,
      key,
      error,
      onDiagnostic: this.onDiagnostic,
    });
  }
}
