import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { SelectionEngine, strokePointBounds } from '../src/selection-engine.js';

function createFixture(strokes) {
  const dom = new JSDOM('<div id="selection-box"></div>');
  const selectionBox = dom.window.document.querySelector('#selection-box');
  let movedCount = 0;
  const engine = new SelectionEngine({
    selectionBox,
    getStrokes: () => strokes,
    pointFromEvent: ({ x, y }) => ({ x, y }),
    strokeBounds: strokePointBounds,
    moveStroke: (stroke, dx, dy) => {
      for (const point of stroke.points) {
        point.x += dx;
        point.y += dy;
      }
    },
    onMoved: () => {
      movedCount += 1;
    },
  });

  return {
    dom,
    engine,
    selectionBox,
    getMovedCount: () => movedCount,
  };
}

test('selection box normalizes drag geometry and selects every intersecting stroke', () => {
  const strokes = [
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
    {
      points: [
        { x: 20, y: 15 },
        { x: 40, y: 35 },
      ],
    },
    {
      points: [
        { x: 60, y: 60 },
        { x: 80, y: 80 },
      ],
    },
    { points: [] },
  ];
  const fixture = createFixture(strokes);
  try {
    fixture.engine.start({ x: 30, y: 25 });

    assert.equal(fixture.engine.active, true);
    assert.equal(fixture.engine.state.mode, 'box');
    assert.ok(fixture.selectionBox.classList.contains('show'));
    assert.deepEqual(
      {
        left: fixture.selectionBox.style.left,
        top: fixture.selectionBox.style.top,
        width: fixture.selectionBox.style.width,
        height: fixture.selectionBox.style.height,
      },
      { left: '30px', top: '25px', width: '1px', height: '1px' },
    );

    fixture.engine.move({ x: 5, y: 5 });

    assert.deepEqual(fixture.engine.state.bounds, {
      left: 5,
      top: 5,
      right: 30,
      bottom: 25,
    });
    assert.deepEqual(
      {
        left: fixture.selectionBox.style.left,
        top: fixture.selectionBox.style.top,
        width: fixture.selectionBox.style.width,
        height: fixture.selectionBox.style.height,
      },
      { left: '5px', top: '5px', width: '25px', height: '20px' },
    );

    fixture.engine.end();

    assert.deepEqual(fixture.engine.selectedIndices, [0, 1]);
    assert.deepEqual(fixture.engine.state.bounds, {
      left: -6,
      top: -6,
      right: 46,
      bottom: 41,
    });
    assert.equal(fixture.engine.active, false);
  } finally {
    fixture.dom.window.close();
  }
});

test('selection movement commits the delta and recomputes bounds from moved strokes', () => {
  const strokes = [
    {
      points: [
        { x: 10, y: 20 },
        { x: 20, y: 30 },
      ],
    },
    {
      points: [
        { x: 100, y: 100 },
        { x: 110, y: 110 },
      ],
    },
  ];
  const fixture = createFixture(strokes);
  try {
    fixture.engine.start({ x: 5, y: 15 });
    fixture.engine.move({ x: 25, y: 35 });
    fixture.engine.end();
    assert.deepEqual(fixture.engine.selectedIndices, [0]);
    assert.deepEqual(fixture.engine.state.bounds, {
      left: 4,
      top: 14,
      right: 26,
      bottom: 36,
    });

    fixture.engine.start({ x: 12, y: 22 });
    assert.equal(fixture.engine.state.mode, 'move');
    fixture.engine.move({ x: 19, y: 17 });

    assert.deepEqual(strokes[0].points, [
      { x: 10, y: 20 },
      { x: 20, y: 30 },
    ]);
    assert.deepEqual(
      {
        left: fixture.selectionBox.style.left,
        top: fixture.selectionBox.style.top,
        width: fixture.selectionBox.style.width,
        height: fixture.selectionBox.style.height,
      },
      { left: '11px', top: '9px', width: '22px', height: '22px' },
    );

    fixture.engine.end();

    assert.deepEqual(strokes, [
      {
        points: [
          { x: 17, y: 15 },
          { x: 27, y: 25 },
        ],
      },
      {
        points: [
          { x: 100, y: 100 },
          { x: 110, y: 110 },
        ],
      },
    ]);
    assert.deepEqual(fixture.engine.state.bounds, {
      left: 11,
      top: 9,
      right: 33,
      bottom: 31,
    });
    assert.equal(fixture.engine.state.dx, 0);
    assert.equal(fixture.engine.state.dy, 0);
    assert.equal(fixture.getMovedCount(), 1);
  } finally {
    fixture.dom.window.close();
  }
});

test('selected indices are stable deletion inputs and clear resets selection state', () => {
  const strokes = [
    { id: 'first', points: [{ x: 0, y: 0 }] },
    { id: 'keep', points: [{ x: 30, y: 30 }] },
    { id: 'third', points: [{ x: 5, y: 5 }] },
  ];
  const fixture = createFixture(strokes);
  try {
    fixture.engine.start({ x: -1, y: -1 });
    fixture.engine.move({ x: 6, y: 6 });
    fixture.engine.end();

    const deletionInputs = fixture.engine.selectedIndices;
    assert.deepEqual(deletionInputs, [0, 2]);
    assert.deepEqual(
      strokes.filter((_, index) => !new Set(deletionInputs).has(index)),
      [{ id: 'keep', points: [{ x: 30, y: 30 }] }],
    );

    deletionInputs.push(1);
    assert.deepEqual(fixture.engine.selectedIndices, [0, 2]);

    fixture.engine.clear();

    assert.equal(fixture.engine.active, false);
    assert.deepEqual(fixture.engine.selectedIndices, []);
    assert.deepEqual(fixture.engine.state, {
      indices: [],
      mode: null,
      bounds: null,
      start: null,
      dx: 0,
      dy: 0,
    });
    assert.equal(fixture.selectionBox.classList.contains('show'), false);
  } finally {
    fixture.dom.window.close();
  }
});
