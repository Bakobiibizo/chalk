import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CodexCoachService } from '../src/codex-coach-service.js';
import { composeApplicationLifecycle } from '../src/application-lifecycle-composition.js';
import { createApplicationSessionAdapters } from '../src/application-session-adapters.js';
import { ProjectImportExportService } from '../src/project-import-export.js';
import { ProjectStore } from '../src/project-store.js';
import { composePreviewExport } from '../src/preview-export-composition.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }
  getItem(key) {
    return this.entries.get(key) ?? null;
  }
  setItem(key, value) {
    this.entries.set(key, String(value));
  }
  removeItem(key) {
    this.entries.delete(key);
  }
}

class FakeCodexClient extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.threadId = 'thread-original';
    this.sent = [];
  }
  connect() {
    return Promise.resolve();
  }
  useThread(threadId) {
    this.threadId = threadId;
  }
  async send(prompt, imageUrl) {
    this.sent.push({ prompt, imageUrl });
    this.threadId = 'thread-current';
  }
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

test('application lifecycle composition owns ordered startup, observation, and teardown', () => {
  const events = [];
  const paper = {};
  const controller = (name) => ({
    initialize: () => events.push(`${name}.initialize`),
    destroy: () => events.push(`${name}.destroy`),
  });
  class FakeResizeObserver {
    constructor(callback) {
      events.push('observer.create');
      this.callback = callback;
    }
    observe(target) {
      assert.equal(target, paper);
      events.push('observer.observe');
    }
    disconnect() {
      events.push('observer.disconnect');
    }
  }

  const desktopShellController = controller('desktop');
  const appearanceController = controller('appearance');
  const sketchCanvasController = controller('sketch');
  const lessonsComposition = {
    initialize: () => events.push('lessons.initialize'),
    ensureModalRoot: () => events.push('lessons.ensureModalRoot'),
    renderLessons: () => events.push('lessons.render'),
    destroy: () => events.push('lessons.destroy'),
  };
  const lifecycle = composeApplicationLifecycle({
    paper,
    desktopShellController,
    appearanceController,
    calculatorAndCards: controller('calculator'),
    sketchCanvasController,
    projectsComposition: controller('projectUi'),
    lessonsComposition,
    projectStore: { initialize: () => events.push('projectStore.initialize') },
    loadDrawing: () => events.push('drawing.load'),
    renderProjects: () => events.push('projects.render'),
    showSketchPage: () => events.push('navigation.showSketch'),
    coachService: {
      connect: () => {
        events.push('coach.connect');
        return Promise.resolve();
      },
    },
    coach: controller('coach'),
    pageInterpretationController: controller('interpretation'),
    navigationComposition: controller('navigation'),
    previewExport: controller('preview'),
    importExportComposition: controller('importExport'),
    toastController: controller('toast'),
    resizeCanvas: () => events.push('canvas.resize'),
    ResizeObserverConstructor: FakeResizeObserver,
  });

  lifecycle.start();
  lifecycle.start();
  lifecycle.destroy();
  lifecycle.destroy();

  assert.deepEqual(events, [
    'desktop.initialize',
    'appearance.initialize',
    'projectStore.initialize',
    'calculator.initialize',
    'sketch.initialize',
    'preview.initialize',
    'coach.initialize',
    'interpretation.initialize',
    'lessons.initialize',
    'navigation.initialize',
    'projectUi.initialize',
    'importExport.initialize',
    'lessons.ensureModalRoot',
    'drawing.load',
    'projects.render',
    'lessons.render',
    'navigation.showSketch',
    'observer.create',
    'observer.observe',
    'observer.disconnect',
    'importExport.destroy',
    'projectUi.destroy',
    'navigation.destroy',
    'lessons.destroy',
    'interpretation.destroy',
    'coach.destroy',
    'preview.destroy',
    'sketch.destroy',
    'calculator.destroy',
    'appearance.destroy',
    'desktop.destroy',
    'toast.destroy',
  ]);
});

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

test('project persistence migrates legacy data and reloads the current schema', () => {
  const storage = new MemoryStorage({
    'chalk-title': 'Legacy algebra',
    'chalk-strokes': JSON.stringify([{ tool: 'pen', points: [{ x: 1, y: 2, pressure: 0.5 }] }]),
    'chalk-cards': JSON.stringify([{ latex: '2+2', result: '4' }]),
  });
  const migrated = new ProjectStore({ storage });
  migrated.initialize();
  assert.equal(migrated.activeSession().title, 'Legacy algebra');
  assert.equal(migrated.activePage().strokes.length, 1);
  assert.equal(migrated.activePage().cards.length, 1);

  const reloaded = new ProjectStore({ storage });
  reloaded.initialize();
  assert.equal(reloaded.activeSession().id, migrated.activeSession().id);
  assert.equal(reloaded.activePage().strokes[0].tool, 'pen');
});

test('application session adapters bridge the project store and coach threads', () => {
  const storage = new MemoryStorage();
  const store = new ProjectStore({ storage });
  const adapters = createApplicationSessionAdapters({
    projectStore: store,
    normalizeCoachThreads: (session) => {
      if (!session.coachThreads?.length) {
        session.coachThreads = [{ id: 7, codexThreadId: 'thread-7', messages: [] }];
      }
      session.activeCoachThreadId ||= 7;
      return session.coachThreads[0];
    },
  });
  store.initialize();

  const project = store.activeSession();
  assert.equal(adapters.activeSession(), project);
  assert.equal(adapters.activePage(), project.pages[0]);
  assert.equal(adapters.ensureCoachThreads(project).codexThreadId, 'thread-7');
  assert.equal(adapters.activeCoachThread().id, 7);
  adapters.persistSession();
  assert.equal(JSON.parse(storage.getItem('chalk-sessions-v1')).activeId, project.id);
});

