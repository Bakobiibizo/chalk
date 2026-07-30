import assert from 'node:assert/strict';
import test from 'node:test';

import { removeSelectedStrokes, undoStroke } from '../src/drawing-history.js';

test('undoStroke removes the latest stroke and optionally records it for redo', () => {
  const first = { id: 'first' };
  const second = { id: 'second' };
  const strokes = [first, second];
  const redoStrokes = [];

  assert.equal(undoStroke(strokes, redoStrokes), second);
  assert.deepEqual(strokes, [first]);
  assert.deepEqual(redoStrokes, [second]);
  assert.equal(undoStroke([], redoStrokes), null);
  assert.deepEqual(redoStrokes, [second]);
});

test('removeSelectedStrokes returns the unselected strokes without mutating the source', () => {
  const strokes = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

  assert.deepEqual(removeSelectedStrokes(strokes, [0, 2]), [{ id: 'second' }]);
  assert.deepEqual(strokes, [{ id: 'first' }, { id: 'second' }, { id: 'third' }]);
  assert.equal(removeSelectedStrokes(strokes, []), null);
});
