import { createRuntimeCoachIdentifier, currentCoachTime } from './coach-runtime-factories.js';
import { escapeHtml } from './dom.js';

/**
 * @typedef {import('./coach-contracts.js').CoachIdentifier} CoachIdentifier
 * @typedef {import('./coach-contracts.js').CoachMessage} CoachMessage
 * @typedef {import('./coach-contracts.js').CoachMessageRole} CoachMessageRole
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 */

/**
 * @param {string} [title]
 * @param {CoachMessage[]} [messages]
 * @param {Partial<CoachThread>} [overrides]
 * @param {{
 *   createIdentifier?: () => CoachIdentifier,
 *   createTimestamp?: () => string,
 * }} [factories]
 * @returns {CoachThread}
 */
export function createCoachThread(
  title = 'New chat',
  messages = [],
  overrides = {},
  {
    createIdentifier = createRuntimeCoachIdentifier,
    createTimestamp = () => currentCoachTime().toISOString(),
  } = {},
) {
  const timestamp = createTimestamp();
  return {
    id: createIdentifier(),
    title,
    messages,
    codexThreadId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/**
 * @param {CoachSession | null | undefined} session
 * @param {{
 *   createIdentifier?: () => CoachIdentifier,
 *   createTimestamp?: () => string,
 * }} [factories]
 * @returns {CoachThread | null}
 */
export function ensureCoachThreads(session, factories = {}) {
  if (!session) return null;
  if (!Array.isArray(session.coachThreads) || !session.coachThreads.length) {
    const migratedMessages = Array.isArray(session.coachMessages) ? session.coachMessages : [];
    session.coachThreads = [
      createCoachThread(
        'Project chat',
        migratedMessages,
        {
          codexThreadId: session.codexThreadId || null,
          ...(session.createdAt ? { createdAt: session.createdAt } : {}),
        },
        factories,
      ),
    ];
  }
  if (!session.coachThreads.some((thread) => thread.id === session.activeCoachThreadId)) {
    session.activeCoachThreadId = session.coachThreads[0].id;
  }
  return session.coachThreads.find((thread) => thread.id === session.activeCoachThreadId) ?? null;
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function chatTitleFromText(text) {
  return (
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 42) || 'New chat'
  );
}

export class CoachHistoryController {
  /**
   * @param {{
   *   list: HTMLElement | null,
   *   getSession: () => CoachSession | null,
   *   persistSession: () => void,
   *   isRequestActive: () => boolean,
   *   useCodexThread: (threadId: string | null) => void,
   *   restoreTranscript: () => void,
   *   syncPopout: () => void,
   *   focusPrompt: () => void,
   *   createIdentifier?: () => CoachIdentifier,
   *   createTimestamp?: () => string,
   * }} options
   */
  constructor({
    list,
    getSession,
    persistSession,
    isRequestActive,
    useCodexThread,
    restoreTranscript,
    syncPopout,
    focusPrompt,
    createIdentifier = createRuntimeCoachIdentifier,
    createTimestamp = () => currentCoachTime().toISOString(),
  }) {
    this.list = list;
    this.getSession = getSession;
    this.persistSession = persistSession;
    this.isRequestActive = isRequestActive;
    this.useCodexThread = useCodexThread;
    this.restoreTranscript = restoreTranscript;
    this.syncPopout = syncPopout;
    this.focusPrompt = focusPrompt;
    this.createIdentifier = createIdentifier;
    this.createTimestamp = createTimestamp;
  }

  /** @returns {CoachThread | null} */
  activeThread() {
    return ensureCoachThreads(this.getSession(), {
      createIdentifier: this.createIdentifier,
      createTimestamp: this.createTimestamp,
    });
  }

  restoreForSession() {
    const session = this.getSession();
    const thread = ensureCoachThreads(session, {
      createIdentifier: this.createIdentifier,
      createTimestamp: this.createTimestamp,
    });
    this.useCodexThread(thread?.codexThreadId || session?.codexThreadId || null);
    this.restoreTranscript();
    this.render();
  }

  startNewThread() {
    const session = this.getSession();
    if (!session) return;
    const thread = createCoachThread(
      'New chat',
      [],
      {},
      {
        createIdentifier: this.createIdentifier,
        createTimestamp: this.createTimestamp,
      },
    );
    session.coachThreads ||= [];
    session.coachThreads.unshift(thread);
    session.activeCoachThreadId = thread.id;
    session.codexThreadId = null;
    this.useCodexThread(null);
    this.persistSession();
    this.restoreTranscript();
    this.render();
    this.focusPrompt();
  }

  /** @param {CoachIdentifier} id */
  selectThread(id) {
    const session = this.getSession();
    if (!session || this.isRequestActive()) return;
    const thread = session.coachThreads?.find((item) => item.id === id);
    if (!thread) return;
    session.activeCoachThreadId = id;
    session.codexThreadId = thread.codexThreadId || null;
    this.useCodexThread(session.codexThreadId);
    this.persistSession();
    this.restoreTranscript();
    this.render();
  }

  render() {
    if (!this.list) return;
    const session = this.getSession();
    ensureCoachThreads(session, {
      createIdentifier: this.createIdentifier,
      createTimestamp: this.createTimestamp,
    });
    if (!session) {
      this.list.replaceChildren();
      return;
    }
    this.list.innerHTML = (session.coachThreads || [])
      .map((thread) => {
        const updated = new Date(thread.updatedAt || this.createTimestamp());
        return `<button class="coach-thread ${thread.id === session.activeCoachThreadId ? 'active' : ''}" data-coach-thread="${thread.id}"><b>${escapeHtml(thread.title || 'New chat')}</b><small>${updated.toLocaleDateString([], { month: 'short', day: 'numeric' })} Â· ${(thread.messages || []).length} messages</small></button>`;
      })
      .join('');
    this.list.querySelectorAll('[data-coach-thread]').forEach((button) => {
      button.addEventListener('click', () =>
        this.selectThread(Number(button.getAttribute('data-coach-thread'))),
      );
    });
  }

  /**
   * @param {string} text
   * @param {CoachMessageRole} role
   */
  persistMessage(text, role) {
    const session = this.getSession();
    if (!session || !['user', 'assistant'].includes(role)) return;
    const thread = this.activeThread();
    if (!thread) return;
    if (role === 'user' && (!thread.messages || thread.messages.length === 0)) {
      thread.title = chatTitleFromText(text);
    }
    const timestamp = this.createTimestamp();
    thread.messages ||= [];
    thread.messages.push({ text, role, createdAt: timestamp });
    thread.updatedAt = timestamp;
    session.coachMessages = thread.messages;
    session.updatedAt = timestamp;
    this.persistSession();
    this.render();
    this.syncPopout();
  }
}
