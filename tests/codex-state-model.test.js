import assert from 'node:assert/strict';
import test from 'node:test';

import { CodexClient } from '../src/codex-client.js';
import {
  CODEX_CONNECTION_PHASE,
  CODEX_THREAD_PHASE,
  createConnectionState,
  createThreadState,
  transitionConnectionState,
  transitionThreadState,
} from '../src/codex-client-state.js';

class MemoryStorage {
  constructor(entries = []) {
    this.entries = new Map(entries);
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

class FakeSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closeCalls = 0;
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  respond(id, result) {
    this.dispatchMessage({ id, result });
  }

  respondWithError(id, message) {
    this.dispatchMessage({ id, error: { message } });
  }

  dispatchMessage(message) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: JSON.stringify(message) });
    this.dispatchEvent(event);
  }

  dispatchRawMessage(raw) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: raw });
    this.dispatchEvent(event);
  }

  disconnect(reason = 'Service stopped.') {
    this.readyState = 3;
    const event = new Event('close');
    Object.defineProperty(event, 'reason', { value: reason });
    this.dispatchEvent(event);
  }

  close() {
    this.closeCalls += 1;
    this.readyState = 2;
  }
}

function installCodexClientGlobals(context, savedThreadId = null) {
  const previousLocalStorage = globalThis.localStorage;
  const previousWebSocket = globalThis.WebSocket;
  const storage = new MemoryStorage(savedThreadId ? [['chalk-codex-thread', savedThreadId]] : []);
  const sockets = [];

  globalThis.localStorage = storage;
  globalThis.WebSocket = class extends FakeSocket {
    constructor(url) {
      super(url);
      sockets.push(this);
    }
  };

  context.after(() => {
    if (previousLocalStorage) globalThis.localStorage = previousLocalStorage;
    else delete globalThis.localStorage;
    if (previousWebSocket) globalThis.WebSocket = previousWebSocket;
    else delete globalThis.WebSocket;
  });

  return { sockets, storage };
}

async function openConnection(client, socket) {
  const connection = client.connect();
  socket.open();
  const initializeRequest = socket.sent.find((message) => message.method === 'initialize');
  assert.ok(initializeRequest);
  socket.respond(initializeRequest.id, {});
  await connection;
}

function findLastRequest(socket, method) {
  return socket.sent.findLast((message) => message.method === method);
}

test('connection state covers connect, concurrent connect, open, close, and destroy', async (context) => {
  const { sockets } = installCodexClientGlobals(context);
  const client = new CodexClient('ws://localhost/codex');

  assert.deepEqual(client.connectionState, { phase: CODEX_CONNECTION_PHASE.DISCONNECTED });

  const firstConnection = client.connect();
  const concurrentConnection = client.connect();
  assert.equal(concurrentConnection, firstConnection);
  assert.equal(sockets.length, 1);
  assert.equal(client.connectionState.phase, CODEX_CONNECTION_PHASE.CONNECTING);
  assert.equal(client.connectionState.promise, firstConnection);

  const socket = sockets[0];
  socket.open();
  const initializeRequest = findLastRequest(socket, 'initialize');
  socket.respond(initializeRequest.id, {});
  await firstConnection;

  assert.equal(client.connectionState.phase, CODEX_CONNECTION_PHASE.CONNECTED);
  assert.equal(client.connected, true);
  assert.equal(Object.hasOwn(client.connectionState, 'promise'), false);

  socket.disconnect('Codex restarted.');
  assert.deepEqual(client.connectionState, { phase: CODEX_CONNECTION_PHASE.DISCONNECTED });
  assert.equal(client.connected, false);

  const reconnecting = client.connect();
  assert.equal(client.connectionState.phase, CODEX_CONNECTION_PHASE.CONNECTING);
  const reconnectSocket = sockets[1];
  client.close();

  await assert.rejects(reconnecting, /Codex client is closed/);
  assert.deepEqual(client.connectionState, { phase: CODEX_CONNECTION_PHASE.CLOSED });
  assert.equal(reconnectSocket.closeCalls, 1);
  assert.throws(
    () =>
      transitionConnectionState(
        client.connectionState,
        createConnectionState(CODEX_CONNECTION_PHASE.DISCONNECTED),
      ),
    /closed -> disconnected/,
  );
});

