import { dispatchCodexNotification } from './codex-notification-dispatcher.js';
import {
  CODEX_CONNECTION_PHASE,
  CODEX_THREAD_PHASE,
  createConnectionState,
  createThreadState,
  transitionConnectionState,
  transitionThreadState,
} from './codex-client-state.js';

/**
 * @typedef {import('./codex-client-state.js').CodexConnectionState} CodexConnectionState
 * @typedef {import('./codex-client-state.js').CodexThreadState} CodexThreadState
 * @typedef {import('./codex-client-state.js').CodexSocketEventHandlers} CodexSocketEventHandlers
 *
 * @typedef {{
 *   resolve: (value: unknown) => void,
 *   reject: (reason?: unknown) => void,
 * }} CodexPendingRequest
 * @typedef {{type: 'text', text: string, text_elements: readonly never[]}} CodexTextInput
 * @typedef {{type: 'image', url: string, detail: 'high'}} CodexImageInput
 */

/**
 * @template Result
 * @typedef {{
 *   promise: Promise<Result>,
 *   resolve: (value: Result | PromiseLike<Result>) => void,
 *   reject: (reason?: unknown) => void,
 * }} Deferred
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonRpcMessage(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('Codex returned a non-text JSON-RPC message.');
  }
  const message = /** @type {unknown} */ (JSON.parse(raw));
  if (!isRecord(message)) throw new TypeError('Codex returned an invalid JSON-RPC message.');
  return message;
}

/**
 * @param {unknown} response
 * @returns {string}
 */
function readStartedThreadId(response) {
  if (!isRecord(response) || !isRecord(response.thread)) {
    throw new TypeError('Codex thread/start response requires a thread object.');
  }
  const threadId = response.thread.id;
  if (typeof threadId !== 'string' || !threadId) {
    throw new TypeError('Codex thread/start response requires a non-empty thread ID.');
  }
  return threadId;
}

export class CodexClient extends EventTarget {
  /** @param {string} url */
  constructor(url) {
    super();
    this.url = url;
    /** @type {CodexConnectionState} */
    this.connectionState = createConnectionState(CODEX_CONNECTION_PHASE.DISCONNECTED);
    this.nextId = 1;
    /** @type {Map<number, CodexPendingRequest>} */
    this.pending = new Map();
    const savedThreadId = localStorage.getItem('chalk-codex-thread');
    /** @type {CodexThreadState} */
    this.threadState = savedThreadId
      ? createThreadState(CODEX_THREAD_PHASE.SAVED, { threadId: savedThreadId })
      : createThreadState(CODEX_THREAD_PHASE.EMPTY);
  }

  get connected() {
    return this.connectionState.phase === CODEX_CONNECTION_PHASE.CONNECTED;
  }

  get closed() {
    return this.connectionState.phase === CODEX_CONNECTION_PHASE.CLOSED;
  }

  get socket() {
    return 'socket' in this.connectionState ? this.connectionState.socket : null;
  }

  get threadId() {
    return 'threadId' in this.threadState ? this.threadState.threadId : null;
  }

  /** @param {CodexConnectionState} nextState */
  transitionConnection(nextState) {
    this.connectionState = transitionConnectionState(this.connectionState, nextState);
  }

