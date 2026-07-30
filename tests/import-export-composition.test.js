import assert from 'node:assert/strict';
import test from 'node:test';

import { composeImportExport } from '../src/import-export-composition.js';

class TrackedEventTarget extends EventTarget {
  constructor() {
    super();
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

  click() {
    this.dispatchEvent(new Event('click'));
  }
}

const selectors = [
  '#export-project',
  '#import-project',
  '#project-import-file',
  '#export-lessons',
  '#import-lessons',
  '#lesson-import-file',
];

function createComposition(elements, actions) {
  return composeImportExport({
    $: (selector) => elements.get(selector),
    projectStore: {
      activeSession: () => null,
    },
    prepareProject() {},
    drawingCommands: {
      loadDrawing() {},
    },
    projectsComposition: {
      renderProjects() {},
    },
    navigationComposition: {
      showPage() {},
    },
    lessonsComposition: {
      store: {
        export() {
          actions.lessonExports += 1;
        },
        import() {
          return [];
        },
      },
      renderLessons() {},
    },
    showToast() {},
  });
}

test('import/export composition removes all six persistent listeners idempotently', () => {
  const elements = new Map(selectors.map((selector) => [selector, new TrackedEventTarget()]));
  const composition = createComposition(elements, { lessonExports: 0 });

  composition.initialize();
  composition.initialize();
  composition.destroy();
  composition.destroy();

  for (const [selector, element] of elements) {
    assert.equal(element.addedListeners.length, 1, `${selector} listener should be added once`);
    assert.equal(element.removedListeners.length, 1, `${selector} listener should be removed once`);
    assert.equal(element.removedListeners[0].type, element.addedListeners[0].type);
    assert.equal(element.removedListeners[0].listener, element.addedListeners[0].listener);
  }
});

test('import/export composition reconstruction leaves one action per event', () => {
  const elements = new Map(selectors.map((selector) => [selector, new TrackedEventTarget()]));
  const actions = { lessonExports: 0 };
  const first = createComposition(elements, actions);
  first.initialize();
  first.destroy();

  const second = createComposition(elements, actions);
  second.initialize();

  elements.get('#export-lessons').dispatchEvent(new Event('click'));

  assert.equal(actions.lessonExports, 1);
  second.destroy();
});
