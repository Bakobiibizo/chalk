import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { CoachHistoryController, ensureCoachThreads } from '../src/coach-history-controller.js';

function createFixture(session, { createIdentifier, createTimestamp } = {}) {
  const dom = new JSDOM('<div id="history"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  const calls = {
    persisted: 0,
    restored: 0,
    synced: 0,
    focused: 0,
    threadIds: [],
  };
  let requestActive = false;
  const controller = new CoachHistoryController({
    list: dom.window.document.querySelector('#history'),
    getSession: () => session,
    persistSession: () => {
      calls.persisted += 1;
    },
    isRequestActive: () => requestActive,
    useCodexThread: (threadId) => calls.threadIds.push(threadId),
    restoreTranscript: () => {
      calls.restored += 1;
    },
    syncPopout: () => {
      calls.synced += 1;
    },
    focusPrompt: () => {
      calls.focused += 1;
    },
    createIdentifier,
    createTimestamp,
  });
  return {
    calls,
    controller,
    dom,
    close: () => {
      globalThis.document = previousDocument;
      dom.window.close();
    },
    setRequestActive: (active) => {
      requestActive = active;
    },
  };
}

test('coach history normalizes legacy transcript and thread identity in place', () => {
  const messages = [{ role: 'user', text: 'Legacy question' }];
  let identifierCalls = 0;
  let timestampCalls = 0;
  const session = {
    id: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
    coachMessages: messages,
    codexThreadId: 'legacy-thread',
  };

  const active = ensureCoachThreads(session, {
    createIdentifier: () => {
      identifierCalls += 1;
      return 7001;
    },
    createTimestamp: () => {
      timestampCalls += 1;
      return '2026-07-25T12:00:00.000Z';
    },
  });

  assert.equal(active.id, 7001);
  assert.equal(active.title, 'Project chat');
  assert.equal(active.messages, messages);
  assert.equal(active.codexThreadId, 'legacy-thread');
  assert.equal(active.createdAt, session.createdAt);
  assert.equal(active.updatedAt, '2026-07-25T12:00:00.000Z');
  assert.equal(session.activeCoachThreadId, active.id);
  assert.equal(identifierCalls, 1);
  assert.equal(timestampCalls, 1);
});

test('coach history renders escaped titles and derives a bounded first-message title', () => {
  const session = {};
  const identifierCalls = [];
  const timestampCalls = [];
  const timestamps = ['2026-07-25T12:00:00.000Z', '2026-07-25T12:01:00.000Z'];
  const fixture = createFixture(session, {
    createIdentifier: () => {
      identifierCalls.push('called');
      return 8001;
    },
    createTimestamp: () => {
      timestampCalls.push('called');
      return timestamps.shift();
    },
  });
  try {
    fixture.controller.render();
    fixture.controller.persistMessage(
      '  Explain   <script>unsafe</script> and then continue past the title limit  ',
      'user',
    );

    const thread = fixture.controller.activeThread();
    assert.equal(thread.id, 8001);
    assert.equal(thread.title, 'Explain <script>unsafe</script> and then c');
    assert.equal(thread.title.length, 42);
    assert.equal(thread.createdAt, '2026-07-25T12:00:00.000Z');
    assert.equal(thread.updatedAt, '2026-07-25T12:01:00.000Z');
    assert.equal(thread.messages[0].createdAt, '2026-07-25T12:01:00.000Z');
    assert.equal(session.updatedAt, '2026-07-25T12:01:00.000Z');
    assert.equal(session.coachMessages, thread.messages);
    assert.equal(fixture.dom.window.document.querySelector('script'), null);
    assert.match(
      fixture.dom.window.document.querySelector('b').textContent,
      /<script>unsafe<\/script>/,
    );
    assert.equal(fixture.calls.persisted, 1);
    assert.equal(fixture.calls.synced, 1);
    assert.deepEqual(identifierCalls, ['called']);
    assert.deepEqual(timestampCalls, ['called', 'called']);
  } finally {
    fixture.close();
  }
});

test('coach history creates and selects threads while guarding active Codex requests', () => {
  const session = {
    coachThreads: [
      {
        id: 1,
        title: 'First',
        messages: [],
        codexThreadId: 'codex-1',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        title: 'Second',
        messages: [],
        codexThreadId: 'codex-2',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ],
    activeCoachThreadId: 1,
    codexThreadId: 'codex-1',
  };
  const fixture = createFixture(session, {
    createIdentifier: () => 9001,
    createTimestamp: () => '2026-07-25T13:00:00.000Z',
  });
  try {
    fixture.controller.render();
    fixture.setRequestActive(true);
    fixture.dom.window.document.querySelector('[data-coach-thread="2"]').click();
    assert.equal(session.activeCoachThreadId, 1);
    assert.equal(fixture.calls.persisted, 0);

    fixture.setRequestActive(false);
    fixture.controller.selectThread(2);
    assert.equal(session.activeCoachThreadId, 2);
    assert.equal(session.codexThreadId, 'codex-2');
    assert.deepEqual(fixture.calls.threadIds, ['codex-2']);

    fixture.controller.startNewThread();
    assert.equal(session.coachThreads[0].id, 9001);
    assert.equal(session.coachThreads[0].title, 'New chat');
    assert.equal(session.coachThreads[0].createdAt, '2026-07-25T13:00:00.000Z');
    assert.equal(session.coachThreads[0].updatedAt, '2026-07-25T13:00:00.000Z');
    assert.equal(session.activeCoachThreadId, session.coachThreads[0].id);
    assert.equal(session.codexThreadId, null);
    assert.deepEqual(fixture.calls.threadIds, ['codex-2', null]);
    assert.equal(fixture.calls.persisted, 2);
    assert.equal(fixture.calls.restored, 2);
    assert.equal(fixture.calls.focused, 1);
  } finally {
    fixture.close();
  }
});
