import assert from 'node:assert/strict';
import test from 'node:test';

import { GRIST_PARSE_CHANNEL, createGristIpc } from '../electron/grist-ipc.js';

class TrackedIpcMain {
  constructor() {
    this.handlers = new Map();
    this.registeredChannels = [];
    this.removedChannels = [];
  }

  handle(channel, handler) {
    this.registeredChannels.push(channel);
    this.handlers.set(channel, handler);
  }

  removeHandler(channel) {
    this.removedChannels.push(channel);
    this.handlers.delete(channel);
  }

  invoke(channel, text) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}.`);
    return handler({ sender: {} }, text);
  }
}

test('Grist IPC delegates model output to the injected parser', async () => {
  const ipcMain = new TrackedIpcMain();
  const requests = [];
  const gristIpc = createGristIpc({
    ipcMainAdapter: ipcMain,
    parseModelJson: async (text) => {
      requests.push(text);
      return { parser: 'grist' };
    },
  });

  assert.equal(gristIpc.initialize(), true);
  assert.deepEqual(await ipcMain.invoke(GRIST_PARSE_CHANNEL, 'model output'), {
    parser: 'grist',
  });
  assert.deepEqual(requests, ['model output']);
  gristIpc.destroy();
});

test('Grist IPC registration and destruction are idempotent', () => {
  const ipcMain = new TrackedIpcMain();
  const gristIpc = createGristIpc({
    ipcMainAdapter: ipcMain,
    parseModelJson: () => ({}),
  });

  assert.equal(gristIpc.initialize(), true);
  assert.equal(gristIpc.initialize(), false);
  assert.deepEqual(ipcMain.registeredChannels, [GRIST_PARSE_CHANNEL]);
  assert.equal(gristIpc.destroy(), true);
  assert.equal(gristIpc.destroy(), false);
  assert.deepEqual(ipcMain.removedChannels, [GRIST_PARSE_CHANNEL]);
  assert.throws(
    () => ipcMain.invoke(GRIST_PARSE_CHANNEL, 'after destroy'),
    /No handler registered/,
  );
});
