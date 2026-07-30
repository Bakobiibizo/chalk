import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { renderLessonDetailTemplate } from '../src/lesson-detail-template.js';

function parseTemplate(lesson) {
  const markup = renderLessonDetailTemplate(lesson);
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`);
  return { document: dom.window.document, markup };
}

function lesson(overrides = {}) {
  return {
    id: 4,
    topic: 'Geometry',
    title: 'Angles',
    minutes: 10,
    level: 'Beginner',
    explanation: 'Angles measure turns.',
    example: 'A right angle.',
    practice: 'Draw one.',
    hint: 'Use a corner.',
    completed: false,
    ...overrides,
  };
}

test('lesson detail template renders the practice toolbar, reading content, graph, and actions', () => {
  const { document } = parseTemplate(
    lesson({
      completed: true,
      lessonGraph: {
        title: 'Angle plan',
        contract: 'Understand angle relationships.',
        nodes: [
          {
            id: 'angles',
            title: 'Angles',
            obligation: 'Measure a turn.',
            status: 'active',
          },
          {
            id: 'triangles',
            title: 'Triangles',
            obligation: 'Connect three angles.',
            status: 'planned',
          },
        ],
        edges: [{ from: 'angles', to: 'triangles' }],
      },
    }),
  );

  assert.equal(document.querySelectorAll('[data-practice-tool]').length, 3);
  assert.ok(document.querySelector('[data-practice-undo]'));
  assert.ok(document.querySelector('[data-practice-clear]'));
  assert.ok(document.querySelector('.lesson-practice-canvas'));
  assert.equal(document.querySelector('.lesson-reading-pane h1').textContent, 'Angles');
  assert.match(document.querySelector('.lesson-meta').textContent, /^10 minutes · Beginner/);
  assert.equal(document.querySelectorAll('.lesson-graph-block li').length, 2);
  assert.equal(document.querySelector('[data-next-graph-node]').dataset.nextGraphNode, 'triangles');
  assert.equal(document.querySelector('[data-complete]').dataset.complete, '4');
  assert.ok(document.querySelector('[data-complete]').classList.contains('done'));
  assert.ok(document.querySelector('[data-practice]'));
  assert.ok(document.querySelector('[data-ask-lesson]'));
});

test('lesson detail template escapes hostile model text and action identifiers', () => {
  const hostileText = '<img src=x data-model-injection="true">& "\'';
  const hostileId = 'lesson" data-id-injection="true';
  const hostileNodeId = 'next" data-node-id-injection="true';
  const { document, markup } = parseTemplate(
    lesson({
      id: hostileId,
      topic: hostileText,
      title: hostileText,
      level: hostileText,
      explanation: hostileText,
      example: hostileText,
      practice: hostileText,
      hint: hostileText,
      lessonGraph: {
        title: hostileText,
        contract: hostileText,
        nodes: [
          {
            id: 'current',
            title: hostileText,
            obligation: hostileText,
            status: 'active',
          },
          {
            id: hostileNodeId,
            title: hostileText,
            obligation: hostileText,
            status: 'planned',
          },
        ],
        edges: [{ from: hostileText, to: hostileText }],
      },
    }),
  );

  assert.equal(document.querySelector('[data-model-injection]'), null);
  assert.equal(document.querySelector('[data-id-injection]'), null);
  assert.equal(document.querySelector('[data-node-id-injection]'), null);
  assert.equal(document.querySelectorAll('.lesson-reading-pane img').length, 0);
  assert.equal(
    document.querySelector('.lesson-reading-pane > article > .eyebrow').textContent,
    hostileText.toUpperCase(),
  );
  assert.equal(document.querySelector('.lesson-reading-pane h1').textContent, hostileText);
  assert.match(document.querySelector('.lesson-meta').textContent, new RegExp(hostileText));
  assert.equal(document.querySelector('.lesson-block p').textContent, hostileText);
  assert.equal(document.querySelector('.example-box').textContent, hostileText);
  assert.equal(document.querySelector('.practice-box').textContent, hostileText);
  assert.match(document.querySelector('.practice-box + p').textContent, new RegExp(hostileText));
  assert.equal(document.querySelector('.lesson-graph-block h2').textContent, hostileText);
  assert.equal(document.querySelector('.lesson-graph-block p').textContent, hostileText);
  assert.equal(document.querySelector('.lesson-graph-block li b').textContent, hostileText);
  assert.equal(document.querySelector('.lesson-graph-block li small').textContent, hostileText);
  assert.match(document.querySelector('.lesson-graph-edges').textContent, new RegExp(hostileText));
  assert.equal(document.querySelector('[data-complete]').dataset.complete, hostileId);
  assert.equal(
    document.querySelector('[data-next-graph-node]').dataset.nextGraphNode,
    hostileNodeId,
  );
  assert.doesNotMatch(markup, /<img src=x data-model-injection/);
  assert.match(markup, /&lt;img src=x data-model-injection=&quot;true&quot;&gt;/);
});