test('saved thread transitions through resume success and becomes saved on disconnect', async (context) => {
  const { sockets, storage } = installCodexClientGlobals(context, 'thread-saved');
  const client = new CodexClient('ws://localhost/codex');
  const socket = sockets[0] ?? null;
  assert.equal(socket, null);
  assert.deepEqual(client.threadState, {
    phase: CODEX_THREAD_PHASE.SAVED,
    threadId: 'thread-saved',
  });

  const connection = client.connect();
  const createdSocket = sockets[0];
  createdSocket.open();
  const initializeRequest = findLastRequest(createdSocket, 'initialize');
  createdSocket.respond(initializeRequest.id, {});
  await connection;

  const resumedThread = client.ensureThread();
  await Promise.resolve();
  assert.equal(client.threadState.phase, CODEX_THREAD_PHASE.RESUMING);
  const resumeRequest = findLastRequest(createdSocket, 'thread/resume');
  assert.deepEqual(resumeRequest.params, { threadId: 'thread-saved' });

  createdSocket.respond(resumeRequest.id, {});
  assert.equal(await resumedThread, 'thread-saved');
  assert.deepEqual(client.threadState, {
    phase: CODEX_THREAD_PHASE.READY,
    threadId: 'thread-saved',
  });

  createdSocket.disconnect();
  assert.deepEqual(client.threadState, {
    phase: CODEX_THREAD_PHASE.SAVED,
    threadId: 'thread-saved',
  });
  assert.equal(storage.getItem('chalk-codex-thread'), 'thread-saved');
  client.close();
});

test('failed resume preserves the saved thread and propagates the error', async (context) => {
  const { sockets, storage } = installCodexClientGlobals(context, 'thread-expired');
  const client = new CodexClient('ws://localhost/codex');
  client.connect();
  const socket = sockets[0];
  await openConnection(client, socket);

  const ensuredThread = client.ensureThread();
  await Promise.resolve();
  const resumeRequest = findLastRequest(socket, 'thread/resume');
  socket.respondWithError(resumeRequest.id, 'Thread was not found.');
  await assert.rejects(ensuredThread, /Thread was not found/);

  assert.deepEqual(client.threadState, {
    phase: CODEX_THREAD_PHASE.SAVED,
    threadId: 'thread-expired',
  });
  assert.equal(storage.getItem('chalk-codex-thread'), 'thread-expired');
  assert.equal(socket.sent.filter((message) => message.method === 'thread/start').length, 0);
  client.close();
});

test('empty thread starts once and concurrent callers share the preparation', async (context) => {
  const { sockets } = installCodexClientGlobals(context);
  const client = new CodexClient('ws://localhost/codex');
  const connection = client.connect();
  const socket = sockets[0];
  socket.open();
  const initializeRequest = findLastRequest(socket, 'initialize');
  socket.respond(initializeRequest.id, {});
  await connection;

  const firstThread = client.ensureThread();
  const concurrentThread = client.ensureThread();
  await Promise.resolve();
  assert.equal(client.threadState.phase, CODEX_THREAD_PHASE.STARTING);
  assert.equal(socket.sent.filter((message) => message.method === 'thread/start').length, 1);

  const startRequest = findLastRequest(socket, 'thread/start');
  socket.respond(startRequest.id, { thread: { id: 'thread-new' } });
  assert.equal(await firstThread, 'thread-new');
  assert.equal(await concurrentThread, 'thread-new');
  assert.equal(client.threadState.phase, CODEX_THREAD_PHASE.READY);
  client.close();
  assert.equal(client.connectionState.phase, CODEX_CONNECTION_PHASE.CLOSED);
  assert.deepEqual(client.threadState, {
    phase: CODEX_THREAD_PHASE.SAVED,
    threadId: 'thread-new',
  });
});

test('invalid JSON-RPC messages disconnect the client instead of being ignored', async (context) => {
  const { sockets } = installCodexClientGlobals(context);
  const client = new CodexClient('ws://localhost/codex');
  const connection = client.connect();
  const socket = sockets[0];
  socket.open();
  const initializeRequest = findLastRequest(socket, 'initialize');
  socket.respond(initializeRequest.id, {});
  await connection;

  socket.dispatchRawMessage('{invalid');

  assert.deepEqual(client.connectionState, { phase: CODEX_CONNECTION_PHASE.DISCONNECTED });
  assert.equal(socket.closeCalls, 1);
  client.close();
});

test('state factories reject incomplete states and transition functions reject impossible edges', () => {
  const disconnected = createConnectionState(CODEX_CONNECTION_PHASE.DISCONNECTED);
  const empty = createThreadState(CODEX_THREAD_PHASE.EMPTY);

  assert.throws(
    () => createConnectionState(CODEX_CONNECTION_PHASE.CONNECTING),
    /requires a socket/,
  );
  assert.throws(
    () =>
      transitionConnectionState(
        disconnected,
        createConnectionState(CODEX_CONNECTION_PHASE.CLOSED),
      ) &&
      transitionConnectionState(createConnectionState(CODEX_CONNECTION_PHASE.CLOSED), disconnected),
    /closed -> disconnected/,
  );
  assert.throws(
    () => createThreadState(CODEX_THREAD_PHASE.READY),
    /requires a non-empty thread ID/,
  );
  assert.throws(
    () =>
      transitionThreadState(
        empty,
        createThreadState(CODEX_THREAD_PHASE.READY, { threadId: 'thread-impossible' }),
      ),
    /empty -> ready/,
  );
});