test('coach request lifecycle streams deltas, persists the thread, and rejects overlap', async () => {
  const fakeClient = new FakeCodexClient('unused');
  const session = { codexThreadId: null };
  const thread = { codexThreadId: null, updatedAt: null };
  let persistenceCount = 0;
  let timestampCalls = 0;
  const statusElement = { classList: { toggle() {} }, title: '' };
  const service = new CodexCoachService({
    location: { protocol: 'http:', host: 'localhost' },
    statusElement,
    activeSession: () => session,
    activeThread: () => thread,
    persistSession: () => {
      persistenceCount += 1;
    },
    createClient: () => fakeClient,
    createTimestamp: () => {
      timestampCalls += 1;
      return '2026-07-25T14:00:00.000Z';
    },
  });
  const deltas = [];
  const resultPromise = service.run('Explain this', 'data:image/png;base64,AA==', (text) =>
    deltas.push(text),
  );
  await assert.rejects(() => service.run('overlap'), /already working/);
  await new Promise((resolve) => setImmediate(resolve));
  fakeClient.emit('delta', { text: 'First' });
  fakeClient.emit('delta', { text: ' step' });
  fakeClient.emit('complete');
  assert.equal(await resultPromise, 'First step');
  assert.deepEqual(deltas, ['First', 'First step']);
  assert.equal(session.codexThreadId, 'thread-current');
  assert.equal(thread.codexThreadId, 'thread-current');
  assert.equal(thread.updatedAt, '2026-07-25T14:00:00.000Z');
  assert.equal(timestampCalls, 1);
  assert.equal(persistenceCount, 1);
  assert.equal(service.isActive, false);
});

test('project import/export preserves pages and emits the versioned export envelope', async () => {
  const storage = new MemoryStorage();
  const store = new ProjectStore({ storage });
  store.initialize();
  store.activeSession().title = 'Linear Algebra';
  store.activePage().strokes.push({ tool: 'pen', points: [] });
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
    const service = new ProjectImportExportService(store, {
      now: () => new Date('2026-01-02T03:04:05Z'),
    });
    assert.equal(service.exportProject(), true);
    assert.equal(downloads[0].filename, 'linear-algebra.chalk-project.json');
    const response = await fetch(downloads[0].href);
    const envelope = await response.json();
    assert.equal(envelope.kind, 'chalk.project');
    assert.equal(envelope.version, 2);
    assert.equal(envelope.project.pages[0].strokes.length, 1);
    const imported = service.importProject(envelope);
    assert.equal(imported.title, 'Linear Algebra (imported)');
    assert.equal(store.activeSession().id, imported.id);
    assert.equal(imported.pages[0].strokes.length, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('PNG export composition owns image creation and simple sketch events', () => {
  const canvas = { getBoundingClientRect: () => ({ width: 320, height: 180 }) };
  const exportButton = new EventTarget();
  const pageTitle = Object.assign(new EventTarget(), { value: 'Quadratic Notes' });
  const downloads = [];
  const toasts = [];
  let saved = 0;
  const composition = composePreviewExport({
    sketch: { canvas, exportButton, pageTitle },
    mathCardsController: {
      getCards: () => [{ expression: 'x²', result: '4' }],
    },
    projectStore: {
      activePage: () => ({ title: 'Page 2' }),
    },
    drawingCommands: {
      saveDrawing: () => {
        saved += 1;
      },
    },
    showToast: (message) => toasts.push(message),
    createImageDataUrl: (_canvas, options) => `image-${options.scale}`,
    downloadPng: (_canvas, filename, options) => downloads.push({ filename, options }),
  });

  assert.equal(composition.createPageImageDataURL(), 'image-2');
  composition.initialize();
  composition.initialize();

  exportButton.dispatchEvent(new Event('click'));
  pageTitle.dispatchEvent(new Event('change'));
  assert.equal(downloads[0].filename, 'quadratic-notes-page-2.png');
  assert.deepEqual(
    {
      scale: downloads[0].options.scale,
      width: downloads[0].options.width,
      height: downloads[0].options.height,
    },
    { scale: 2, width: 320, height: 180 },
  );
  assert.deepEqual(toasts, ['Page exported as PNG']);
  assert.equal(saved, 1);

  composition.destroy();
  composition.destroy();
  exportButton.dispatchEvent(new Event('click'));
  pageTitle.dispatchEvent(new Event('change'));
  assert.equal(downloads.length, 1);
  assert.deepEqual(toasts, ['Page exported as PNG']);
  assert.equal(saved, 1);
});

test('build and package workflows retain the required application entry points', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(packageJson.scripts.build, 'vite build');
  assert.match(packageJson.scripts['desktop:dir'], /electron-builder --dir/);
  assert.match(packageJson.scripts['desktop:pack'], /electron-builder/);
  assert.equal(packageJson.main, 'electron/main.js');
  assert.deepEqual(packageJson.build.files, [
    'dist/**/*',
    'electron/**/*',
    'src/codex-stdio-session-adapter.js',
    'src/codex-transport-configuration.js',
    'src/grist-process-adapter.js',
    'package.json',
  ]);
});
