import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { CoachMessageRenderer } from '../src/coach-message-renderer.js';

function createRenderer(messages = []) {
  const dom = new JSDOM('<div id="conversation"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  const conversation = dom.window.document.querySelector('#conversation');
  Object.defineProperty(conversation, 'scrollHeight', { configurable: true, value: 240 });
  const rendered = [];
  const persisted = [];
  let restoreCount = 0;
  const renderer = new CoachMessageRenderer({
    conversation,
    renderLatex: (element) => rendered.push(element.textContent),
    persistMessage: (text, role) => persisted.push({ text, role }),
    getMessages: () => messages,
    afterRestore: () => {
      restoreCount += 1;
    },
  });
  return {
    conversation,
    persisted,
    rendered,
    renderer,
    restoreCount: () => restoreCount,
    restoreDocument: () => {
      globalThis.document = previousDocument;
      dom.window.close();
    },
  };
}

test('coach message renderer restores the transcript without persisting it again', () => {
  const fixture = createRenderer([
    { text: 'Show me the next step', role: 'user' },
    { text: 'Use \\(x\\)', role: 'assistant' },
  ]);
  try {
    fixture.renderer.restoreConversation();
    assert.deepEqual(
      [...fixture.conversation.children].map((element) => [element.className, element.textContent]),
      [
        [
          'coach-message system',
          'I can see the page you’re working on. What would you like help with?',
        ],
        ['coach-message user', 'Show me the next step'],
        ['coach-message assistant', 'Use \\(x\\)'],
      ],
    );
    assert.deepEqual(fixture.rendered, ['Show me the next step', 'Use \\(x\\)']);
    assert.deepEqual(fixture.persisted, []);
    assert.equal(fixture.conversation.scrollTop, 240);
    assert.equal(fixture.restoreCount(), 1);
  } finally {
    fixture.restoreDocument();
  }
});

test('coach message renderer owns transient, streamed, successful, and failed reply rendering', () => {
  const fixture = createRenderer();
  try {
    fixture.renderer.appendMessage('Can you check this?', 'user');
    const reply = fixture.renderer.beginAssistantReply();
    assert.equal(reply.classList.contains('thinking'), true);
    assert.deepEqual(fixture.persisted, [{ text: 'Can you check this?', role: 'user' }]);

    fixture.renderer.updateAssistantReply(reply, 'First step');
    assert.equal(reply.classList.contains('thinking'), false);
    fixture.renderer.completeAssistantReply(reply, 'First step: \\(x=2\\)');
    assert.deepEqual(fixture.persisted.at(-1), {
      text: 'First step: \\(x=2\\)',
      role: 'assistant',
    });
    assert.equal(fixture.rendered.at(-1), 'First step: \\(x=2\\)');

    const failedReply = fixture.renderer.beginAssistantReply();
    fixture.renderer.failAssistantReply(failedReply, 'Codex unavailable');
    assert.equal(failedReply.textContent, 'Codex unavailable');
    assert.equal(failedReply.classList.contains('thinking'), false);
    assert.equal(fixture.persisted.length, 2);
  } finally {
    fixture.restoreDocument();
  }
});