  /** @param {CodexThreadState} nextState */
  transitionThread(nextState) {
    this.threadState = transitionThreadState(this.threadState, nextState);
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [detail]
   */
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** @param {string | null | undefined} threadId */
  useThread(threadId) {
    const selectedThreadId = threadId || null;
    if (this.threadId === selectedThreadId) return;
    this.resetThreadState(selectedThreadId);
    if (selectedThreadId) localStorage.setItem('chalk-codex-thread', selectedThreadId);
    else localStorage.removeItem('chalk-codex-thread');
  }

  connect() {
    if (this.closed) return Promise.reject(new Error('Codex client is closed.'));
    if (this.connectionState.phase === CODEX_CONNECTION_PHASE.CONNECTED) {
      return Promise.resolve();
    }
    if (this.connectionState.phase === CODEX_CONNECTION_PHASE.CONNECTING) {
      return this.connectionState.promise;
    }

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (error) {
      return Promise.reject(error);
    }

    /** @type {() => void} */
    let resolveConnectionPromise = () => {};
    /** @type {(reason?: unknown) => void} */
    let rejectConnectionPromise = () => {};
    /** @type {Promise<void>} */
    const connectionPromise = new Promise((resolve, reject) => {
      resolveConnectionPromise = resolve;
      rejectConnectionPromise = reject;
    });
    let connectionSettled = false;
    const resolveConnection = () => {
      if (connectionSettled) return;
      connectionSettled = true;
      resolveConnectionPromise();
    };
    /** @param {unknown} error */
    const rejectConnection = (error) => {
      if (connectionSettled) return;
      connectionSettled = true;
      rejectConnectionPromise(error);
    };

    const connectionTimeout = setTimeout(() => {
      const error = new Error('Codex app service did not respond.');
      this.disconnectSocket(socket, error, error.message);
      this.closeSocket(socket);
    }, 8000);

    /** @type {CodexSocketEventHandlers} */
    const eventHandlers = {
      open: async () => {
        try {
          await this.request('initialize', {
            clientInfo: { name: 'chalk_learning_canvas', title: 'Chalk', version: '1.0.0' },
          });
          const currentState = this.connectionState;
          if (
            currentState.phase !== CODEX_CONNECTION_PHASE.CONNECTING ||
            currentState.socket !== socket
          ) {
            return;
          }
          this.notify('initialized', {});
          clearTimeout(currentState.timeout);
          this.transitionConnection(
            createConnectionState(CODEX_CONNECTION_PHASE.CONNECTED, {
              socket,
              eventHandlers: currentState.eventHandlers,
            }),
          );
          this.emit('status', { connected: true });
          resolveConnection();
        } catch (error) {
          const connectionError =
            error instanceof Error ? error : new Error('Could not initialize Codex.');
          this.disconnectSocket(socket, connectionError, connectionError.message);
          this.closeSocket(socket);
        }
      },
      message: (event) => {
        if (!('data' in event)) return;
        try {
          this.handleMessage(event.data);
        } catch (error) {
          const protocolError =
            error instanceof Error ? error : new Error('Codex returned an invalid response.');
          this.disconnectSocket(socket, protocolError, protocolError.message);
          this.closeSocket(socket);
        }
      },
      error: () => {
        const error = new Error('Could not connect to the Codex app service.');
        this.disconnectSocket(socket, error, error.message);
        this.closeSocket(socket);
      },
      close: (event) => {
        this.disconnectSocket(
          socket,
          new Error('Codex connection closed.'),
          'reason' in event && typeof event.reason === 'string' && event.reason
            ? event.reason
            : 'Codex connection closed.',
        );
      },
    };
    this.transitionConnection(
      createConnectionState(CODEX_CONNECTION_PHASE.CONNECTING, {
        socket,
        promise: connectionPromise,
        reject: rejectConnection,
        timeout: connectionTimeout,
        eventHandlers,
      }),
    );
    for (const [type, handler] of Object.entries(eventHandlers)) {
      socket.addEventListener(type, handler);
    }
    return connectionPromise;
  }

  /** @param {WebSocket | null | undefined} socket */
  closeSocket(socket) {
    if (!socket || socket.readyState === 2 || socket.readyState === 3) return;
    socket.close();
  }

  /** @param {CodexConnectionState & {socket: WebSocket, eventHandlers: Readonly<CodexSocketEventHandlers>}} connectionState */
  removeSocketEventHandlers(connectionState) {
    for (const [type, handler] of Object.entries(connectionState.eventHandlers)) {
      connectionState.socket.removeEventListener(type, handler);
    }
  }

  /** @param {unknown} error */
  rejectPendingRequests(error) {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }

  /**
   * @param {WebSocket} socket
   * @param {unknown} error
   * @param {string} reason
   */
  disconnectSocket(socket, error, reason) {
    const connectionState = this.connectionState;
    if (!('socket' in connectionState)) return;
    if (connectionState.socket !== socket) return;

    if (connectionState.phase === CODEX_CONNECTION_PHASE.CONNECTING) {
      clearTimeout(connectionState.timeout);
      connectionState.reject(error);
    }
    this.removeSocketEventHandlers(connectionState);
    this.makeThreadUnavailable();
    this.transitionConnection(createConnectionState(CODEX_CONNECTION_PHASE.DISCONNECTED));
    this.rejectPendingRequests(error);
    this.emit('status', { connected: false, reason });
  }

  close() {
    if (this.closed) return;

    const error = new Error('Codex client is closed.');
    const connectionState = this.connectionState;
    if (connectionState.phase === CODEX_CONNECTION_PHASE.CONNECTING) {
      clearTimeout(connectionState.timeout);
      connectionState.reject(error);
    }
    if ('socket' in connectionState) this.removeSocketEventHandlers(connectionState);
    this.makeThreadUnavailable();
    this.transitionConnection(createConnectionState(CODEX_CONNECTION_PHASE.CLOSED));
    this.rejectPendingRequests(error);
    if ('socket' in connectionState) {
      this.emit('status', { connected: false, reason: error.message });
      this.closeSocket(connectionState.socket);
    }
  }

  /** @param {unknown} raw */
  handleMessage(raw) {
    const message = parseJsonRpcMessage(raw);
    if (this.handleResponse(message)) return;
    dispatchCodexNotification(message, (type, detail) => this.emit(type, detail));
  }

  /**
   * @param {Record<string, unknown>} message
   * @returns {boolean}
   */
  handleResponse(message) {
    if (!Object.hasOwn(message, 'id')) return false;
    if (typeof message.id !== 'number') return true;
    const pending = this.pending.get(message.id);
    if (!pending) return true;

    this.pending.delete(message.id);
    if (isRecord(message.error)) {
      const errorMessage =
        typeof message.error.message === 'string' ? message.error.message : 'Codex request failed.';
      pending.reject(new Error(errorMessage));
    } else {
      pending.resolve(message.result);
    }
    return true;
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} params
   * @returns {Promise<unknown>}
   */
  request(method, params) {
    if (this.closed) return Promise.reject(new Error('Codex client is closed.'));
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error('Codex client is not connected.'));

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      try {
        socket.send(JSON.stringify({ method, id, params }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} params
   */
  notify(method, params) {
    if (this.closed) throw new Error('Codex client is closed.');
    const socket = this.socket;
    if (!socket) throw new Error('Codex client is not connected.');
    socket.send(JSON.stringify({ method, params }));
  }

  /** @returns {Promise<string>} */
  async ensureThread() {
    await this.connect();
    if (this.threadState.phase === CODEX_THREAD_PHASE.READY) {
      return this.threadState.threadId;
    }
    if (
      this.threadState.phase === CODEX_THREAD_PHASE.RESUMING ||
      this.threadState.phase === CODEX_THREAD_PHASE.STARTING
    ) {
      return this.threadState.promise;
    }
    if (this.threadState.phase === CODEX_THREAD_PHASE.SAVED) {
      return this.resumeThread(this.threadState.threadId);
    }
    return this.startThread();
  }

  /**
   * @param {string} threadId
   * @returns {Promise<string>}
   */
  resumeThread(threadId) {
    /** @type {Deferred<string>} */
    const deferred = this.createDeferred();
    const resumingState = createThreadState(CODEX_THREAD_PHASE.RESUMING, {
      threadId,
      promise: deferred.promise,
    });
    this.transitionThread(resumingState);

    void this.request('thread/resume', { threadId }).then(
      () => {
        if (this.threadState !== resumingState) {
          deferred.reject(new Error('Codex thread selection changed while resuming.'));
          return;
        }
        this.transitionThread(createThreadState(CODEX_THREAD_PHASE.READY, { threadId }));
        deferred.resolve(threadId);
      },
      (resumeError) => {
        if (this.threadState !== resumingState) {
          deferred.reject(resumeError);
          return;
        }
        this.transitionThread(createThreadState(CODEX_THREAD_PHASE.SAVED, { threadId }));
        deferred.reject(resumeError);
      },
    );
    return deferred.promise;
  }

  /** @returns {Promise<string>} */
  startThread() {
    /** @type {Deferred<string>} */
    const deferred = this.createDeferred();
    const startingState = createThreadState(CODEX_THREAD_PHASE.STARTING, {
      promise: deferred.promise,
    });
    this.transitionThread(startingState);

    void this.request('thread/start', {
      cwd: null,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      baseInstructions:
        'You are the Chalk learning coach. Teach clearly and encouragingly. Analyze handwritten work carefully, point out the first useful next step, and never claim to read something that is not visible. Write inline mathematical notation as \\(LaTeX\\) and display equations as $$LaTeX$$. When designing lessons, return valid JSON only when the prompt requests JSON.',
    }).then(
      (response) => {
        if (this.threadState !== startingState) {
          deferred.reject(new Error('Codex thread selection changed while starting.'));
          return;
        }
        try {
          const threadId = readStartedThreadId(response);
          this.transitionThread(createThreadState(CODEX_THREAD_PHASE.READY, { threadId }));
          localStorage.setItem('chalk-codex-thread', threadId);
          deferred.resolve(threadId);
        } catch (error) {
          this.transitionThread(createThreadState(CODEX_THREAD_PHASE.EMPTY));
          deferred.reject(error);
        }
      },
      (error) => {
        if (this.threadState === startingState) {
          this.transitionThread(createThreadState(CODEX_THREAD_PHASE.EMPTY));
        }
        deferred.reject(error);
      },
    );
    return deferred.promise;
  }

  /**
   * @template Result
   * @returns {Deferred<Result>}
   */
  createDeferred() {
    /** @type {(value: Result | PromiseLike<Result>) => void} */
    let resolvePromise = () => {};
    /** @type {(reason?: unknown) => void} */
    let rejectPromise = () => {};
    /** @type {Promise<Result>} */
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    return { promise, resolve: resolvePromise, reject: rejectPromise };
  }

  /** @param {string | null | undefined} threadId */
  resetThreadState(threadId) {
    const nextState = threadId
      ? createThreadState(CODEX_THREAD_PHASE.SAVED, { threadId })
      : createThreadState(CODEX_THREAD_PHASE.EMPTY);
    if (this.threadState.phase === CODEX_THREAD_PHASE.SAVED && threadId) {
      this.transitionThread(createThreadState(CODEX_THREAD_PHASE.EMPTY));
    }
    this.transitionThread(nextState);
  }

  makeThreadUnavailable() {
    if (
      this.threadState.phase === CODEX_THREAD_PHASE.EMPTY ||
      this.threadState.phase === CODEX_THREAD_PHASE.SAVED
    ) {
      return;
    }
    const nextState = this.threadId
      ? createThreadState(CODEX_THREAD_PHASE.SAVED, { threadId: this.threadId })
      : createThreadState(CODEX_THREAD_PHASE.EMPTY);
    this.transitionThread(nextState);
  }

  /**
   * @param {string} text
   * @param {string | null} [imageUrl]
   * @returns {Promise<unknown>}
   */
  async send(text, imageUrl = null) {
    const threadId = await this.ensureThread();
    /** @type {(CodexTextInput | CodexImageInput)[]} */
    const input = [{ type: 'text', text, text_elements: [] }];
    if (imageUrl) input.push({ type: 'image', url: imageUrl, detail: 'high' });
    return this.request('turn/start', { threadId, input });
  }
}
