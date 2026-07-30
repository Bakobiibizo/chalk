import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  CHAT_POPOUT_CHANNEL,
  createChatPopoutLifecycle,
} from '../electron/chat-popout-lifecycle.js';

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

  invoke(channel, ...arguments_) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}.`);
    return handler({ sender: {} }, ...arguments_);
  }
}

class TrackedWindow extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.actions = [];
    this.destroyed = false;
    this.minimized = false;
    this.loadedUrls = [];
    TrackedWindow.instances.push(this);
  }

  async loadURL(url) {
    this.actions.push('load');
    this.loadedUrls.push(url);
  }

  isDestroyed() {
    return this.destroyed;
  }

  isMinimized() {
    return this.minimized;
  }

  restore() {
    this.actions.push('restore');
    this.minimized = false;
  }

  show() {
    this.actions.push('show');
  }

  focus() {
    this.actions.push('focus');
  }

  close() {
    this.actions.push('close');
    this.destroyed = true;
    this.emit('closed');
  }
}

function createFixture() {
  TrackedWindow.instances = [];
  const ipcMain = new TrackedIpcMain();
  const lifecycle = createChatPopoutLifecycle({
    ipcMainAdapter: ipcMain,
    browserWindowAdapter: TrackedWindow,
  });
  return { ipcMain, lifecycle };
}

test('chat popout creation preserves window options, data loading, showing, and focus', async () => {
  const fixture = createFixture();
  fixture.lifecycle.initialize();

  const result = await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, '<main>2 + 2</main>');
  const window = TrackedWindow.instances[0];

  assert.equal(result, true);
  assert.equal(TrackedWindow.instances.length, 1);
  assert.deepEqual(window.options, {
    title: 'Chalk Chat',
    width: 430,
    height: 760,
    minWidth: 320,
    minHeight: 420,
    parent: undefined,
    backgroundColor: '#1f201d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  assert.deepEqual(window.loadedUrls, [
    'data:text/html;charset=utf-8,%3Cmain%3E2%20%2B%202%3C%2Fmain%3E',
  ]);
  assert.deepEqual(window.actions, ['load', 'show', 'focus']);

  window.emit('ready-to-show');
  assert.deepEqual(window.actions, ['load', 'show', 'focus', 'show']);
  fixture.lifecycle.destroy();
});

test('chat popout reuses the active window and restores it before showing and focusing', async () => {
  const fixture = createFixture();
  fixture.lifecycle.initialize();
  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'first');
  const window = TrackedWindow.instances[0];
  window.minimized = true;

  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'second');

  assert.equal(TrackedWindow.instances.length, 1);
  assert.deepEqual(window.loadedUrls, [
    'data:text/html;charset=utf-8,first',
    'data:text/html;charset=utf-8,second',
  ]);
  assert.deepEqual(window.actions, ['load', 'show', 'focus', 'load', 'restore', 'show', 'focus']);
  fixture.lifecycle.destroy();
});

test('closed and destroyed popouts are replaced without clearing a newer active window', async () => {
  const fixture = createFixture();
  fixture.lifecycle.initialize();
  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'first');
  const firstWindow = TrackedWindow.instances[0];

  firstWindow.emit('closed');
  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'second');
  const secondWindow = TrackedWindow.instances[1];
  firstWindow.emit('closed');
  secondWindow.destroyed = true;
  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'third');

  assert.equal(TrackedWindow.instances.length, 3);
  assert.deepEqual(
    TrackedWindow.instances.map((window) => window.loadedUrls),
    [
      ['data:text/html;charset=utf-8,first'],
      ['data:text/html;charset=utf-8,second'],
      ['data:text/html;charset=utf-8,third'],
    ],
  );
  fixture.lifecycle.destroy();
});

test('chat popout IPC registration and destruction are idempotent and disposable', async () => {
  const fixture = createFixture();

  assert.equal(fixture.lifecycle.initialize(), true);
  assert.equal(fixture.lifecycle.initialize(), false);
  assert.deepEqual(fixture.ipcMain.registeredChannels, [CHAT_POPOUT_CHANNEL]);
  await fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'content');
  const window = TrackedWindow.instances[0];

  assert.equal(fixture.lifecycle.destroy(), true);
  assert.equal(fixture.lifecycle.destroy(), false);
  assert.deepEqual(fixture.ipcMain.removedChannels, [CHAT_POPOUT_CHANNEL]);
  assert.deepEqual(window.actions, ['load', 'show', 'focus', 'close']);
  assert.throws(
    () => fixture.ipcMain.invoke(CHAT_POPOUT_CHANNEL, 'after destroy'),
    /No handler registered/,
  );
});
