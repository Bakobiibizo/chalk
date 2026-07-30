/**
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-payload-contract.js').ProjectPage} ProjectPage
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 *
 * @typedef {object} ApplicationSessionAdapters
 * @property {() => Project | null} activeSession
 * @property {() => ProjectPage | null} activePage
 * @property {(session?: Project | null) => CoachThread | null} ensureCoachThreads
 * @property {() => CoachThread | null} activeCoachThread
 * @property {() => void} persistSession
 */

/**
 * @param {{
 *   normalizeCoachThreads: (session?: Project | null) => CoachThread | null,
 *   projectStore: ProjectStore,
 * }} options
 * @returns {ApplicationSessionAdapters}
 */
export function createApplicationSessionAdapters({ normalizeCoachThreads, projectStore }) {
  function activeSession() {
    return projectStore.activeSession() ?? null;
  }

  function activePage() {
    return projectStore.activePage() ?? null;
  }

  function ensureCoachThreads(session = activeSession()) {
    return normalizeCoachThreads(session);
  }

  function activeCoachThread() {
    return ensureCoachThreads(activeSession());
  }

  function persistSession() {
    projectStore.persist();
  }

  return {
    activeSession,
    activePage,
    ensureCoachThreads,
    activeCoachThread,
    persistSession,
  };
}
