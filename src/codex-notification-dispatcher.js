/**
 * @typedef {'delta' | 'message' | 'complete' | 'error'} CodexNotificationEventType
 * @typedef {{text: string} | {turn: Record<string, unknown>} | {message: string}} CodexNotificationEventDetail
 * @typedef {(type: CodexNotificationEventType, detail: CodexNotificationEventDetail) => void} CodexNotificationEmitter
 * @typedef {(emit: CodexNotificationEmitter, params: unknown) => boolean} CodexNotificationHandler
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {CodexNotificationEmitter} emit
 * @param {unknown} params
 * @returns {boolean}
 */
function handleAgentMessageDelta(emit, params) {
  if (!isRecord(params) || typeof params.delta !== 'string') return false;
  emit('delta', { text: params.delta });
  return true;
}

/**
 * @param {CodexNotificationEmitter} emit
 * @param {unknown} params
 * @returns {boolean}
 */
function handleItemCompleted(emit, params) {
  const item = isRecord(params) ? params.item : null;
  if (!isRecord(item) || item.type !== 'agentMessage' || typeof item.text !== 'string') {
    return false;
  }
  emit('message', { text: item.text });
  return true;
}

/**
 * @param {CodexNotificationEmitter} emit
 * @param {unknown} params
 * @returns {boolean}
 */
function handleTurnCompleted(emit, params) {
  if (!isRecord(params) || !isRecord(params.turn)) return false;
  emit('complete', { turn: params.turn });
  return true;
}

/**
 * @param {CodexNotificationEmitter} emit
 * @param {unknown} params
 * @returns {boolean}
 */
function handleError(emit, params) {
  const message =
    isRecord(params) && typeof params.message === 'string' && params.message
      ? params.message
      : 'Codex returned an error.';
  emit('error', { message });
  return true;
}

/** @type {Readonly<Record<string, CodexNotificationHandler>>} */
export const CODEX_NOTIFICATION_HANDLERS = Object.freeze({
  'item/agentMessage/delta': handleAgentMessageDelta,
  'item/completed': handleItemCompleted,
  'turn/completed': handleTurnCompleted,
  error: handleError,
});

/**
 * @param {unknown} message
 * @param {CodexNotificationEmitter} emit
 * @returns {boolean}
 */
export function dispatchCodexNotification(message, emit) {
  if (!isRecord(message) || Object.hasOwn(message, 'id')) return false;
  if (typeof message.method !== 'string') return false;
  if (!Object.hasOwn(CODEX_NOTIFICATION_HANDLERS, message.method)) return false;
  const handler = CODEX_NOTIFICATION_HANDLERS[message.method];
  if (!handler) return false;
  return handler(emit, message.params);
}
