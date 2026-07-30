import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { CoachPromptFormController } from '../src/coach-prompt-form-controller.js';

function createFixture({
  run,
  prepareRequest = async (prompt) => ({ request: `request:${prompt}`, image: 'image' }),
}) {
  const dom = new JSDOM(`
    <form id="form"><textarea id="prompt"></textarea><button id="send"></button></form>
    <button id="preset" data-coach-prompt="Explain this step"></button>
  `);
  const document = dom.window.document;
  const calls = [];
  const reply = {};
  const messageRenderer = {
    appendMessage: (text, role) => calls.push(['append', text, role]),
    beginAssistantReply: () => {
      calls.push(['begin']);
      return reply;
    },
    updateAssistantReply: (target, text) => calls.push(['update', target, text]),
    completeAssistantReply: (target, text) => calls.push(['complete', target, text]),
    failAssistantReply: (target, text) => calls.push(['fail', target, text]),
  };
  const controller = new CoachPromptFormController({
    form: document.querySelector('#form'),
    prompt: document.querySelector('#prompt'),
    sendButton: document.querySelector('#send'),
    presetButtons: [document.querySelector('#preset')],
    coachService: { run },
    messageRenderer,
    prepareRequest,
  });
  const abortController = new dom.window.AbortController();
  controller.initialize(abortController.signal);
  return { abortController, calls, controller, document, dom, reply };
}

test('coach prompt form owns presets and the successful streaming request lifecycle', async () => {
  const fixture = createFixture({
    run: async (request, image, onUpdate) => {
      assert.equal(request, 'request:Check this');
      assert.equal(image, 'image');
      onUpdate('Streaming reply');
      return 'Final reply';
    },
  });
  try {
    fixture.document.querySelector('#preset').click();
    assert.equal(fixture.document.querySelector('#prompt').value, 'Explain this step');

    fixture.document.querySelector('#prompt').value = '  Check this  ';
    fixture.document
      .querySelector('#form')
      .dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(fixture.calls, [
      ['append', 'Check this', 'user'],
      ['begin'],
      ['update', fixture.reply, 'Streaming reply'],
      ['complete', fixture.reply, 'Final reply'],
    ]);
    assert.equal(fixture.document.querySelector('#prompt').value, '');
    assert.equal(fixture.document.querySelector('#send').disabled, false);
  } finally {
    fixture.controller.destroy();
    fixture.abortController.abort();
    fixture.dom.window.close();
  }
});

test('coach prompt form leaves failed replies visible and re-enables sending', async () => {
  const fixture = createFixture({
    run: async () => {
      throw new Error('Codex unavailable.');
    },
  });
  try {
    fixture.document.querySelector('#prompt').value = 'Help';
    fixture.document
      .querySelector('#form')
      .dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(fixture.calls.slice(0, 2), [['append', 'Help', 'user'], ['begin']]);
    assert.match(fixture.calls.at(-1)[2], /^Codex unavailable\./);
    assert.equal(fixture.calls.at(-1)[0], 'fail');
    assert.equal(fixture.document.querySelector('#send').disabled, false);
  } finally {
    fixture.controller.destroy();
    fixture.abortController.abort();
    fixture.dom.window.close();
  }
});
