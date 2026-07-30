import { CodexClient } from './codex-client.js';
import { currentCoachTime } from './coach-runtime-factories.js';

/**
 * @typedef {import('./coach-contracts.js').CoachDesktopBridge} CoachDesktopBridge
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {import('./coach-contracts.js').CoachThread} CoachThread
 *
 * @typedef {{
 *   text: string,
 *   resolve: (value: string | PromiseLike<string>) => void,
 *   reject: (reason?: unknown) => void,
 *   onDelta?: (text: string) => void,
 * }} ActiveCoachRequest
 *
 * @typedef {{connected: boolean, reason?: string}} CodexStatusDetail
 * @typedef {{text: string}} CodexTextDetail
 * @typedef {{message: string}} CodexErrorDetail
 */

/**
 * @param {{
 *   configuredUrl?: string | null,
 *   desktopBridge?: CoachDesktopBridge | null,
 *   location: Pick<Location, 'protocol' | 'host'>,
 * }} options
 * @returns {string}
 */
function resolveCodexUrl({ configuredUrl, desktopBridge, location }) {
  const desktopUrl =
    desktopBridge?.codexPort && desktopBridge?.codexToken
      ? `ws://127.0.0.1:${desktopBridge.codexPort}/codex?token=${encodeURIComponent(desktopBridge.codexToken)}`
      : null;
  return (
    configuredUrl ||
    desktopUrl ||
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/codex`
  );
}

export class CodexCoachService {
  /**
   * @param {{
   *   configuredUrl?: string | null,
   *   desktopBridge?: CoachDesktopBridge | null,
   *   location: Pick<Location, 'protocol' | 'host'>,
   *   statusElement: HTMLElement,
   *   activeSession: () => CoachSession | null,
   *   activeThread: () => CoachThread | null,
   *   persistSession: () => void,
   *   createClient?: (url: string) => CodexClient,
   *   createTimestamp?: () => string,
   * }} options
   */
  constructor({
    configuredUrl,
    desktopBridge,
    location,
    statusElement,
    activeSession,
    activeThread,
    persistSession,
    createClient = (url) => new CodexClient(url),
    createTimestamp = () => currentCoachTime().toISOString(),
  }) {
    this.client = createClient(resolveCodexUrl({ configuredUrl, desktopBridge, location }));
    this.statusElement = statusElement;
    this.activeSession = activeSession;
    this.activeThread = activeThread;
    this.persistSession = persistSession;
    this.createTimestamp = createTimestamp;
    /** @type {ActiveCoachRequest | null} */
    this.activeRequest = null;
    this.initialized = false;
    this.destroyed = false;
    /** @type {Readonly<Record<string, EventListener>>} */
    this.clientEventHandlers = Object.freeze({
      status: (event) => this.handleStatus(/** @type {CustomEvent<CodexStatusDetail>} */ (event)),
      delta: (event) => this.handleDelta(/** @type {CustomEvent<CodexTextDetail>} */ (event)),
      message: (event) => this.handleMessage(/** @type {CustomEvent<CodexTextDetail>} */ (event)),
      complete: () => this.handleComplete(),
      error: (event) => this.handleError(/** @type {CustomEvent<CodexErrorDetail>} */ (event)),
    });
  }

  get isActive() {
    return this.activeRequest !== null;
  }

  initialize() {
    if (this.initialized || this.destroyed) return;
    for (const [type, handler] of Object.entries(this.clientEventHandlers)) {
      this.client.addEventListener(type, handler);
    }
    this.initialized = true;
  }

  /** @param {CustomEvent<CodexStatusDetail>} event */
  handleStatus(event) {
    this.statusElement.classList.toggle('connected', event.detail.connected);
    this.statusElement.title = event.detail.connected
      ? 'Connected to Codex app service'
      : event.detail.reason || 'Codex app service is offline';
  }

  /** @param {CustomEvent<CodexTextDetail>} event */
  handleDelta(event) {
    if (!this.activeRequest) return;
    this.activeRequest.text += event.detail.text;
    this.activeRequest.onDelta?.(this.activeRequest.text);
  }

  /** @param {CustomEvent<CodexTextDetail>} event */
  handleMessage(event) {
    if (!this.activeRequest || this.activeRequest.text) return;
    this.activeRequest.text = event.detail.text;
    this.activeRequest.onDelta?.(this.activeRequest.text);
  }

  handleComplete() {
    if (!this.activeRequest) return;
    const request = this.activeRequest;
    this.activeRequest = null;
    request.resolve(request.text);
  }

  /** @param {CustomEvent<CodexErrorDetail>} event */
  handleError(event) {
    if (!this.activeRequest) return;
    const request = this.activeRequest;
    this.activeRequest = null;
    request.reject(new Error(event.detail.message));
  }

  /** @returns {Promise<void>} */
  connect() {
    if (this.destroyed) return Promise.reject(new Error('Codex coach service has been destroyed.'));
    this.initialize();
    return this.client.connect();
  }

  /** @param {string | null} threadId */
  useThread(threadId) {
    this.client.useThread(threadId);
  }

  /**
   * @param {string} prompt
   * @param {string | null} [imageUrl]
   * @param {((text: string) => void) | undefined} [onDelta]
   * @returns {Promise<string>}
   */
  run(prompt, imageUrl = null, onDelta = undefined) {
    if (this.destroyed) return Promise.reject(new Error('Codex coach service has been destroyed.'));
    this.initialize();
    if (this.activeRequest)
      return Promise.reject(new Error('Codex is already working on a request.'));
    return new Promise((resolve, reject) => {
      const request = { text: '', resolve, reject, onDelta };
      this.activeRequest = request;
      void this.client.send(prompt, imageUrl).then(
        () => {
          if (this.activeRequest !== request) return;
          this.synchronizeThread();
        },
        (error) => {
          if (this.activeRequest !== request) return;
          this.activeRequest = null;
          reject(error);
        },
      );
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.initialized) {
      for (const [type, handler] of Object.entries(this.clientEventHandlers)) {
        this.client.removeEventListener(type, handler);
      }
      this.initialized = false;
    }
    if (this.activeRequest) {
      const request = this.activeRequest;
      this.activeRequest = null;
      request.reject(new Error('Codex coach service has been destroyed.'));
    }
    this.client.close();
  }

  synchronizeThread() {
    const session = this.activeSession();
    if (!session || session.codexThreadId === this.client.threadId) return;
    session.codexThreadId = this.client.threadId;
    const thread = this.activeThread();
    if (thread) {
      thread.codexThreadId = this.client.threadId;
      thread.updatedAt = this.createTimestamp();
    }
    this.persistSession();
  }
}
