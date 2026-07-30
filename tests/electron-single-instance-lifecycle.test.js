import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createSingleInstanceLifecycle } from '../electron/single-instance-lifecycle.js';

class TrackedApplication extends EventEmitter {
  constructor(ownsLock) {
    super();
    this.ownsLock = ownsLock;
    this.lockRequests = 0;
    this.quitRequests = 0;
  }

  requestSingleInstanceLock() {
    this.lockRequests += 1;
    return this.ownsLock;
  }

  quit() {
    this.quitRequests += 1;
  }
}

function createWindow({ minimized = false, visible = true } = {}) {
  const actions = [];
  return {
    actions,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: () => actions.push('restore'),
    show: () => actions.push('show'),
    focus: () => actions.push('focus'),
  };
}

function createFixture({ ownsLock = true, windows = [] } = {}) {
  const application = new TrackedApplication(ownsLock);
  const lifecycle = createSingleInstanceLifecycle({
    appAdapter: application,
    browserWindowAdapter: {
      getAllWindows: () => windows,
    },
  });
  return { application, lifecycle };
}

test('single-instance lifecycle quits without registering when the lock is unavailable', () => {
  const fixture = createFixture({ ownsLock: false });

  assert.equal(fixture.lifecycle.initialize(), false);
  assert.equal(fixture.lifecycle.initialize(), false);
  assert.equal(fixture.application.lockRequests, 1);
  assert.equal(fixture.application.quitRequests, 1);
  assert.equal(fixture.application.listenerCount('second-instance'), 0);
  assert.equal(fixture.lifecycle.destroy(), true);
  assert.equal(fixture.lifecycle.destroy(), false);
});

test('second-instance handling restores, shows, and focuses the primary window', () => {
  const window = createWindow({ minimized: true, visible: false });
  const fixture = createFixture({ windows: [window] });

  assert.equal(fixture.lifecycle.initialize(), true);
  assert.equal(fixture.lifecycle.initialize(), true);
  fixture.application.emit('second-instance');

  assert.equal(fixture.application.lockRequests, 1);
  assert.deepEqual(window.actions, ['restore', 'show', 'focus']);
  assert.equal(fixture.lifecycle.destroy(), true);
  assert.equal(fixture.application.listenerCount('second-instance'), 0);
  assert.equal(fixture.lifecycle.destroy(), false);
});

test('second-instance handling focuses a visible window and tolerates no windows', () => {
  const window = createWindow();
  const windows = [window];
  const fixture = createFixture({ windows });
  fixture.lifecycle.initialize();

  fixture.application.emit('second-instance');
  windows.length = 0;
  fixture.application.emit('second-instance');

  assert.deepEqual(window.actions, ['focus']);
  fixture.lifecycle.destroy();
});
