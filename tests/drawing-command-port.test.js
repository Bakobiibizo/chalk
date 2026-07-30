import assert from 'node:assert/strict';
import test from 'node:test';

import { createDrawingCommandPort } from '../src/drawing-command-port.js';

test('drawing command port rejects use until its complete dependency set is connected', () => {
  const { commands, connect } = createDrawingCommandPort();

  assert.throws(() => commands.saveDrawing(), /must be connected before use/);
  assert.throws(() => commands.loadDrawing(), /must be connected before use/);
  assert.throws(() => commands.redraw(), /must be connected before use/);
  assert.throws(
    () => connect({ drawingSessionCoordinator: {}, sketchCanvasController: {} }),
    /drawingSessionCoordinator\.saveDrawing/,
  );
});

test('drawing command port binds once and dispatches to constructed dependencies', () => {
  const events = [];
  const drawingSessionCoordinator = {
    saveDrawing: (value) => events.push(['save', value]),
    loadDrawing: (value) => events.push(['load', value]),
  };
  const sketchCanvasController = {
    redraw: (value) => events.push(['redraw', value]),
  };
  const port = createDrawingCommandPort();

  port.connect({ drawingSessionCoordinator, sketchCanvasController });
  port.commands.saveDrawing('page');
  port.commands.loadDrawing('project');
  port.commands.redraw('canvas');

  assert.deepEqual(events, [
    ['save', 'page'],
    ['load', 'project'],
    ['redraw', 'canvas'],
  ]);
  assert.throws(
    () => port.connect({ drawingSessionCoordinator, sketchCanvasController }),
    /already connected/,
  );
});
