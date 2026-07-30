import assert from 'node:assert/strict';
import test from 'node:test';

import { ProjectImportExportService } from '../src/project-import-export.js';
import { ProjectPayloadValidationError } from '../src/project-payload-contract.js';
import { ProjectStore } from '../src/project-store.js';

class MemoryStorage {
  constructor() {
    this.entries = new Map();
    /** @type {Error | null} */
    this.writeError = null;
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.writeError) throw this.writeError;
    this.entries.set(key, String(value));
  }
}

function createInitializedStore() {
  const storage = new MemoryStorage();
  let nextIdentifier = 1;
  const store = new ProjectStore({
    storage,
    now: () => new Date('2026-04-05T06:07:08.000Z'),
    createIdentifier: () => nextIdentifier++,
  });
  store.initialize();
  return { storage, store };
}

function createVersionTwoExport() {
  const timestamp = '2026-01-02T03:04:05.000Z';
  return {
    kind: 'chalk.project',
    version: 2,
    exportedAt: timestamp,
    project: {
      id: 1,
      title: 'Validated project',
      pages: [
        {
          id: 2,
          title: 'Page 1',
          strokes: [
            {
              tool: 'pen',
              color: '#252522',
              size: 4,
              points: [{ x: 0.25, y: 0.5, pressure: 0.75 }],
            },
          ],
          cards: [{ id: 3, expression: '2+2', result: '4', x: 10, y: 20 }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      activePageId: 2,
      coachMessages: [],
      coachThreads: [
        {
          id: 4,
          title: 'Question',
          messages: [{ role: 'user', text: 'Why?', createdAt: timestamp }],
          codexThreadId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      activeCoachThreadId: 4,
      codexThreadId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

test('project store factories deterministically create and persist project and page metadata', () => {
  const storage = new MemoryStorage();
  const times = [new Date('2026-02-03T04:05:06.000Z'), new Date('2026-02-03T04:05:07.000Z')];
  const identifiers = {
    page: 101,
    project: 202,
  };
  const identifierKinds = [];
  const store = new ProjectStore({
    storage,
    now: () => times.shift(),
    createIdentifier: (kind) => {
      identifierKinds.push(kind);
      return identifiers[kind];
    },
  });

  store.initialize();

  assert.deepEqual(identifierKinds, ['page', 'project']);
  assert.equal(store.activeSession().id, 202);
  assert.equal(store.activeSession().createdAt, '2026-02-03T04:05:06.000Z');
  assert.equal(store.activeSession().updatedAt, '2026-02-03T04:05:06.000Z');
  assert.equal(store.activePage().id, 101);
  assert.equal(store.activePage().createdAt, '2026-02-03T04:05:07.000Z');
  assert.equal(store.activePage().updatedAt, '2026-02-03T04:05:07.000Z');
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
  assert.equal(storage.getItem('chalk-sessions-v1').includes('createIdentifier'), false);
  assert.equal(storage.getItem('chalk-sessions-v1').includes('"now"'), false);
});

test('project commands create and activate only existing projects', () => {
  const { storage, store } = createInitializedStore();
  const originalProject = store.activeSession();

  const createdProject = store.createProject({ title: 'New project' });

  assert.equal(store.state.sessions[0], createdProject);
  assert.equal(store.activeSession(), createdProject);
  assert.equal(createdProject.title, 'New project');
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);

  assert.equal(store.activateProject(originalProject.id), true);
  assert.equal(store.activeSession(), originalProject);

  const persistedState = storage.getItem('chalk-sessions-v1');
  assert.equal(store.activateProject(originalProject.id), false);
  assert.equal(store.activateProject(999_999), false);
  assert.equal(store.activeSession(), originalProject);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
});

test('import insertion activates and persists the validated project atomically', () => {
  const { storage, store } = createInitializedStore();
  const previousState = store.state;
  const imported = store.parseImport(createVersionTwoExport());
  imported.id = 303;
  imported.title = 'Validated project (imported)';
  imported.importedAt = '2026-04-05T06:07:08.000Z';

  assert.equal(store.insertImportedProject(imported), imported);
  assert.notEqual(store.state, previousState);
  assert.equal(store.state.sessions[0], imported);
  assert.equal(store.activeSession(), imported);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('failed imported-project persistence leaves the current state unchanged', () => {
  const diagnostics = [];
  const storage = new MemoryStorage();
  let nextIdentifier = 1;
  const store = new ProjectStore({
    storage,
    now: () => new Date('2026-04-05T06:07:08.000Z'),
    createIdentifier: () => nextIdentifier++,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  store.initialize();
  const previousState = store.state;
  const persistedState = storage.getItem('chalk-sessions-v1');
  const imported = store.parseImport(createVersionTwoExport());
  imported.id = 303;
  const writeError = new Error('project import persistence failed');
  storage.writeError = writeError;

  assert.throws(() => store.insertImportedProject(imported), writeError);
  assert.equal(store.state, previousState);
  assert.notEqual(store.activeSession(), imported);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
  assert.equal(diagnostics.at(-1)?.code, 'STORAGE_WRITE_FAILED');
  assert.equal(diagnostics.at(-1)?.error, writeError);
});

test('project deletion preserves the minimum-project and active-project invariants', () => {
  const { storage, store } = createInitializedStore();
  const originalProject = store.activeSession();

  assert.equal(store.deleteProject(originalProject.id), null);
  assert.equal(store.state.sessions.length, 1);
  assert.equal(store.activeSession(), originalProject);

  const createdProject = store.createProject({ title: 'Temporary project' });
  const transition = store.deleteProject(createdProject.id);

  assert.deepEqual(transition, {
    project: createdProject,
    activeProjectChanged: true,
  });
  assert.deepEqual(store.state.sessions, [originalProject]);
  assert.equal(store.activeSession(), originalProject);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('deleting a non-active project keeps the active project and ignores unknown identifiers', () => {
  const { storage, store } = createInitializedStore();
  const originalProject = store.activeSession();
  const createdProject = store.createProject();

  assert.equal(store.activateProject(originalProject.id), true);
  assert.deepEqual(store.deleteProject(createdProject.id), {
    project: createdProject,
    activeProjectChanged: false,
  });
  assert.equal(store.activeSession(), originalProject);

  const persistedState = storage.getItem('chalk-sessions-v1');
  assert.equal(store.deleteProject(999_999), null);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
});

test('page addition creates, activates, timestamps, and persists the next page', () => {
  const { storage, store } = createInitializedStore();
  const project = store.activeSession();

  const page = store.addPage();

  assert.equal(project.pages.at(-1), page);
  assert.equal(page.title, 'Page 2');
  assert.equal(project.activePageId, page.id);
  assert.equal(project.updatedAt, page.updatedAt);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('page activation persists only transitions to pages in the active project', () => {
  const { storage, store } = createInitializedStore();
  const project = store.activeSession();
  const originalPage = store.activePage();
  const addedPage = store.addPage();

  assert.equal(store.activatePage(originalPage.id), true);
  assert.equal(store.activePage(), originalPage);

  const persistedState = storage.getItem('chalk-sessions-v1');
  assert.equal(store.activatePage(originalPage.id), false);
  assert.equal(store.activatePage(999_999), false);
  assert.equal(store.activePage(), originalPage);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
  assert.equal(project.pages.includes(addedPage), true);
});

test('page rename normalizes the title and owns page and project timestamps', () => {
  const storage = new MemoryStorage();
  const times = [
    new Date('2026-04-05T06:07:08.000Z'),
    new Date('2026-04-05T06:07:09.000Z'),
    new Date('2026-04-05T06:07:10.000Z'),
  ];
  let nextIdentifier = 1;
  const store = new ProjectStore({
    storage,
    now: () => times.shift(),
    createIdentifier: () => nextIdentifier++,
  });
  store.initialize();
  const project = store.activeSession();
  const page = store.activePage();

  assert.equal(store.renamePage(page.id, '  Worked example  '), page);
  assert.equal(page.title, 'Worked example');
  assert.equal(page.updatedAt, '2026-04-05T06:07:10.000Z');
  assert.equal(project.updatedAt, page.updatedAt);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);

  const persistedState = storage.getItem('chalk-sessions-v1');
  assert.equal(store.renamePage(999_999, 'Missing page'), null);
  assert.equal(store.renamePage(page.id, '   '), null);
  assert.equal(store.renamePage(page.id, null), null);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
});

test('page deletion preserves the last-page invariant and ignores unknown identifiers', () => {
  const { storage, store } = createInitializedStore();
  const onlyPage = store.activePage();

  const persistedState = storage.getItem('chalk-sessions-v1');
  assert.equal(store.deletePage(onlyPage.id), null);
  assert.equal(store.deletePage(999_999), null);
  assert.deepEqual(store.activeSession().pages, [onlyPage]);
  assert.equal(store.activePage(), onlyPage);
  assert.equal(storage.getItem('chalk-sessions-v1'), persistedState);
});

test('deleting a non-active page retains the active page and returns its transition', () => {
  const { storage, store } = createInitializedStore();
  const originalPage = store.activePage();
  const addedPage = store.addPage();

  const transition = store.deletePage(originalPage.id);

  assert.deepEqual(transition, {
    page: originalPage,
    activePageChanged: false,
  });
  assert.deepEqual(store.activeSession().pages, [addedPage]);
  assert.equal(store.activePage(), addedPage);
  assert.equal(store.activeSession().updatedAt, '2026-04-05T06:07:08.000Z');
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('deleting the active page selects its predecessor or the first remaining page', () => {
  const { storage, store } = createInitializedStore();
  const firstPage = store.activePage();
  const secondPage = store.addPage();
  const thirdPage = store.addPage();

  assert.deepEqual(store.deletePage(thirdPage.id), {
    page: thirdPage,
    activePageChanged: true,
  });
  assert.equal(store.activePage(), secondPage);

  assert.equal(store.activatePage(firstPage.id), true);
  assert.deepEqual(store.deletePage(firstPage.id), {
    page: firstPage,
    activePageChanged: true,
  });
  assert.equal(store.activePage(), secondPage);
  assert.deepEqual(store.activeSession().pages, [secondPage]);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('page commands return explicit no-op results without an active project', () => {
  const storage = new MemoryStorage();
  const store = new ProjectStore({ storage });

  assert.equal(store.addPage(), null);
  assert.equal(store.activatePage(1), false);
  assert.equal(store.renamePage(1, 'Page'), null);
  assert.equal(store.deletePage(1), null);
  assert.equal(storage.getItem('chalk-sessions-v1'), null);
});

test('project import inherits deterministic factories from the project store', () => {
  const storage = new MemoryStorage();
  const identifierKinds = [];
  const store = new ProjectStore({
    storage,
    now: () => new Date('2026-03-04T05:06:07.000Z'),
    createIdentifier: (kind) => {
      identifierKinds.push(kind);
      return 303;
    },
  });
  const service = new ProjectImportExportService(store);
  Object.freeze(store.state.sessions);
  Object.freeze(store.state);

  const imported = service.importProject({
    kind: 'chalk.project',
    version: 2,
    project: {
      id: 1,
      title: 'Deterministic project',
      pages: [
        {
          id: 2,
          title: 'Page 1',
          strokes: [],
          cards: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      activePageId: 2,
      coachMessages: [],
      coachThreads: [],
      activeCoachThreadId: null,
      codexThreadId: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  });

  assert.deepEqual(identifierKinds, ['imported-project']);
  assert.equal(imported.id, 303);
  assert.equal(imported.title, 'Deterministic project (imported)');
  assert.equal(imported.importedAt, '2026-03-04T05:06:07.000Z');
  assert.equal(store.activeSession(), imported);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('project imports report all malformed nested values as structured path issues', () => {
  const storage = new MemoryStorage();
  const store = new ProjectStore({ storage });
  const service = new ProjectImportExportService(store);
  const payload = createVersionTwoExport();
  payload.project.pages[0].strokes[0].points[0].x = '0.25';
  payload.project.pages[0].cards[0].result = { value: 4 };
  payload.project.coachThreads[0].messages[0].role = 'system';

  assert.throws(
    () => service.importProject(payload),
    (error) => {
      assert.equal(error instanceof ProjectPayloadValidationError, true);
      assert.equal(error.code, 'PROJECT_PAYLOAD_INVALID');
      assert.equal(error.source, 'project import');
      assert.deepEqual(
        error.issues.map(({ code, path }) => ({ code, path })),
        [
          {
            code: 'invalid_type',
            path: ['project', 'pages', 0, 'strokes', 0, 'points', 0, 'x'],
          },
          {
            code: 'invalid_type',
            path: ['project', 'pages', 0, 'cards', 0, 'result'],
          },
          {
            code: 'invalid_value',
            path: ['project', 'coachThreads', 0, 'messages', 0, 'role'],
          },
        ],
      );
      return true;
    },
  );
  assert.deepEqual(store.state, { sessions: [], activeId: null });
  assert.equal(storage.getItem('chalk-sessions-v1'), null);
});

test('project storage reports malformed nested data and propagates the failure', () => {
  const payload = createVersionTwoExport().project;
  payload.pages[0].strokes[0].points = 'not-an-array';
  const serialized = JSON.stringify({ sessions: [payload], activeId: payload.id });
  const storage = new MemoryStorage();
  storage.setItem('chalk-sessions-v1', serialized);
  const diagnostics = [];
  const store = new ProjectStore({
    storage,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  assert.throws(() => store.initialize(), ProjectPayloadValidationError);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'STORAGE_PARSE_FAILED');
  assert.equal(diagnostics[0].boundary, 'project storage');
  assert.equal(diagnostics[0].key, 'chalk-sessions-v1');
  assert.equal(diagnostics[0].error instanceof ProjectPayloadValidationError, true);
  assert.deepEqual(diagnostics[0].error.issues[0], {
    code: 'invalid_type',
    path: ['sessions', 0, 'pages', 0, 'strokes', 0, 'points'],
    message: 'Expected an array.',
  });
  assert.equal(storage.getItem('chalk-sessions-v1'), serialized);
  assert.deepEqual(store.state, { sessions: [], activeId: null });
});

test('project storage reports and propagates read and startup write failures', () => {
  const readError = new Error('project storage unavailable');
  const readDiagnostics = [];
  const readStore = new ProjectStore({
    storage: {
      getItem() {
        throw readError;
      },
    },
    onDiagnostic: (diagnostic) => readDiagnostics.push(diagnostic),
  });

  assert.throws(() => readStore.initialize(), readError);
  assert.deepEqual(readStore.state, { sessions: [], activeId: null });
  assert.equal(readDiagnostics.length, 1);
  assert.equal(readDiagnostics[0].code, 'STORAGE_READ_FAILED');
  assert.equal(readDiagnostics[0].error, readError);

  const writeError = new Error('project storage quota exceeded');
  const writeDiagnostics = [];
  const writeStore = new ProjectStore({
    storage: {
      getItem() {
        return null;
      },
      setItem() {
        throw writeError;
      },
    },
    onDiagnostic: (diagnostic) => writeDiagnostics.push(diagnostic),
  });

  assert.throws(() => writeStore.initialize(), writeError);
  assert.equal(writeStore.state.sessions.length, 1);
  assert.equal(writeDiagnostics.length, 1);
  assert.equal(writeDiagnostics[0].code, 'STORAGE_WRITE_FAILED');
  assert.equal(writeDiagnostics[0].error, writeError);
  assert.equal(writeDiagnostics.length, 1);
});

test('empty project storage initializes normally without diagnostics', () => {
  const storage = new MemoryStorage();
  const diagnostics = [];
  const store = new ProjectStore({
    storage,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  const result = store.initialize();

  assert.equal(result.ok, true);
  assert.equal(result.recovered, false);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(diagnostics, []);
  assert.equal(store.state.sessions.length, 1);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});

test('project imports require a supported envelope version', () => {
  const store = new ProjectStore({ storage: new MemoryStorage() });
  const service = new ProjectImportExportService(store);
  const missingVersion = createVersionTwoExport();
  delete missingVersion.version;
  const futureVersion = createVersionTwoExport();
  futureVersion.version = 99;

  for (const [payload, code] of [
    [missingVersion, 'missing_version'],
    [futureVersion, 'unsupported_version'],
  ]) {
    assert.throws(
      () => service.importProject(payload),
      (error) => {
        assert.equal(error instanceof ProjectPayloadValidationError, true);
        assert.equal(
          error.issues.some((entry) => entry.code === code),
          true,
        );
        assert.equal(
          error.issues.some((entry) => entry.path.join('.') === 'version'),
          true,
        );
        return true;
      },
    );
  }
});

test('version one project exports migrate flattened pages, strokes, cards, and coach messages', () => {
  const storage = new MemoryStorage();
  let nextIdentifier = 100;
  const store = new ProjectStore({
    storage,
    now: () => new Date('2026-05-06T07:08:09.000Z'),
    createIdentifier: () => nextIdentifier++,
  });
  const service = new ProjectImportExportService(store);
  const timestamp = '2025-01-02T03:04:05.000Z';

  const imported = service.importProject({
    kind: 'chalk.project',
    version: 1,
    project: {
      id: 1,
      title: 'Legacy geometry',
      strokes: [{ points: [{ x: 12, y: 34, pressure: 0.5 }] }],
      cards: [{ latex: '3^2', result: '9' }],
      coachMessages: [{ role: 'user', text: 'Explain this' }],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  assert.equal(imported.id, 101);
  assert.equal(imported.title, 'Legacy geometry (imported)');
  assert.equal(imported.pages.length, 1);
  assert.equal(imported.pages[0].id, 100);
  assert.equal(imported.pages[0].title, 'Legacy geometry');
  assert.equal(imported.pages[0].strokes[0].tool, 'pen');
  assert.equal(imported.pages[0].cards[0].expression, '3^2');
  assert.equal(imported.coachMessages[0].text, 'Explain this');
  assert.equal(Object.hasOwn(imported, 'strokes'), false);
  assert.equal(Object.hasOwn(imported, 'cards'), false);
  assert.deepEqual(JSON.parse(storage.getItem('chalk-sessions-v1')), store.state);
});
