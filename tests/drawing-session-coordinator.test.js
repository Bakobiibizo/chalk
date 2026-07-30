import assert from 'node:assert/strict';
import test from 'node:test';

import { createDrawingSessionCoordinator } from '../src/drawing-session-coordinator.js';

function createFixture(overrides = {}) {
  const events = [];
  const project = {
    id: 11,
    title: 'Original project',
    activePageId: 21,
    pages: [
      {
        id: 21,
        title: 'Page 1',
        strokes: [{ tool: 'eraser', points: [] }],
        cards: [{ latex: 'old', result: 'card' }],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    codexThreadId: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const page = project.pages[0];
  const sketch = { pageTitle: { value: '  Updated project  ' } };
  const savedStrokes = [{ tool: 'pen', points: [{ x: 1, y: 2 }] }];
  const savedCards = [{ latex: 'x+1', result: '2' }];
  const loaded = { strokes: null, cards: null };
  const toasts = [];
  let restoreCount = 0;
  const sketchCanvasController = {
    getStrokes: () => savedStrokes,
    loadStrokes: (strokes) => {
      events.push('strokes.load');
      loaded.strokes = strokes;
    },
    redraw: () => events.push('canvas.redraw'),
  };
  const mathCardsController = {
    getCards: () => savedCards,
    setCards: (cards) => {
      events.push('cards.load');
      loaded.cards = cards;
    },
  };
  const coachPanelUI = {
    restoreForSession() {
      events.push('coach.restore');
      restoreCount += 1;
    },
  };
  const projectsComposition = {
    renderProjects: () => events.push('projects.render'),
    renderPages: () => events.push('pages.render'),
  };

  const coordinator = createDrawingSessionCoordinator({
    sketch,
    activeSession: () => project,
    activePage: () => page,
    ensureCoachThreads: (session) => {
      events.push('coach.normalize');
      assert.equal(session, project);
      return { codexThreadId: 'thread-current' };
    },
    persistSession: () => events.push('project.persist'),
    sketchCanvasController,
    mathCardsController,
    coachPanelUI,
    projectsComposition,
    showToast: (message) => toasts.push(message),
    currentTimestamp: () => '2026-07-25T20:00:00.000Z',
    ...overrides,
  });

  return {
    coordinator,
    events,
    loaded,
    page,
    project,
    savedCards,
    savedStrokes,
    sketch,
    toasts,
    restoreCount: () => restoreCount,
  };
}

test('drawing session coordinator saves the active page as one in-place transaction', () => {
  const fixture = createFixture();
  const originalProject = fixture.project;
  const originalPage = fixture.page;

  fixture.coordinator.saveDrawing();

  assert.equal(fixture.project, originalProject);
  assert.equal(fixture.page, originalPage);
  assert.equal(fixture.project.title, 'Updated project');
  assert.equal(fixture.page.strokes, fixture.savedStrokes);
  assert.equal(fixture.page.cards, fixture.savedCards);
  assert.equal(fixture.page.updatedAt, '2026-07-25T20:00:00.000Z');
  assert.equal(fixture.project.updatedAt, fixture.page.updatedAt);
  assert.deepEqual(fixture.events, ['project.persist', 'projects.render', 'pages.render']);
  assert.deepEqual(fixture.toasts, []);
});

test('drawing session coordinator loads drawing and coach state without replacing project data', () => {
  const fixture = createFixture();
  const originalProject = fixture.project;
  const originalPage = fixture.page;

  fixture.coordinator.loadDrawing();

  assert.equal(fixture.project, originalProject);
  assert.equal(fixture.page, originalPage);
  assert.equal(fixture.loaded.strokes, fixture.page.strokes);
  assert.equal(fixture.loaded.cards, fixture.page.cards);
  assert.equal(fixture.sketch.pageTitle.value, 'Original project');
  assert.equal(fixture.project.codexThreadId, 'thread-current');
  assert.equal(fixture.restoreCount(), 1);
  assert.deepEqual(fixture.events, [
    'strokes.load',
    'cards.load',
    'coach.normalize',
    'coach.restore',
    'pages.render',
    'canvas.redraw',
  ]);
});

test('drawing session coordinator propagates save transaction failures', () => {
  const fixture = createFixture({
    persistSession() {
      throw new Error('storage quota exceeded');
    },
  });

  assert.throws(() => fixture.coordinator.saveDrawing(), /storage quota exceeded/);

  assert.deepEqual(fixture.toasts, []);
  assert.deepEqual(fixture.events, []);
});
