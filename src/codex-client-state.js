export const CODEX_CONNECTION_PHASE = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  CLOSED: 'closed',
});

export const CODEX_THREAD_PHASE = Object.freeze({
  EMPTY: 'empty',
  SAVED: 'saved',
  RESUMING: 'resuming',
  STARTING: 'starting',
  READY: 'ready',
});

/**
 * @typedef {(typeof CODEX_CONNECTION_PHASE)[keyof typeof CODEX_CONNECTION_PHASE]} CodexConnectionPhase
 * @typedef {(typeof CODEX_THREAD_PHASE)[keyof typeof CODEX_THREAD_PHASE]} CodexThreadPhase
 *
 * @typedef {{
 *   open: EventListener,
 *   message: EventListener,
 *   error: EventListener,
 *   close: EventListener,
 * }} CodexSocketEventHandlers
 *
 * @typedef {{phase: 'disconnected'}} CodexDisconnectedState
 * @typedef {{
 *   phase: 'connecting',
 *   socket: WebSocket,
 *   promise: Promise<void>,
 *   reject: (reason?: unknown) => void,
 *   timeout?: ReturnType<typeof setTimeout>,
 *   eventHandlers: Readonly<CodexSocketEventHandlers>,
 * }} CodexConnectingState
 * @typedef {{
 *   phase: 'connected',
 *   socket: WebSocket,
 *   eventHandlers: Readonly<CodexSocketEventHandlers>,
 * }} CodexConnectedState
 * @typedef {{phase: 'closed'}} CodexClosedState
 * @typedef {CodexDisconnectedState | CodexConnectingState | CodexConnectedState | CodexClosedState} CodexConnectionState
 *
 * @typedef {{phase: 'empty'}} CodexEmptyThreadState
 * @typedef {{phase: 'saved', threadId: string}} CodexSavedThreadState
 * @typedef {{phase: 'resuming', threadId: string, promise: Promise<string>}} CodexResumingThreadState
 * @typedef {{phase: 'starting', promise: Promise<string>}} CodexStartingThreadState
 * @typedef {{phase: 'ready', threadId: string}} CodexReadyThreadState
 * @typedef {CodexEmptyThreadState | CodexSavedThreadState | CodexResumingThreadState | CodexStartingThreadState | CodexReadyThreadState} CodexThreadState
 *
 * @typedef {{
 *   socket?: unknown,
 *   promise?: unknown,
 *   reject?: unknown,
 *   timeout?: ReturnType<typeof setTimeout>,
 *   eventHandlers?: unknown,
 *   threadId?: unknown,
 * }} CodexStateDetails
 */

/** @type {Readonly<Record<CodexConnectionPhase, ReadonlySet<CodexConnectionPhase>>>} */
const CONNECTION_TRANSITIONS = Object.freeze({
  [CODEX_CONNECTION_PHASE.DISCONNECTED]: new Set([
    CODEX_CONNECTION_PHASE.CONNECTING,
    CODEX_CONNECTION_PHASE.CLOSED,
  ]),
  [CODEX_CONNECTION_PHASE.CONNECTING]: new Set([
    CODEX_CONNECTION_PHASE.CONNECTED,
    CODEX_CONNECTION_PHASE.DISCONNECTED,
    CODEX_CONNECTION_PHASE.CLOSED,
  ]),
  [CODEX_CONNECTION_PHASE.CONNECTED]: new Set([
    CODEX_CONNECTION_PHASE.DISCONNECTED,
    CODEX_CONNECTION_PHASE.CLOSED,
  ]),
  [CODEX_CONNECTION_PHASE.CLOSED]: new Set(),
});

/** @type {Readonly<Record<CodexThreadPhase, ReadonlySet<CodexThreadPhase>>>} */
const THREAD_TRANSITIONS = Object.freeze({
  [CODEX_THREAD_PHASE.EMPTY]: new Set([CODEX_THREAD_PHASE.SAVED, CODEX_THREAD_PHASE.STARTING]),
  [CODEX_THREAD_PHASE.SAVED]: new Set([CODEX_THREAD_PHASE.EMPTY, CODEX_THREAD_PHASE.RESUMING]),
  [CODEX_THREAD_PHASE.RESUMING]: new Set([
    CODEX_THREAD_PHASE.EMPTY,
    CODEX_THREAD_PHASE.SAVED,
    CODEX_THREAD_PHASE.READY,
  ]),
  [CODEX_THREAD_PHASE.STARTING]: new Set([
    CODEX_THREAD_PHASE.EMPTY,
    CODEX_THREAD_PHASE.SAVED,
    CODEX_THREAD_PHASE.READY,
  ]),
  [CODEX_THREAD_PHASE.READY]: new Set([CODEX_THREAD_PHASE.EMPTY, CODEX_THREAD_PHASE.SAVED]),
});

/**
 * @param {Readonly<Record<string, ReadonlySet<string>>>} transitions
 * @param {unknown} phase
 * @param {string} stateName
 * @returns {asserts phase is string}
 */
function assertPhase(transitions, phase, stateName) {
  if (typeof phase !== 'string' || !Object.hasOwn(transitions, phase)) {
    throw new Error(`Unknown Codex ${stateName} phase: ${String(phase)}.`);
  }
}

/**
 * @param {unknown} threadId
 * @returns {asserts threadId is string}
 */
function assertThreadId(threadId) {
  if (typeof threadId !== 'string' || threadId.length === 0) {
    throw new Error('Codex thread state requires a non-empty thread ID.');
  }
}

