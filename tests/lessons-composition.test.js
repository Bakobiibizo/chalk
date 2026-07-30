import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { composeLessonNavigation } from '../src/lessons-composition.js';

function createNavigationFixture() {
  const dom = new JSDOM(`
    <!doctype html>
    <body>
      <div class="workspace lesson-integrated">
        <section id="lessons-view" class="active integrated-lesson-panel"></section>
      </div>
      <section id="lesson-detail"></section>
      <button id="create-lesson"></button>
      <button id="add-lesson"></button>
      <button id="empty-create"></button>
      <button id="close-lesson-modal"></button>
      <button data-page="sketch"></button>
      <button data-page="lessons"></button>
    </body>
  `);
  const { document } = dom.window;
  const actions = { opens: 0, closes: 0 };
  const navigation = composeLessonNavigation({
    $: (selector) => document.querySelector(selector),
    $$: (selector) => [...document.querySelectorAll(selector)],
    openLessonLibrary: () => {
      actions.opens += 1;
    },
    hideLessonModal: () => {
      actions.closes += 1;
    },
  });
  return { dom, document, actions, navigation };
}

test('lesson navigation removes all create, close, pointer, and keyboard listeners idempotently', () => {
  const { dom, navigation } = createNavigationFixture();
  const eventTargetPrototype = dom.window.EventTarget.prototype;
  const originalAddEventListener = eventTargetPrototype.addEventListener;
  const originalRemoveEventListener = eventTargetPrototype.removeEventListener;
  const addedListeners = [];
  const removedListeners = [];
  eventTargetPrototype.addEventListener = function (type, listener, options) {
    addedListeners.push({ target: this, type, listener });
    return originalAddEventListener.call(this, type, listener, options);
  };
  eventTargetPrototype.removeEventListener = function (type, listener, options) {
    removedListeners.push({ target: this, type, listener });
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  try {
    navigation.initialize();
    navigation.initialize();
    navigation.destroy();
    navigation.destroy();
  } finally {
    eventTargetPrototype.addEventListener = originalAddEventListener;
    eventTargetPrototype.removeEventListener = originalRemoveEventListener;
    dom.window.close();
  }

  assert.equal(addedListeners.length, 6);
  assert.equal(removedListeners.length, addedListeners.length);
  for (const added of addedListeners) {
    assert.equal(
      removedListeners.filter(
        (removed) =>
          removed.target === added.target &&
          removed.type === added.type &&
          removed.listener === added.listener,
      ).length,
      1,
      `expected one matching removal for ${added.type}`,
    );
  }
});

test('lesson navigation reconstruction leaves one action per event and preserves close behavior', () => {
  const { dom, document, actions, navigation: firstNavigation } = createNavigationFixture();
  firstNavigation.initialize();
  firstNavigation.destroy();

  const secondNavigation = composeLessonNavigation({
    $: (selector) => document.querySelector(selector),
    $$: (selector) => [...document.querySelectorAll(selector)],
    openLessonLibrary: () => {
      actions.opens += 1;
    },
    hideLessonModal: () => {
      actions.closes += 1;
    },
  });
  secondNavigation.initialize();

  document.querySelector('#create-lesson').click();
  document
    .querySelector('[data-page="lessons"]')
    .dispatchEvent(new dom.window.Event('pointerup', { bubbles: true, cancelable: true }));
  document.querySelector('[data-page="lessons"]').dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );
  document.querySelector('#close-lesson-modal').click();

  assert.equal(actions.opens, 3);
  assert.equal(actions.closes, 1);
  assert.equal(document.querySelector('#lessons-view').classList.contains('active'), false);
  assert.equal(document.querySelector('.workspace').classList.contains('lesson-integrated'), false);
  assert.equal(document.querySelector('[data-page="sketch"]').classList.contains('active'), true);
  assert.equal(document.querySelector('[data-page="lessons"]').classList.contains('active'), false);

  secondNavigation.destroy();
  dom.window.close();
});
