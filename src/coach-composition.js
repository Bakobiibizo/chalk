import { CoachPanelUI } from './coach-panel-ui.js';
import { CodexCoachService } from './codex-coach-service.js';

/**
 * @typedef {import('./coach-contracts.js').CoachDesktopBridge} CoachDesktopBridge
 * @typedef {import('./coach-contracts.js').CoachIdentifier} CoachIdentifier
 * @typedef {import('./coach-contracts.js').CoachService} CoachService
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 * @typedef {import('./coach-contracts.js').PreparedCoachRequest} PreparedCoachRequest
 *
 * @typedef {{
 *   service: CoachService,
 *   panel: CoachPanelUI,
 *   open: () => void,
 *   initialize: () => void,
 *   destroy: () => void,
 * }} CoachComposition
 */

/**
 * @param {{
 *   configuredUrl?: string | null,
 *   desktopBridge?: CoachDesktopBridge | null,
 *   location: Pick<Location, 'protocol' | 'host'>,
 *   statusElement: HTMLElement,
 *   activeSession: () => CoachSession | null,
 *   activeThread: () => CoachThread | null,
 *   persistSession: () => void,
 *   createTimestamp?: () => string,
 * }} options
 * @returns {CodexCoachService}
 */
export function createCoachService({
  configuredUrl,
  desktopBridge,
  location,
  statusElement,
  activeSession,
  activeThread,
  persistSession,
  createTimestamp,
}) {
  return new CodexCoachService({
    configuredUrl,
    desktopBridge,
    location,
    statusElement,
    activeSession,
    activeThread,
    persistSession,
    createTimestamp,
  });
}

/**
 * @param {{
 *   coachService: CoachService,
 *   desktopBridge?: CoachDesktopBridge | null,
 *   activeSession: () => CoachSession | null,
 *   persistSession: () => void,
 *   renderLatex: (element: HTMLElement) => void,
 *   showToast: (message: string) => void,
 *   beforeOpen: () => void,
 *   prepareRequest: (prompt: string) => PreparedCoachRequest | Promise<PreparedCoachRequest>,
 *   createIdentifier?: () => CoachIdentifier,
 *   createTimestamp?: () => string,
 * }} options
 * @returns {CoachComposition}
 */
export function composeCoach({
  coachService,
  desktopBridge,
  activeSession,
  persistSession,
  renderLatex,
  showToast,
  beforeOpen,
  prepareRequest,
  createIdentifier,
  createTimestamp,
}) {
  const panel = new CoachPanelUI({
    coachService,
    desktopBridge,
    getSession: activeSession,
    persistSession,
    renderLatex,
    showToast,
    beforeOpen,
    prepareRequest,
    createIdentifier,
    createTimestamp,
  });
  return {
    service: coachService,
    panel,
    open: () => panel.open(),
    initialize() {
      coachService.initialize();
      panel.initialize();
    },
    destroy() {
      panel.destroy();
      coachService.destroy();
    },
  };
}