/**
 * @param {unknown} promise
 * @param {string} stateName
 * @returns {asserts promise is Promise<unknown>}
 */
function assertPromise(promise, stateName) {
  if (
    promise === null ||
    (typeof promise !== 'object' && typeof promise !== 'function') ||
    typeof Reflect.get(promise, 'then') !== 'function'
  ) {
    throw new Error(`Codex ${stateName} state requires a promise.`);
  }
}

/**
 * @param {unknown} socket
 * @param {string} stateName
 * @returns {asserts socket is WebSocket}
 */
function assertSocket(socket, stateName) {
  if (
    socket === null ||
    (typeof socket !== 'object' && typeof socket !== 'function') ||
    typeof Reflect.get(socket, 'send') !== 'function'
  ) {
    throw new Error(`Codex ${stateName} state requires a socket.`);
  }
}

/**
 * @param {unknown} eventHandlers
 * @param {string} stateName
 * @returns {asserts eventHandlers is CodexSocketEventHandlers}
 */
function assertEventHandlers(eventHandlers, stateName) {
  if (!eventHandlers || typeof eventHandlers !== 'object') {
    throw new Error(`Codex ${stateName} state requires socket event handlers.`);
  }
}

/**
 * @param {CodexConnectionPhase} phase
 * @param {CodexStateDetails} [details]
 * @returns {CodexConnectionState}
 */
export function createConnectionState(phase, details = {}) {
  assertPhase(CONNECTION_TRANSITIONS, phase, 'connection');

  if (phase === CODEX_CONNECTION_PHASE.CONNECTING) {
    const socket = details.socket;
    const promise = details.promise;
    const reject = details.reject;
    const eventHandlers = details.eventHandlers;
    assertSocket(socket, phase);
    assertPromise(promise, phase);
    if (typeof reject !== 'function') {
      throw new Error('Codex connecting state requires a rejection function.');
    }
    assertEventHandlers(eventHandlers, phase);
    return Object.freeze({
      phase,
      socket,
      promise: /** @type {Promise<void>} */ (promise),
      reject: /** @type {(reason?: unknown) => void} */ (reject),
      timeout: details.timeout,
      eventHandlers: Object.freeze({ ...eventHandlers }),
    });
  }

  if (phase === CODEX_CONNECTION_PHASE.CONNECTED) {
    const socket = details.socket;
    const eventHandlers = details.eventHandlers;
    assertSocket(socket, phase);
    assertEventHandlers(eventHandlers, phase);
    return Object.freeze({
      phase,
      socket,
      eventHandlers: Object.freeze({ ...eventHandlers }),
    });
  }

  return Object.freeze({ phase });
}

/**
 * @param {CodexConnectionState} currentState
 * @param {CodexConnectionState} nextState
 * @returns {CodexConnectionState}
 */
export function transitionConnectionState(currentState, nextState) {
  assertPhase(CONNECTION_TRANSITIONS, currentState?.phase, 'connection');
  assertPhase(CONNECTION_TRANSITIONS, nextState?.phase, 'connection');
  if (!CONNECTION_TRANSITIONS[currentState.phase].has(nextState.phase)) {
    throw new Error(
      `Invalid Codex connection transition: ${currentState.phase} -> ${nextState.phase}.`,
    );
  }
  return nextState;
}

/**
 * @param {CodexThreadPhase} phase
 * @param {CodexStateDetails} [details]
 * @returns {CodexThreadState}
 */
export function createThreadState(phase, details = {}) {
  assertPhase(THREAD_TRANSITIONS, phase, 'thread');

  if (
    phase === CODEX_THREAD_PHASE.SAVED ||
    phase === CODEX_THREAD_PHASE.RESUMING ||
    phase === CODEX_THREAD_PHASE.READY
  ) {
    assertThreadId(details.threadId);
  }
  if (phase === CODEX_THREAD_PHASE.RESUMING || phase === CODEX_THREAD_PHASE.STARTING) {
    assertPromise(details.promise, phase);
  }

  if (phase === CODEX_THREAD_PHASE.RESUMING) {
    const threadId = details.threadId;
    assertThreadId(threadId);
    return Object.freeze({
      phase,
      threadId,
      promise: /** @type {Promise<string>} */ (details.promise),
    });
  }
  if (phase === CODEX_THREAD_PHASE.STARTING) {
    return Object.freeze({
      phase,
      promise: /** @type {Promise<string>} */ (details.promise),
    });
  }
  if (phase === CODEX_THREAD_PHASE.SAVED) {
    const threadId = details.threadId;
    assertThreadId(threadId);
    return Object.freeze({ phase, threadId });
  }
  if (phase === CODEX_THREAD_PHASE.READY) {
    const threadId = details.threadId;
    assertThreadId(threadId);
    return Object.freeze({ phase, threadId });
  }
  return Object.freeze({ phase });
}

/**
 * @param {CodexThreadState} currentState
 * @param {CodexThreadState} nextState
 * @returns {CodexThreadState}
 */
export function transitionThreadState(currentState, nextState) {
  assertPhase(THREAD_TRANSITIONS, currentState?.phase, 'thread');
  assertPhase(THREAD_TRANSITIONS, nextState?.phase, 'thread');
  if (!THREAD_TRANSITIONS[currentState.phase].has(nextState.phase)) {
    throw new Error(
      `Invalid Codex thread transition: ${currentState.phase} -> ${nextState.phase}.`,
    );
  }
  return nextState;
}
