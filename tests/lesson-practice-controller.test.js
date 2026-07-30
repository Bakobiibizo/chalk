import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { LessonPracticeController } from '../src/lesson-practice-controller.js';

function installGlobal(name, value, restorations) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  restorations.push(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

function createContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    arc: (...arguments_) => calls.push(['arc', ...arguments_]),
    fill: () => calls.push(['fill']),
    moveTo: (...arguments_) => calls.push(['moveTo', ...arguments_]),
    lineTo: (...arguments_) => calls.push(['lineTo', ...arguments_]),
    stroke: () => calls.push(['stroke']),
    clearRect: (...arguments_) => calls.push(['clearRect', ...arguments_]),
    setTransform: (...arguments_) => calls.push(['setTransform', ...arguments_]),
  };
}

function pointerEvent(dom, type, properties) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  const values = {
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    pressure: 0.5,
    ...properties,
  };
  for (const [name, value] of Object.entries(values))
    Object.defineProperty(event, name, { configurable: true, value });
  return event;
}

function createFixture({
  lesson = { id: 'lesson-1', practiceStrokes: [] },
  confirmClear = () => true,
  paperBounds = { left: 0, top: 0, width: 200, height: 120 },
  canvasBounds = { left: 10, top: 20, width: 200, height: 100 },
  innerHeight = 900,
  devicePixelRatio = 1,
  createTimestamp,
} = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="paper">
      <canvas id="canvas"></canvas>
      <div id="empty-state"></div>
      <div id="selection-box"></div>
    </div>
    <button id="undo"></button>
    <button id="clear"></button>
    <button data-practice-tool="pen"></button>
    <button data-practice-tool="eraser"></button>
    <button data-practice-tool="select"></button>
    <span id="input-label"></span>
  </body>`);
  const restorations = [];
  const resizeObservers = [];
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      resizeObservers.push(this);
    }
    observe(target) {
      this.observed.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    trigger() {
      this.callback();
    }
  }
  installGlobal('window', dom.window, restorations);
  installGlobal('document', dom.window.document, restorations);
  installGlobal('Element', dom.window.Element, restorations);
  installGlobal('ResizeObserver', FakeResizeObserver, restorations);
  installGlobal('requestAnimationFrame', (callback) => callback(), restorations);
  installGlobal('innerHeight', innerHeight, restorations);
  installGlobal('devicePixelRatio', devicePixelRatio, restorations);

  const canvas = document.querySelector('#canvas');
  const paper = document.querySelector('#paper');
  const context = createContext();
  const capturedPointers = [];
  const releasedPointers = [];
  canvas.getContext = () => context;
  canvas.getBoundingClientRect = () => ({ ...canvasBounds });
  paper.getBoundingClientRect = () => ({ ...paperBounds });
  canvas.setPointerCapture = (pointerId) => capturedPointers.push(pointerId);
  canvas.releasePointerCapture = (pointerId) => releasedPointers.push(pointerId);

  let persistenceCount = 0;
  const controller = new LessonPracticeController({
    lesson,
    canvas,
    paper,
    emptyState: document.querySelector('#empty-state'),
    selectionBox: document.querySelector('#selection-box'),
    undoButton: document.querySelector('#undo'),
    clearButton: document.querySelector('#clear'),
    toolButtons: document.querySelectorAll('[data-practice-tool]'),
    inputLabel: document.querySelector('#input-label'),
    persistLesson: () => {
      persistenceCount += 1;
    },
    createTimestamp,
    confirmClear,
  });

  return {
    dom,
    lesson,
    canvas,
    paper,
    context,
    controller,
    resizeObserver: resizeObservers[0],
    capturedPointers,
    releasedPointers,
    getPersistenceCount: () => persistenceCount,
    dispose() {
      controller.destroy();
      for (const restore of restorations.reverse()) restore();
      dom.window.close();
    },
  };
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < Number.EPSILON * 4, `${actual} != ${expected}`);
}

test('pointer drawing stores normalized coalesced points and persists the completed stroke', () => {
  const timestampCalls = [];
  const fixture = createFixture({
    createTimestamp: () => {
      timestampCalls.push('called');
      return '2026-07-25T12:34:56.789Z';
    },
  });
  try {
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerdown', {
        clientX: 50,
        clientY: 40,
        pointerId: 7,
        pointerType: 'pen',
        pressure: 0.4,
      }),
    );
    const coalescedEvents = [
      { clientX: 70, clientY: 50, pointerType: 'pen', pressure: 0.5 },
      { clientX: 110, clientY: 80, pointerType: 'pen', pressure: 0.8 },
    ];
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointermove', {
        clientX: 110,
        clientY: 80,
        pointerId: 7,
        pointerType: 'pen',
        pressure: 0.8,
        getCoalescedEvents: () => coalescedEvents,
      }),
    );
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerup', {
        clientX: 110,
        clientY: 80,
        pointerId: 7,
        pointerType: 'pen',
        pressure: 0.8,
      }),
    );

    assert.equal(fixture.lesson.practiceStrokes.length, 1);
    const stroke = fixture.lesson.practiceStrokes[0];
    assert.equal(stroke.tool, 'pen');
    assert.equal(stroke.canvasHeight, 100);
    assert.deepEqual(stroke.points, [
      { x: 0.2, y: 0.2, pressure: 0.4 },
      { x: 0.3, y: 0.3, pressure: 0.5 },
      { x: 0.5, y: 0.6, pressure: 0.8 },
    ]);
    assert.equal(fixture.getPersistenceCount(), 1);
    assert.equal(fixture.lesson.practiceUpdatedAt, '2026-07-25T12:34:56.789Z');
    assert.deepEqual(timestampCalls, ['called']);
    assert.deepEqual(fixture.capturedPointers, [7]);
    assert.deepEqual(fixture.releasedPointers, [7]);
    assert.equal(document.querySelector('#input-label').textContent, 'Ready for pen');
    assert.equal(document.querySelector('#empty-state').classList.contains('hidden'), true);
    assert.equal(document.querySelector('#undo').disabled, false);
    assert.equal(Object.hasOwn(fixture.controller, 'drawing'), false);
    assert.equal(Object.hasOwn(fixture.controller, 'activeStroke'), false);
    assert.deepEqual(fixture.controller.strokeSession.state, { kind: 'idle' });
    assert.ok(fixture.context.calls.some(([name]) => name === 'fill'));
    assert.ok(fixture.context.calls.some(([name]) => name === 'stroke'));
  } finally {
    fixture.dispose();
  }
});

test('selection movement updates normalized stroke coordinates and persists once', () => {
  const fixture = createFixture({
    lesson: {
      id: 'lesson-1',
      practiceStrokes: [
        {
          tool: 'pen',
          canvasHeight: 100,
          points: [
            { x: 0.1, y: 0.2, pressure: 0.5 },
            { x: 0.2, y: 0.3, pressure: 0.5 },
          ],
        },
        {
          tool: 'pen',
          canvasHeight: 100,
          points: [
            { x: 0.7, y: 0.7, pressure: 0.5 },
            { x: 0.8, y: 0.8, pressure: 0.5 },
          ],
        },
      ],
    },
  });
  try {
    document.querySelector('[data-practice-tool="select"]').click();
    assert.equal(fixture.controller.tool, 'select');
    assert.ok(fixture.canvas.classList.contains('selecting'));

    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerdown', { clientX: 25, clientY: 35, pointerId: 2 }),
    );
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointermove', { clientX: 55, clientY: 55, pointerId: 2 }),
    );
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerup', { clientX: 55, clientY: 55, pointerId: 2 }),
    );

    assert.deepEqual(fixture.controller.selection.selectedIndices, [0]);
    assert.equal(fixture.getPersistenceCount(), 0);

    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerdown', { clientX: 40, clientY: 45, pointerId: 3 }),
    );
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointermove', { clientX: 60, clientY: 55, pointerId: 3 }),
    );
    fixture.canvas.dispatchEvent(
      pointerEvent(fixture.dom, 'pointerup', { clientX: 60, clientY: 55, pointerId: 3 }),
    );

    const [firstPoint, secondPoint] = fixture.lesson.practiceStrokes[0].points;
    assertClose(firstPoint.x, 0.2);
    assertClose(firstPoint.y, 0.3);
    assertClose(secondPoint.x, 0.3);
    assertClose(secondPoint.y, 0.4);
    assert.deepEqual(fixture.lesson.practiceStrokes[1].points, [
      { x: 0.7, y: 0.7, pressure: 0.5 },
      { x: 0.8, y: 0.8, pressure: 0.5 },
    ]);
    assert.equal(fixture.getPersistenceCount(), 1);
    assert.deepEqual(fixture.capturedPointers, [2, 3]);
    assert.deepEqual(fixture.releasedPointers, [2, 3]);
  } finally {
    fixture.dispose();
  }
});

test('undo and confirmed clear redraw and persist without clearing after rejection', () => {
  const confirmations = [];
  let allowClear = false;
  const fixture = createFixture({
    lesson: {
      id: 'lesson-1',
      practiceStrokes: [
        { tool: 'pen', canvasHeight: 100, points: [{ x: 0.1, y: 0.1, pressure: 0.5 }] },
        { tool: 'pen', canvasHeight: 100, points: [{ x: 0.2, y: 0.2, pressure: 0.5 }] },
      ],
    },
    confirmClear: (message) => {
      confirmations.push(message);
      return allowClear;
    },
  });
  try {
    document.querySelector('#undo').click();
    assert.equal(fixture.lesson.practiceStrokes.length, 1);
    assert.equal(fixture.getPersistenceCount(), 1);

    document.querySelector('#clear').click();
    assert.equal(fixture.lesson.practiceStrokes.length, 1);
    assert.equal(fixture.getPersistenceCount(), 1);
    assert.deepEqual(confirmations, ['Clear this lesson practice page?']);

    allowClear = true;
    document.querySelector('#clear').click();
    assert.deepEqual(fixture.lesson.practiceStrokes, []);
    assert.equal(fixture.getPersistenceCount(), 2);
    assert.deepEqual(confirmations, [
      'Clear this lesson practice page?',
      'Clear this lesson practice page?',
    ]);
    assert.deepEqual(fixture.controller.selection.selectedIndices, []);
    assert.equal(document.querySelector('#selection-box').classList.contains('show'), false);
    assert.equal(document.querySelector('#empty-state').classList.contains('hidden'), false);
    assert.equal(document.querySelector('#undo').disabled, true);
  } finally {
    fixture.dispose();
  }
});

test('resize backfills legacy height, scales the bitmap, and destroy removes owned listeners', () => {
  const paperBounds = { left: 0, top: 0, width: 240, height: 360 };
  const canvasBounds = { left: 0, top: 0, width: 240, height: 360 };
  const dom = new JSDOM(`<!doctype html><body>
    <div id="paper">
      <canvas id="canvas"></canvas>
      <div id="empty-state"></div>
      <div id="selection-box"></div>
    </div>
    <button id="undo"></button>
    <button id="clear"></button>
    <button data-practice-tool="pen"></button>
    <button data-practice-tool="select"></button>
    <span id="input-label"></span>
  </body>`);
  const restorations = [];
  let resizeObserver;
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      resizeObserver = this;
    }
    observe(target) {
      this.observed.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    trigger() {
      this.callback();
    }
  }
  installGlobal('window', dom.window, restorations);
  installGlobal('document', dom.window.document, restorations);
  installGlobal('Element', dom.window.Element, restorations);
  installGlobal('ResizeObserver', FakeResizeObserver, restorations);
  installGlobal('requestAnimationFrame', (callback) => callback(), restorations);
  installGlobal('innerHeight', 700, restorations);
  installGlobal('devicePixelRatio', 1.5, restorations);

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

  const lesson = {
    id: 'legacy-lesson',
    practiceStrokes: [{ tool: 'pen', points: [{ x: 0.25, y: 0.5, pressure: 0.5 }] }],
  };
  const canvas = document.querySelector('#canvas');
  const paper = document.querySelector('#paper');
  const context = createContext();
  let persistenceCount = 0;
  canvas.getContext = () => context;
  canvas.getBoundingClientRect = () => ({ ...canvasBounds });
  paper.getBoundingClientRect = () => ({ ...paperBounds });
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};

  let controller;
  try {
    controller = new LessonPracticeController({
      lesson,
      canvas,
      paper,
      emptyState: document.querySelector('#empty-state'),
      selectionBox: document.querySelector('#selection-box'),
      undoButton: document.querySelector('#undo'),
      clearButton: document.querySelector('#clear'),
      toolButtons: document.querySelectorAll('[data-practice-tool]'),
      inputLabel: document.querySelector('#input-label'),
      persistLesson: () => {
        persistenceCount += 1;
      },
    });

    assert.equal(lesson.practiceCanvasHeight, 628);
    assert.equal(controller.strokes[0].canvasHeight, 628);
    assert.deepEqual(resizeObserver.observed, [paper]);
    assert.equal(canvas.width, 360);
    assert.equal(canvas.height, 540);
    assert.equal(canvas.style.width, '');
    assert.equal(canvas.style.height, '');
    assert.ok(
      context.calls.some(
        (call) =>
          call[0] === 'setTransform' &&
          call.slice(1).every((value, index) => value === [1.5, 0, 0, 1.5, 0, 0][index]),
      ),
    );

    paperBounds.width = 300;
    paperBounds.height = 400;
    canvasBounds.width = 300;
    canvasBounds.height = 400;
    resizeObserver.trigger();
    assert.equal(canvas.width, 450);
    assert.equal(canvas.height, 600);
    assert.equal(canvas.style.width, '');
    assert.equal(canvas.style.height, '');

    const ownedListeners = [...controller.listeners];
    controller.destroy();
    assert.equal(resizeObserver.disconnected, true);
    for (const [target, type, listener] of ownedListeners) {
      assert.equal(
        addedListeners.filter(
          (added) => added.target === target && added.type === type && added.listener === listener,
        ).length,
        1,
        `expected one matching addition for ${type}`,
      );
      assert.equal(
        removedListeners.filter(
          (removed) =>
            removed.target === target && removed.type === type && removed.listener === listener,
        ).length,
        1,
        `expected one matching removal for ${type}`,
      );
    }

    document.querySelector('#undo').click();
    document.querySelector('[data-practice-tool="select"]').click();
    canvas.dispatchEvent(
      pointerEvent(dom, 'pointerdown', {
        clientX: 20,
        clientY: 20,
        pointerId: 8,
        pointerType: 'pen',
      }),
    );
    assert.equal(persistenceCount, 0);
    assert.equal(controller.tool, 'pen');
    assert.deepEqual(controller.strokeSession.state, { kind: 'idle' });
    assert.equal(controller.strokes.length, 1);
  } finally {
    eventTargetPrototype.addEventListener = originalAddEventListener;
    eventTargetPrototype.removeEventListener = originalRemoveEventListener;
    if (controller && !resizeObserver.disconnected) controller.destroy();
    for (const restore of restorations.reverse()) restore();
    dom.window.close();
  }
});
