import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eraserCursor,
  eraserWidth,
  pointFromPointerEvent,
  pressureStrokeWidth,
  renderPressureStroke,
} from '../src/drawing-canvas.js';

/**
 * @typedef {object} TestStrokeContext
 * @property {string} lineCap
 * @property {string} lineJoin
 * @property {string} globalCompositeOperation
 * @property {string} strokeStyle
 * @property {string} fillStyle
 * @property {number} lineWidth
 * @property {() => void} save
 * @property {() => void} restore
 * @property {() => void} beginPath
 * @property {(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void} arc
 * @property {() => void} fill
 * @property {(x: number, y: number) => void} moveTo
 * @property {(x: number, y: number) => void} lineTo
 * @property {() => void} stroke
 */

test('eraser uses a circular cursor at two units wider than the pen', () => {
  assert.equal(eraserWidth(4), 6);
  assert.equal(pressureStrokeWidth({ tool: 'eraser', size: 4 }, { pressure: 0.5 }), 6);
  const cursor = eraserCursor(6);
  assert.match(cursor, /^url\("data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(cursor), /<circle/);
  assert.match(cursor, / 5 5, crosshair$/);
});

test('drawing operations normalize pointer coordinates and render pressure strokes', () => {
  const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
  assert.deepEqual(
    pointFromPointerEvent(
      canvas,
      { clientX: 110, clientY: 70, pointerType: 'pen', pressure: 0.4 },
      { normalized: true },
    ),
    { x: 0.5, y: 0.5, pressure: 0.4 },
  );
  assert.equal(pressureStrokeWidth({ tool: 'eraser', size: 5 }, { pressure: 1 }), 7);

  /** @type {Array<Array<string | number>>} */
  const operations = [];
  /** @type {TestStrokeContext} */
  const context = {
    lineCap: '',
    lineJoin: '',
    globalCompositeOperation: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save: () => operations.push(['save']),
    restore: () => operations.push(['restore']),
    beginPath: () => operations.push(['beginPath']),
    arc: (x, y, radius, startAngle, endAngle) =>
      operations.push(['arc', x, y, radius, startAngle, endAngle]),
    fill: () => operations.push(['fill']),
    moveTo: (x, y) => operations.push(['moveTo', x, y]),
    lineTo: (x, y) => operations.push(['lineTo', x, y]),
    stroke: () => operations.push(['stroke']),
  };
  renderPressureStroke(context, {
    tool: 'pen',
    size: 4,
    points: [
      { x: 0, y: 0, pressure: 0.2 },
      { x: 10, y: 5, pressure: 0.8 },
    ],
  });
  assert.ok(operations.some(([operation]) => operation === 'stroke'));
  assert.ok(operations.some(([operation, x, y]) => operation === 'lineTo' && x === 10 && y === 5));
});
