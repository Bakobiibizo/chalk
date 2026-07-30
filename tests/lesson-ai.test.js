import assert from 'node:assert/strict';
import test from 'node:test';

import { lessonPrompt, parseLessonResponse } from '../src/lesson-ai.js';

test('lesson generation delegates model output parsing to Grist and normalizes its graph', async () => {
  let parserInput = null;
  const lesson = await parseLessonResponse('model output requiring Grist', async (raw) => {
    parserInput = raw;
    return {
      lessonGraph: {
        title: 'Fractions',
        nodes: [{ id: 'first step', title: 'Parts', obligation: 'Define parts' }],
        edges: [],
      },
      firstLesson: {
        title: 'Parts',
        topic: 'Fractions',
        summary: 'Start here',
        explanation: 'A fraction is a ratio.',
        example: 'One half',
        practice: 'Shade one half.',
        hint: 'Split equally.',
      },
    };
  });
  assert.equal(parserInput, 'model output requiring Grist');
  assert.ok(lesson.lessonGraph);
  assert.equal(lesson.lessonGraph.nodes[0].id, 'first-step');
  assert.equal(lesson.graphNodeId, 'first-step');
  await assert.rejects(() => parseLessonResponse('{}'), /Grist JSON parser is not available/);
});

test('lesson generation preserves large plans, fields, and learner requests without truncation', async () => {
  const largeText = 'lesson-content-'.repeat(1_200);
  const nodes = Array.from({ length: 40 }, (_value, index) => ({
    id: `node-${index}`,
    title: `${index}-${largeText}`,
    obligation: largeText,
    teaches: Array.from({ length: 8 }, () => largeText),
  }));
  const edges = Array.from({ length: 39 }, (_value, index) => ({
    from: `node-${index}`,
    to: `node-${index + 1}`,
    relation: largeText,
  }));
  const lesson = await parseLessonResponse('large model output', async () => ({
    lessonGraph: {
      title: largeText,
      contract: largeText,
      nodes,
      edges,
    },
    firstLesson: {
      title: largeText,
      topic: largeText,
      summary: largeText,
      explanation: largeText,
      example: largeText,
      practice: largeText,
      hint: largeText,
    },
  }));

  assert.equal(lesson.title, largeText);
  assert.equal(lesson.explanation, largeText);
  assert.equal(lesson.lessonGraph.title, largeText);
  assert.equal(lesson.lessonGraph.contract, largeText);
  assert.equal(lesson.lessonGraph.nodes.length, nodes.length);
  assert.equal(lesson.lessonGraph.nodes[0].title, nodes[0].title);
  assert.equal(lesson.lessonGraph.nodes[0].teaches.length, 8);
  assert.equal(lesson.lessonGraph.edges.length, edges.length);
  assert.equal(lesson.lessonGraph.edges[0].relation, largeText);

  const learnerRequest = `Build a complete curriculum.\n${'full-scope-objective '.repeat(500)}`;
  const prompt = lessonPrompt(learnerRequest, 'Advanced');
  assert.ok(prompt.includes(learnerRequest));
  assert.doesNotMatch(prompt, /truncated|under 12000|6-14 nodes/);
});
