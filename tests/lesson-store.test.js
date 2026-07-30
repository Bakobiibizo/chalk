import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LessonPayloadValidationError,
  parseLessonExportPayload,
  parsePersistedLessonPayload,
} from '../src/lesson-payload-contract.js';
import { LessonStore } from '../src/lesson-store.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.writes = [];
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
    this.writes.push([key, value]);
  }
}

function lesson(overrides = {}) {
  return {
    id: 7,
    title: 'Equivalent fractions',
    topic: 'Fractions',
    summary: 'Compare equal values.',
    explanation: 'Equivalent fractions name the same value.',
    example: 'One half equals two fourths.',
    practice: 'Write two fractions equal to one third.',
    hint: 'Multiply numerator and denominator by the same number.',
    level: 'Beginner',
    completed: false,
    createdAt: '2026-07-25T12:00:00.000Z',
    ...overrides,
  };
}

function lessonGraph(overrides = {}) {
  return {
    title: 'Fraction plan',
    contract: 'Teach dependency-ordered fraction concepts.',
    nodes: [
      {
        id: 'equivalence',
        title: 'Equivalence',
        obligation: 'Recognize equal fractions.',
        teaches: ['Scale numerator and denominator together'],
        status: 'active',
      },
      {
        id: 'comparison',
        title: 'Comparison',
        obligation: 'Compare fractions.',
        teaches: [],
        status: 'planned',
      },
    ],
    edges: [{ from: 'equivalence', to: 'comparison', relation: 'prerequisite' }],
    ...overrides,
  };
}

test('lesson storage keeps the legacy bare-array format and normalizes supported lessons', () => {
  const storage = new MemoryStorage({
    'chalk-lessons': JSON.stringify([
      lesson({
        minutes: '12',
        lessonGraph: lessonGraph(),
        practiceStrokes: [
          {
            points: [
              { x: 0.25, y: 0.5 },
              { x: 0.75, y: 0.8, pressure: 0.9 },
            ],
            canvasHeight: 640,
          },
        ],
      }),
    ]),
  });

  const store = new LessonStore(storage);

  assert.equal(store.lessons.length, 1);
  assert.equal(store.lessons[0].minutes, 12);
  assert.equal(store.lessons[0].practiceStrokes[0].tool, 'pen');
  assert.equal(store.lessons[0].practiceStrokes[0].points[0].pressure, 0.55);
  assert.equal(store.lessons[0].graphNodeId, 'equivalence');
  store.save();
  assert.ok(Array.isArray(JSON.parse(storage.getItem('chalk-lessons'))));
});

