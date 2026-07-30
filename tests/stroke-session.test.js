import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDistanceSamplingStrategy,
  StrokeSession,
  StrokeSessionState,
} from '../src/stroke-session.js';

function createSelectionRecorder() {
  const calls = [];
  return {
    calls,
    strategy: {
      start: (event) => calls.push(['start', event]),
      move: (event) => calls.push(['move', event]),
      end: (event) => calls.push(['end', event]),
    },
  };
}

function createSession({
  coordinate = (event) => ({ x: event.x, y: event.y, pressure: event.pressure }),
  constructStroke = () => ({ tool: 'pen', color: '#252522', size: 4 }),
  sample = createDistanceSamplingStrategy({ minimumDistance: 0.25 }),
} = {}) {
  const selection = createSelectionRecorder();
  const rendered = [];
  const persisted = [];
  const session = new StrokeSession({
    coordinate,
    constructStroke,
    sample,
    selection: selection.strategy,
    render: (stroke, context) => rendered.push({ stroke, context }),
    persist: (stroke, context) => persisted.push({ stroke, context }),
  });
  return { persisted, rendered, selection, session };
}

test('pixel stroke session transitions through drawing and persists one completed stroke', () => {
  const fixture = createSession();
  const startEvent = { x: 10, y: 20, pressure: 0.4 };

  assert.deepEqual(fixture.session.state, { kind: StrokeSessionState.IDLE });
  assert.equal(fixture.session.activeStroke, null);

  const drawingState = fixture.session.start(startEvent);

  assert.equal(drawingState.kind, StrokeSessionState.DRAWING);
  assert.deepEqual(drawingState.stroke, {
    tool: 'pen',
    color: '#252522',
    size: 4,
    points: [{ x: 10, y: 20, pressure: 0.4 }],
  });
  assert.equal(fixture.session.activeStroke, drawingState.stroke);
  assert.throws(
    () => fixture.session.start({ x: 0, y: 0 }),
    /Cannot start while stroke session is drawing/,
  );

  const moved = fixture.session.move({
    x: 12,
    y: 22,
    pressure: 0.8,
    getCoalescedEvents: () => [
      { x: 10.1, y: 20.1, pressure: 0.5 },
      { x: 11, y: 21, pressure: 0.6 },
      { x: 12, y: 22, pressure: 0.8 },
    ],
  });

  assert.equal(moved, true);
  assert.deepEqual(drawingState.stroke.points, [
    { x: 10, y: 20, pressure: 0.4 },
    { x: 11, y: 21, pressure: 0.6 },
    { x: 12, y: 22, pressure: 0.8 },
  ]);
  assert.deepEqual(fixture.rendered[1].stroke.points, [
    { x: 10, y: 20, pressure: 0.4 },
    { x: 11, y: 21, pressure: 0.6 },
    { x: 12, y: 22, pressure: 0.8 },
  ]);
  assert.equal(fixture.rendered[1].context.phase, 'sample');

  const endEvent = { pointerId: 7 };
  const result = fixture.session.end(endEvent);

  assert.deepEqual(result, {
    kind: StrokeSessionState.DRAWING,
    stroke: drawingState.stroke,
  });
  assert.deepEqual(fixture.session.state, { kind: StrokeSessionState.IDLE });
  assert.equal(fixture.session.activeStroke, null);
  assert.equal(fixture.persisted.length, 1);
  assert.equal(fixture.persisted[0].stroke, drawingState.stroke);
  assert.equal(fixture.persisted[0].context.event, endEvent);
  assert.equal(fixture.session.end(endEvent), null);
});

test('normalized coordinate and sampling strategies retain normalized stroke geometry', () => {
  const fixture = createSession({
    coordinate: (event) => ({
      x: event.x / event.width,
      y: event.y / event.height,
      pressure: event.pressure,
    }),
    constructStroke: () => ({ tool: 'eraser', canvasHeight: 200 }),
    sample: createDistanceSamplingStrategy({ minimumDistance: 0.0005 }),
  });

  fixture.session.start({ x: 25, y: 50, width: 100, height: 200, pressure: 0.3 });
  assert.equal(
    fixture.session.move({
      x: 50,
      y: 100,
      width: 100,
      height: 200,
      pressure: 0.7,
      getCoalescedEvents: () => [
        { x: 25.01, y: 50.01, width: 100, height: 200, pressure: 0.4 },
        { x: 50, y: 100, width: 100, height: 200, pressure: 0.7 },
      ],
    }),
    true,
  );

  assert.deepEqual(fixture.session.activeStroke, {
    tool: 'eraser',
    canvasHeight: 200,
    points: [
      { x: 0.25, y: 0.25, pressure: 0.3 },
      { x: 0.5, y: 0.5, pressure: 0.7 },
    ],
  });

  fixture.session.end({ pointerId: 2 });
  assert.deepEqual(fixture.persisted[0].stroke.points, [
    { x: 0.25, y: 0.25, pressure: 0.3 },
    { x: 0.5, y: 0.5, pressure: 0.7 },
  ]);
});

test('selection session has explicit selecting transitions and delegates only selection work', () => {
  const fixture = createSession();
  const startEvent = { x: 4, y: 5 };
  const moveEvent = { x: 8, y: 9 };
  const endEvent = { x: 8, y: 9 };

  fixture.session.start(startEvent, { mode: StrokeSessionState.SELECTING });

  assert.deepEqual(fixture.session.state, { kind: StrokeSessionState.SELECTING });
  assert.equal(fixture.session.activeStroke, null);
  assert.throws(
    () => fixture.session.start(startEvent, { mode: StrokeSessionState.SELECTING }),
    /Cannot start while stroke session is selecting/,
  );
  assert.equal(fixture.session.move(moveEvent), true);
  assert.deepEqual(fixture.session.end(endEvent), { kind: StrokeSessionState.SELECTING });
  assert.deepEqual(fixture.session.state, { kind: StrokeSessionState.IDLE });
  assert.deepEqual(fixture.selection.calls, [
    ['start', startEvent],
    ['move', moveEvent],
    ['end', endEvent],
  ]);
  assert.deepEqual(fixture.rendered, []);
  assert.deepEqual(fixture.persisted, []);
});

test('invalid modes and strategy results are rejected without creating invalid states', () => {
  const fixture = createSession();

  assert.throws(
    () => fixture.session.start({ x: 1, y: 2 }, { mode: 'painting' }),
    /Unknown stroke session mode: painting/,
  );
  assert.deepEqual(fixture.session.state, { kind: StrokeSessionState.IDLE });

  const invalidStroke = createSession({
    constructStroke: () => ({ tool: 'pen', points: [] }),
  });
  assert.throws(
    () => invalidStroke.session.start({ x: 1, y: 2 }),
    /must not define session-owned points/,
  );
  assert.deepEqual(invalidStroke.session.state, { kind: StrokeSessionState.IDLE });

  const invalidSample = createSession({
    sample: () => [{ x: Number.NaN, y: 3 }],
  });
  invalidSample.session.start({ x: 1, y: 2 });
  assert.throws(
    () => invalidSample.session.move({ x: 2, y: 3 }),
    /sampling strategy must return a point with finite x and y values/,
  );
  assert.deepEqual(invalidSample.session.activeStroke.points, [
    { x: 1, y: 2, pressure: undefined },
  ]);
});
