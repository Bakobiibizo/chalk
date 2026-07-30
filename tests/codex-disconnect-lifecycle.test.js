import assert from 'node:assert/strict';
import test from 'node:test';

import { CodexClient } from '../src/codex-client.js';
import { CodexCoachService } from '../src/codex-coach-service.js';

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

class FakeSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closeCalls = 0;
    this.addedListeners = [];
    this.removedListeners = [];
  }

  addEventListener(type, listener, options) {
    this.addedListeners.push({ type, listener });
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.removedListeners.push({ type, listener });
    super.removeEventListener(type, listener, options);
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  respond(id, result) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', {
      value: JSON.stringify({ id, result }),
    });
    this.dispatchEvent(event);
  }

  close() {
    this.closeCalls += 1;
    this.readyState = 2;
  }
}

function installCodexClientGlobals(context) {
  const previousLocalStorage = globalThis.localStorage;
  const previousWebSocket = globalThis.WebSocket;
  const sockets = [];

  globalThis.localStorage = new MemoryStorage();
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

  return sockets;
}

test('CodexClient close rejects pending work, closes its socket once, and is terminal', async (context) => {
  const sockets = installCodexClientGlobals(context);
  const client = new CodexClient('ws://localhost/codex');
  const statuses = [];
  client.addEventListener('status', (event) => statuses.push(event.detail));

  const connection = client.connect();
  const socket = sockets[0];
  socket.open();
  const initializeRequest = socket.sent.find((message) => message.method === 'initialize');
  assert.ok(initializeRequest);
  socket.respond(initializeRequest.id, {});
  await connection;

  const pendingRequest = client.request('thread/start', {});
  client.close();
  client.close();

  await assert.rejects(pendingRequest, /Codex client is closed/);
  await assert.rejects(client.connect(), /Codex client is closed/);
  await assert.rejects(client.request('turn/start', {}), /Codex client is closed/);
  assert.equal(socket.closeCalls, 1);
  assert.equal(client.socket, null);
  assert.equal(client.connected, false);
  assert.equal(client.pending.size, 0);
  assert.equal(socket.addedListeners.length, 4);
  assert.equal(socket.removedListeners.length, 4);
  for (const added of socket.addedListeners) {
    assert.equal(
      socket.removedListeners.filter(
        (removed) => removed.type === added.type && removed.listener === added.listener,
      ).length,
      1,
      `expected one matching socket listener removal for ${added.type}`,
    );
  }
  assert.deepEqual(statuses, [
    { connected: true },
    { connected: false, reason: 'Codex client is closed.' },
  ]);
});

test('CodexClient close rejects an in-progress connection', async (context) => {
  const sockets = installCodexClientGlobals(context);
  const client = new CodexClient('ws://localhost/codex');
  const connection = client.connect();

  client.close();
  client.close();

  await assert.rejects(connection, /Codex client is closed/);
  assert.equal(sockets[0].closeCalls, 1);
});

class TrackingCodexClient extends EventTarget {
  constructor() {
    super();
    this.threadId = null;
    this.addedListeners = [];
    this.removedListeners = [];
    this.closeCalls = 0;
  }

  addEventListener(type, listener, options) {
    this.addedListeners.push({ type, listener });
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.removedListeners.push({ type, listener });
    super.removeEventListener(type, listener, options);
  }

  connect() {
    return Promise.resolve();
  }

  send() {
    return Promise.resolve();
  }

  useThread(threadId) {
    this.threadId = threadId;
  }

  close() {
    this.closeCalls += 1;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

test('CodexCoachService destroy unsubscribes, rejects active work, and closes once', async () => {
  const client = new TrackingCodexClient();
  const statusElement = {
    connected: false,
    classList: {
      toggle(_name, connected) {
        statusElement.connected = connected;
      },
    },
    title: '',
  };
  const service = new CodexCoachService({
    location: { protocol: 'http:', host: 'localhost' },
    statusElement,
    activeSession: () => null,
    activeThread: () => null,
    persistSession() {},
    createClient: () => client,
  });
  assert.equal(client.addedListeners.length, 0);
  const deltas = [];
  const activeRequest = service.run('Explain this', null, (text) => deltas.push(text));
  const activeRequestRejected = assert.rejects(activeRequest, /service has been destroyed/);

  client.emit('status', { connected: true });
  client.emit('delta', { text: 'First' });
  service.destroy();
  service.destroy();
  client.emit('status', { connected: false, reason: 'late event' });
  client.emit('delta', { text: ' late' });
  client.emit('complete');

  await activeRequestRejected;
  await assert.rejects(service.connect(), /service has been destroyed/);
  await assert.rejects(service.run('late request'), /service has been destroyed/);
  assert.equal(service.isActive, false);
  assert.equal(client.closeCalls, 1);
  assert.equal(statusElement.connected, true);
  assert.equal(statusElement.title, 'Connected to Codex app service');
  assert.deepEqual(deltas, ['First']);
  assert.equal(client.addedListeners.length, 5);
  assert.equal(client.removedListeners.length, 5);
  for (const added of client.addedListeners) {
    assert.equal(
      client.removedListeners.filter(
        (removed) => removed.type === added.type && removed.listener === added.listener,
      ).length,
      1,
      `expected one matching removal for ${added.type}`,
    );
  }
});