test('malformed nested stored lesson data is diagnosed and propagated without a write', () => {
  const storage = new MemoryStorage({
    'chalk-lessons': JSON.stringify([
      lesson({
        practiceStrokes: [
          {
            tool: 'marker',
            points: [{ x: 'outside', y: 0.5, pressure: 4 }],
          },
        ],
        lessonGraph: lessonGraph({
          edges: [{ from: 'missing', to: 'missing', relation: 'invalid' }],
        }),
      }),
    ]),
  });
  const diagnostics = [];

  assert.throws(
    () =>
      new LessonStore(storage, {
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    LessonPayloadValidationError,
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'STORAGE_PARSE_FAILED');
  assert.equal(diagnostics[0].boundary, 'lesson storage');
  assert.equal(diagnostics[0].key, 'chalk-lessons');
  const error = diagnostics[0].error;
  assert.ok(error instanceof LessonPayloadValidationError);
  assert.equal(error.code, 'LESSON_PAYLOAD_INVALID');
  assert.equal(error.source, 'lesson storage v1');
  assert.ok(
    error.issues.some(
      (entry) =>
        entry.code === 'invalid_value' && entry.path.join('.') === '0.practiceStrokes.0.tool',
    ),
  );
  assert.ok(
    error.issues.some(
      (entry) =>
        entry.code === 'invalid_type' && entry.path.join('.') === '0.practiceStrokes.0.points.0.x',
    ),
  );
  assert.ok(
    error.issues.some(
      (entry) =>
        entry.code === 'unknown_reference' && entry.path.join('.') === '0.lessonGraph.edges.0.from',
    ),
  );
  assert.equal(storage.writes.length, 0);
});

test('invalid stored JSON is reported and propagated', () => {
  const storage = new MemoryStorage({ 'chalk-lessons': '{not-json' });
  const diagnostics = [];

  assert.throws(
    () =>
      new LessonStore(storage, {
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    LessonPayloadValidationError,
  );
  assert.equal(diagnostics.length, 1);
  assert.ok(diagnostics[0].error instanceof LessonPayloadValidationError);
  assert.equal(diagnostics[0].error.source, 'lesson storage');
  assert.deepEqual(diagnostics[0].error.issues[0].path, []);
  assert.equal(diagnostics[0].error.issues[0].code, 'invalid_json');
  assert.equal(storage.writes.length, 0);
});

test('lesson storage reports read and write failures without hiding them', () => {
  const readError = new Error('lesson storage unavailable');
  const readDiagnostics = [];
  assert.throws(
    () =>
      new LessonStore(
        {
          getItem() {
            throw readError;
          },
        },
        {
          onDiagnostic: (diagnostic) => readDiagnostics.push(diagnostic),
        },
      ),
    readError,
  );

  assert.equal(readDiagnostics.length, 1);
  assert.equal(readDiagnostics[0].code, 'STORAGE_READ_FAILED');
  assert.equal(readDiagnostics[0].error, readError);

  const writeError = new Error('lesson storage quota exceeded');
  const writeDiagnostics = [];
  const writeStore = new LessonStore(
    {
      getItem() {
        return null;
      },
      setItem() {
        throw writeError;
      },
    },
    {
      onDiagnostic: (diagnostic) => writeDiagnostics.push(diagnostic),
    },
  );

  assert.throws(() => writeStore.prepend(lesson()), writeError);
  assert.equal(writeDiagnostics.length, 1);
  assert.equal(writeDiagnostics[0].code, 'STORAGE_WRITE_FAILED');
  assert.equal(writeDiagnostics[0].error, writeError);
});

test('empty lesson storage initializes normally without diagnostics', () => {
  const storage = new MemoryStorage();
  const diagnostics = [];

  const store = new LessonStore(storage, {
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  assert.deepEqual(store.lessons, []);
  assert.deepEqual(diagnostics, []);
  assert.equal(storage.writes.length, 0);
});

test('prepend validates before changing LessonStore state or persisted data', () => {
  const storage = new MemoryStorage();
  const store = new LessonStore(storage);

  assert.throws(
    () => store.prepend(lesson({ id: 9, practiceStrokes: [{ points: 'not-points' }] })),
    LessonPayloadValidationError,
  );
  assert.deepEqual(store.lessons, []);
  assert.equal(storage.getItem('chalk-lessons'), null);

  const stored = store.prepend(lesson({ id: 9 }));
  assert.equal(stored.id, 9);
  assert.deepEqual(stored.practiceStrokes, []);
  assert.equal(JSON.parse(storage.getItem('chalk-lessons')).length, 1);

  assert.throws(() => store.prepend(lesson({ id: 9 })), LessonPayloadValidationError);
  assert.equal(store.lessons.length, 1);
});

test('lesson store owns lookup and completion persistence commands', () => {
  const storage = new MemoryStorage();
  const store = new LessonStore(storage);
  const stored = store.prepend(lesson());
  const writesBeforeToggle = storage.writes.length;

  assert.equal(store.find(stored.id), stored);
  assert.equal(store.find('missing'), null);
  assert.equal(store.toggleCompleted(stored.id), stored);
  assert.equal(stored.completed, true);
  assert.equal(storage.writes.length, writesBeforeToggle + 1);
  assert.equal(JSON.parse(storage.getItem('chalk-lessons'))[0].completed, true);
  assert.equal(store.toggleCompleted('missing'), null);
  assert.equal(storage.writes.length, writesBeforeToggle + 1);
});

test('lesson imports require the supported version and reject adversarial graphs atomically', () => {
  const storage = new MemoryStorage();
  const store = new LessonStore(storage);
  store.prepend(lesson());
  const persistedBeforeImport = storage.getItem('chalk-lessons');

  for (const version of [undefined, 2]) {
    assert.throws(
      () =>
        store.import({
          kind: 'chalk.lessons',
          version,
          lessons: [lesson({ id: 22 })],
        }),
      (error) => {
        assert.ok(error instanceof LessonPayloadValidationError);
        assert.ok(
          error.issues.some((entry) =>
            ['missing_version', 'unsupported_version'].includes(entry.code),
          ),
        );
        return true;
      },
    );
  }

  assert.throws(
    () =>
      store.import({
        kind: 'chalk.lessons',
        version: 1,
        lessons: [
          lesson({
            id: 22,
            lessonGraph: lessonGraph({
              nodes: [
                {
                  id: 'same',
                  title: 'First',
                  obligation: 'First obligation',
                  teaches: [],
                  status: 'active',
                },
                {
                  id: 'same',
                  title: 'Second',
                  obligation: 'Second obligation',
                  teaches: [],
                  status: 'planned',
                },
              ],
            }),
          }),
        ],
      }),
    (error) => {
      assert.ok(
        error.issues.some(
          (entry) =>
            entry.code === 'duplicate_identifier' &&
            entry.path.join('.') === 'lessons.0.lessonGraph.nodes.1.id',
        ),
      );
      return true;
    },
  );

  assert.equal(store.lessons.length, 1);
  assert.equal(storage.getItem('chalk-lessons'), persistedBeforeImport);
});

test('version 1 lesson imports normalize nested payloads before adding injected metadata', () => {
  const storage = new MemoryStorage();
  const store = new LessonStore(storage, {
    now: () => new Date('2026-08-09T10:11:12.000Z'),
    createIdentifier: () => 1_000,
  });
  const payload = {
    kind: 'chalk.lessons',
    version: 1,
    exportedAt: '2026-07-25T12:00:00.000Z',
    lessons: [
      lesson({
        id: 'source-id',
        minutes: '8',
        lessonGraph: lessonGraph(),
        graphNodeId: 'comparison',
        practiceStrokes: [{ tool: 'eraser', points: [{ x: 0.1, y: 0.2 }] }],
      }),
    ],
  };

  const parsed = parseLessonExportPayload(payload);
  assert.equal(parsed[0].id, 'source-id');
  assert.equal(parsed[0].minutes, 8);

  const imported = store.import(payload);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].id, 1_000);
  assert.equal(imported[0].importedAt, '2026-08-09T10:11:12.000Z');
  assert.equal(imported[0].practiceStrokes[0].points[0].pressure, 0.55);
  assert.equal(imported[0].graphNodeId, 'comparison');
  assert.deepEqual(parsePersistedLessonPayload(store.lessons), store.lessons);
});

test('lesson export uses the injected clock for its filename and versioned envelope', async () => {
  const storage = new MemoryStorage();
  const store = new LessonStore(storage, {
    now: () => new Date('2026-08-09T10:11:12.000Z'),
  });
  store.prepend(lesson());
  const downloads = [];
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      click() {
        downloads.push({ filename: this.download, href: this.href });
      },
    }),
  };

  try {
    store.export();
    assert.equal(downloads[0].filename, 'chalk-lessons-2026-08-09.json');
    const response = await fetch(downloads[0].href);
    const envelope = await response.json();
    assert.equal(envelope.kind, 'chalk.lessons');
    assert.equal(envelope.version, 1);
    assert.equal(envelope.exportedAt, '2026-08-09T10:11:12.000Z');
    assert.equal(envelope.lessons.length, 1);
    assert.equal(envelope.lessons[0].title, 'Equivalent fractions');
  } finally {
    globalThis.document = originalDocument;
  }
});
