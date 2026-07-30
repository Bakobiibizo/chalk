import assert from 'node:assert/strict';
import test from 'node:test';

import { LessonProgressionService } from '../src/lesson-progression-service.js';
import { readRuntimeModuleDependencies } from './module-dependency-boundaries.js';

function createPreviousLesson() {
  return {
    id: 41,
    title: 'Foundations',
    topic: 'Geometry',
    summary: 'Points and lines',
    level: 'Intermediate',
    minutes: 12,
    lessonGraph: {
      title: 'Geometry path',
      contract: 'Build geometry from primitive objects.',
      nodes: [
        {
          id: 'foundations',
          title: 'Foundations',
          obligation: 'Define points and lines.',
          teaches: ['points', 'lines'],
          status: 'active',
        },
        {
          id: 'angles',
          title: 'Angles',
          obligation: 'Relate rays through angle measure.',
          teaches: ['rays', 'degrees'],
          status: 'planned',
        },
        {
          id: 'triangles',
          title: 'Triangles',
          obligation: 'Combine segments into triangles.',
          teaches: ['triangle classes'],
          status: 'planned',
        },
      ],
      edges: [
        { from: 'foundations', to: 'angles', relation: 'prerequisite' },
        { from: 'angles', to: 'triangles', relation: 'prerequisite' },
      ],
    },
  };
}

function createGeneratedLesson() {
  return {
    title: 'Measuring Angles',
    topic: 'Geometry',
    summary: 'Measure the turn between two rays.',
    explanation: 'An angle records a turn around a shared endpoint.',
    example: 'A quarter turn measures 90 degrees.',
    practice: 'Identify a 45 degree angle.',
    hint: 'Compare the turn with a quarter turn.',
  };
}

test('progression service generates, parses through Grist, advances the graph, and inserts', async () => {
  const previousLesson = createPreviousLesson();
  const originalGraph = structuredClone(previousLesson.lessonGraph);
  const generatedLesson = createGeneratedLesson();
  const calls = [];
  const storedLessons = [];
  const service = new LessonProgressionService({
    store: {
      prepend(lesson) {
        calls.push({ type: 'prepend', lesson });
        storedLessons.unshift(lesson);
        return lesson;
      },
    },
    coachService: {
      isActive: false,
      async run(prompt, image) {
        calls.push({ type: 'run', prompt, image });
        return 'raw Codex response';
      },
    },
    async parseModelJson(raw) {
      calls.push({ type: 'parse', raw });
      return generatedLesson;
    },
    createLessonId: () => 9001,
    createTimestamp: () => '2026-07-25T12:00:00.000Z',
  });

  const generation = service.generateNext(previousLesson);

  assert.equal(generation.status, 'started');
  assert.equal(generation.node.id, 'angles');
  const result = await generation.completion;

  assert.equal(result.status, 'generated');
  assert.equal(result.node, generation.node);
  assert.equal(result.lesson, storedLessons[0]);
  assert.match(calls[0].prompt, /Current next node id: angles/);
  assert.match(calls[0].prompt, /Previous lesson title: Foundations/);
  assert.equal(calls[0].image, null);
  assert.deepEqual(calls[1], { type: 'parse', raw: 'raw Codex response' });
  assert.equal(calls[2].type, 'prepend');
  assert.deepEqual(previousLesson.lessonGraph, originalGraph);
  assert.deepEqual(
    result.lesson.lessonGraph.nodes.map(({ id, status }) => ({ id, status })),
    [
      { id: 'foundations', status: 'completed' },
      { id: 'angles', status: 'active' },
      { id: 'triangles', status: 'planned' },
    ],
  );
  assert.equal(result.lesson.graphNodeId, 'angles');
  assert.equal(result.lesson.id, 9001);
  assert.equal(result.lesson.level, previousLesson.level);
  assert.equal(result.lesson.minutes, previousLesson.minutes);
  assert.equal(result.lesson.completed, false);
  assert.equal(result.lesson.createdAt, '2026-07-25T12:00:00.000Z');
});

test('progression service returns explicit no-op results for complete and busy graphs', () => {
  const coachService = {
    isActive: false,
    run() {
      assert.fail('Codex should not run when progression cannot start');
    },
  };
  const service = new LessonProgressionService({
    store: {
      prepend() {
        assert.fail('a lesson should not be inserted');
      },
    },
    coachService,
    parseModelJson() {
      assert.fail('Grist should not parse without a Codex response');
    },
  });
  const completeLesson = createPreviousLesson();
  completeLesson.lessonGraph.nodes = completeLesson.lessonGraph.nodes.slice(0, 1);

  assert.deepEqual(service.generateNext(completeLesson), { status: 'complete', node: null });

  coachService.isActive = true;
  const busyResult = service.generateNext(createPreviousLesson());
  assert.equal(busyResult.status, 'busy');
  assert.equal(busyResult.node.id, 'angles');
  assert.equal('completion' in busyResult, false);
});

test('progression service propagates generation and Grist failures without inserting', async () => {
  const previousLesson = createPreviousLesson();
  let insertions = 0;
  const store = {
    prepend() {
      insertions += 1;
    },
  };

  const generationFailure = new LessonProgressionService({
    store,
    coachService: {
      isActive: false,
      async run() {
        throw new Error('Codex unavailable');
      },
    },
    parseModelJson() {
      assert.fail('Grist should not run after a Codex failure');
    },
  }).generateNext(previousLesson);

  await assert.rejects(generationFailure.completion, /Codex unavailable/);
  assert.equal(insertions, 0);

  const parseFailure = new LessonProgressionService({
    store,
    coachService: {
      isActive: false,
      async run() {
        return 'invalid output';
      },
    },
    async parseModelJson() {
      throw new Error('Grist rejected output');
    },
  }).generateNext(previousLesson);

  await assert.rejects(parseFailure.completion, /Grist rejected output/);
  assert.equal(insertions, 0);
});

test('progression service has no runtime dependency on DOM or persistence modules', async () => {
  const dependencies = await readRuntimeModuleDependencies(
    new URL('../src/lesson-progression-service.js', import.meta.url),
  );

  assert.deepEqual(dependencies, new Set(['./lesson-ai.js', './lesson-runtime-factories.js']));
});
