import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  WINDOW_CONTROL_CHANNELS,
  createWindowControlsIpc,
} from '../electron/window-controls-ipc.js';

class TrackedIpcMain extends EventEmitter {
  constructor() {
    super();
    this.addedListeners = [];
    this.removedListeners = [];
  }

  on(channel, listener) {
    this.addedListeners.push({ channel, listener });
    return super.on(channel, listener);
  }

  removeListener(channel, listener) {
    this.removedListeners.push({ channel, listener });
    return super.removeListener(channel, listener);
  }
}

class TrackedWindow extends EventEmitter {
  constructor() {
    super();
    this.actions = [];
    this.maximized = false;
    this.sentMessages = [];
    this.webContents = {
      send: (...arguments_) => this.sentMessages.push(arguments_),
    };
  }

  minimize() {
    this.actions.push('minimize');
  }

  maximize() {
    this.actions.push('maximize');
    this.maximized = true;
  }

  unmaximize() {
    this.actions.push('unmaximize');
    this.maximized = false;
  }

  isMaximized() {
    return this.maximized;
  }

  close() {
    this.actions.push('close');
  }
}

function createFixture() {
  const ipcMain = new TrackedIpcMain();
  const windowsBySender = new Map();
  const windowControls = createWindowControlsIpc({
    ipcMainAdapter: ipcMain,
    browserWindowAdapter: {
      fromWebContents: (sender) => windowsBySender.get(sender),
    },
  });
  return { ipcMain, windowsBySender, windowControls };
}

test('window control handlers resolve and act on only the sender window', () => {
  const fixture = createFixture();
  const sender = {};
  const otherSender = {};
  const window = new TrackedWindow();
  const otherWindow = new TrackedWindow();
  fixture.windowsBySender.set(sender, window);
  fixture.windowsBySender.set(otherSender, otherWindow);
  fixture.windowControls.initialize();

  fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.minimize, { sender });
  fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.toggleMaximize, { sender });
  fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.toggleMaximize, { sender });
  fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.close, { sender });

  assert.deepEqual(window.actions, ['minimize', 'maximize', 'unmaximize', 'close']);
  assert.deepEqual(otherWindow.actions, []);
  fixture.windowControls.destroy();
});

test('window control handlers ignore events whose sender has no window', () => {
  const fixture = createFixture();
  const sender = {};
  fixture.windowControls.initialize();

  assert.doesNotThrow(() => {
    fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.minimize, { sender });
    fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.toggleMaximize, { sender });
    fixture.ipcMain.emit(WINDOW_CONTROL_CHANNELS.close, { sender });
  });
  fixture.windowControls.destroy();
});

test('maximized-state registration sends state changes and disposes idempotently', () => {
  const fixture = createFixture();
  const window = new TrackedWindow();

  const firstDispose = fixture.windowControls.registerWindow(window);
  const secondDispose = fixture.windowControls.registerWindow(window);
  window.maximized = true;
  window.emit('maximize');
  window.maximized = false;
  window.emit('unmaximize');

  assert.equal(firstDispose, secondDispose);
  assert.deepEqual(window.sentMessages, [
    [WINDOW_CONTROL_CHANNELS.maximizedState, true],
    [WINDOW_CONTROL_CHANNELS.maximizedState, false],
  ]);
  assert.equal(firstDispose(), true);
  assert.equal(firstDispose(), false);

  window.maximized = true;
  window.emit('maximize');
  assert.equal(window.sentMessages.length, 2);
});

test('IPC initialization and destruction are idempotent and release tracked windows', () => {
  const fixture = createFixture();
  const window = new TrackedWindow();
  fixture.windowControls.registerWindow(window);

  assert.equal(fixture.windowControls.initialize(), true);
  assert.equal(fixture.windowControls.initialize(), false);
  assert.equal(fixture.ipcMain.addedListeners.length, 3);
  assert.equal(fixture.windowControls.destroy(), true);
  assert.equal(fixture.windowControls.destroy(), false);
  assert.equal(fixture.ipcMain.removedListeners.length, 3);

  for (const addedListener of fixture.ipcMain.addedListeners) {
    assert.deepEqual(
      fixture.ipcMain.removedListeners.find(
        (removedListener) => removedListener.channel === addedListener.channel,
      ),
      addedListener,
    );
  }
  assert.equal(window.listenerCount('maximize'), 0);
  assert.equal(window.listenerCount('unmaximize'), 0);
  assert.equal(window.listenerCount('closed'), 0);
});

test('closed windows release their maximized-state registration', () => {
  const fixture = createFixture();
  const window = new TrackedWindow();
  const dispose = fixture.windowControls.registerWindow(window);

  window.emit('closed');

  assert.equal(dispose(), false);
  assert.equal(window.listenerCount('maximize'), 0);
  assert.equal(window.listenerCount('unmaximize'), 0);
  assert.equal(window.listenerCount('closed'), 0);
  assert.equal(fixture.windowControls.destroy(), false);
});
