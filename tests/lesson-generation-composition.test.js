import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  composeLessonGeneration,
  createGristModelJsonParser,
} from '../src/lesson-generation-composition.js';

test('Grist model parser prefers the desktop bridge', async () => {
  const parseModelJson = createGristModelJsonParser({
    desktopBridge: {
      parseModelJson(raw) {
        return { parsed: raw };
      },
    },
    fetchModelJson() {
      throw new Error('HTTP parser should not be called');
    },
  });

  assert.deepEqual(await parseModelJson('model output'), { parsed: 'model output' });
});

test('Grist model parser uses the application endpoint outside desktop', async () => {
  let request;
  const parseModelJson = createGristModelJsonParser({
    desktopBridge: null,
    async fetchModelJson(url, options) {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return { title: 'Parsed by Grist' };
        },
      };
    },
  });

  assert.deepEqual(await parseModelJson('raw response'), { title: 'Parsed by Grist' });
  assert.deepEqual(request, {
    url: '/grist/parse-model-json',
    options: {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'raw response',
    },
  });
});

test('lesson generation submits the prompt, stores the parsed lesson, and opens it', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <form id="lesson-form">
      <input id="lesson-goal" value="Learn fractions">
      <select id="lesson-level"><option selected>Beginner</option></select>
    </form>
    <div id="lesson-generating"></div>
  </body>`);
  const form = dom.window.document.querySelector('#lesson-form');
  const storedLessons = [];
  const calls = [];
  let identifierCalls = 0;
  let timestampCalls = 0;
  let resolveOpened;
  const opened = new Promise((resolve) => {
    resolveOpened = resolve;
  });

  const generation = composeLessonGeneration({
    lessons: {
      form,
      goal: dom.window.document.querySelector('#lesson-goal'),
      level: dom.window.document.querySelector('#lesson-level'),
      generating: dom.window.document.querySelector('#lesson-generating'),
    },
    desktopBridge: { parseModelJson: JSON.parse },
    coachService: {
      async run(prompt, image) {
        calls.push({ prompt, image });
        return JSON.stringify({
          title: 'Fractions',
          topic: 'Arithmetic',
          summary: 'Parts of a whole',
          explanation: 'A fraction represents equal parts.',
          example: 'One half is 1/2.',
          practice: 'Shade one half.',
          hint: 'Split the shape equally.',
        });
      },
    },
    lessonStore: {
      lessons: storedLessons,
      prepend(lesson) {
        storedLessons.unshift(lesson);
      },
    },
    clearError() {},
    showError() {
      assert.fail('generation should not fail');
    },
    renderLessons() {},
    renderLessonPicker() {},
    hideLessonModal() {},
    openLesson(id) {
      resolveOpened(id);
    },
    createLessonId() {
      identifierCalls += 1;
      return 9001;
    },
    createTimestamp() {
      timestampCalls += 1;
      return '2026-07-25T12:00:00.000Z';
    },
  });
  generation.initialize();

  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  const openedId = await opened;

  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /Learn fractions/);
  assert.match(calls[0].prompt, /Infer an appropriate scope/);
  assert.doesNotMatch(calls[0].prompt, /\d+-minute/);
  assert.equal(calls[0].image, null);
  assert.equal(storedLessons.length, 1);
  assert.equal(storedLessons[0].title, 'Fractions');
  assert.equal(storedLessons[0].level, 'Beginner');
  assert.equal(storedLessons[0].id, 9001);
  assert.equal(storedLessons[0].createdAt, '2026-07-25T12:00:00.000Z');
  assert.equal(identifierCalls, 1);
  assert.equal(timestampCalls, 1);
  assert.equal('minutes' in storedLessons[0], false);
  assert.equal(openedId, storedLessons[0].id);
  assert.equal(dom.window.document.querySelector('#lesson-goal').value, '');

  generation.destroy();
  dom.window.close();
});

test('lesson generation installs and removes its submit listener idempotently', () => {
  const dom = new JSDOM('<form id="lesson-form"></form>');
  const form = dom.window.document.querySelector('#lesson-form');
  const addedListeners = [];
  const removedListeners = [];
  const originalAddEventListener = form.addEventListener;
  const originalRemoveEventListener = form.removeEventListener;
  form.addEventListener = function (type, listener, options) {
    addedListeners.push({ type, listener });
    return originalAddEventListener.call(this, type, listener, options);
  };
  form.removeEventListener = function (type, listener, options) {
    removedListeners.push({ type, listener });
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  const generation = composeLessonGeneration({
    lessons: { form },
    coachService: {},
    lessonStore: {},
    clearError() {},
    showError() {},
    renderLessons() {},
    renderLessonPicker() {},
    hideLessonModal() {},
    openLesson() {},
  });

  generation.initialize();
  generation.initialize();
  generation.destroy();
  generation.destroy();

  assert.equal(addedListeners.length, 1);
  assert.equal(removedListeners.length, 1);
  assert.equal(addedListeners[0].type, 'submit');
  assert.equal(removedListeners[0].type, 'submit');
  assert.equal(removedListeners[0].listener, addedListeners[0].listener);

  dom.window.close();
});
