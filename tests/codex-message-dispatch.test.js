import assert from 'node:assert/strict';
import test from 'node:test';

import { CodexClient } from '../src/codex-client.js';
import {
  CODEX_NOTIFICATION_HANDLERS,
  dispatchCodexNotification,
} from '../src/codex-notification-dispatcher.js';

class MemoryStorage {
  constructor() {
    this.entries = new Map();
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    this.entries.set(key, String(value));
  }

  removeItem(key) {
    this.entries.delete(key);
  }
}

function createClient(context) {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  context.after(() => {
    if (previousLocalStorage) globalThis.localStorage = previousLocalStorage;
    else delete globalThis.localStorage;
  });
  return new CodexClient('ws://localhost/codex');
}

function addPendingRequest(client, id) {
  let resolveRequest;
  let rejectRequest;
  const result = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  client.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
  return result;
}

test('CodexClient correlates successful and failed responses independently of notifications', async (context) => {
  const client = createClient(context);
  const emitted = [];
  client.emit = (type, detail) => emitted.push({ type, detail });

  const successfulRequest = addPendingRequest(client, 41);
  client.handleMessage(JSON.stringify({ id: 41, result: { thread: { id: 'thread-1' } } }));
  assert.deepEqual(await successfulRequest, { thread: { id: 'thread-1' } });
  assert.equal(client.pending.has(41), false);

  const failedRequest = addPendingRequest(client, 42);
  client.handleMessage(JSON.stringify({ id: 42, error: { message: 'Request rejected.' } }));
  await assert.rejects(failedRequest, /Request rejected/);
  assert.equal(client.pending.has(42), false);

  client.handleMessage(
    JSON.stringify({
      id: 999,
      method: 'item/agentMessage/delta',
      params: { delta: 'not a notification' },
    }),
  );
  assert.deepEqual(emitted, []);
});

test('Codex notification handler map dispatches each supported method', () => {
  assert.deepEqual(Object.keys(CODEX_NOTIFICATION_HANDLERS), [
    'item/agentMessage/delta',
    'item/completed',
    'turn/completed',
    'error',
  ]);

  const emitted = [];
  const emit = (type, detail) => emitted.push({ type, detail });
  const turn = { id: 'turn-1', status: 'completed' };

  assert.equal(
    dispatchCodexNotification(
      { method: 'item/agentMessage/delta', params: { delta: 'First' } },
      emit,
    ),
    true,
  );
  assert.equal(
    dispatchCodexNotification(
      {
        method: 'item/completed',
        params: { item: { type: 'agentMessage', text: 'First response' } },
      },
      emit,
    ),
    true,
  );
  assert.equal(
    dispatchCodexNotification({ method: 'turn/completed', params: { turn } }, emit),
    true,
  );
  assert.equal(
    dispatchCodexNotification({ method: 'error', params: { message: 'Turn failed.' } }, emit),
    true,
  );

  assert.deepEqual(emitted, [
    { type: 'delta', detail: { text: 'First' } },
    { type: 'message', detail: { text: 'First response' } },
    { type: 'complete', detail: { turn } },
    { type: 'error', detail: { message: 'Turn failed.' } },
  ]);
});

test('Codex notification dispatch ignores unknown and malformed messages deterministically', () => {
  const emitted = [];
  const emit = (type, detail) => emitted.push({ type, detail });
  const ignoredMessages = [
    null,
    [],
    {},
    { method: 'unknown', params: {} },
    { method: 'toString', params: {} },
    { method: '__proto__', params: {} },
    { id: 1, method: 'error', params: { message: 'response, not notification' } },
    { method: 'item/agentMessage/delta' },
    { method: 'item/agentMessage/delta', params: { delta: 12 } },
    { method: 'item/completed', params: { item: { type: 'commandExecution', text: 'ignored' } } },
    { method: 'item/completed', params: { item: { type: 'agentMessage' } } },
    { method: 'turn/completed', params: {} },
  ];

  for (const message of ignoredMessages) {
    assert.equal(dispatchCodexNotification(message, emit), false);
  }
  assert.deepEqual(emitted, []);

  assert.equal(dispatchCodexNotification({ method: 'error' }, emit), true);
  assert.deepEqual(emitted, [{ type: 'error', detail: { message: 'Codex returned an error.' } }]);
});

test('CodexClient rejects invalid JSON and non-object protocol values', (context) => {
  const client = createClient(context);
  const pendingRequest = addPendingRequest(client, 51);

  for (const raw of ['{', 'null', '[]', '42', '"text"']) {
    assert.throws(() => client.handleMessage(raw));
  }

  assert.equal(client.pending.has(51), true);
  client.pending.delete(51);
  void pendingRequest.catch(() => {});
});
