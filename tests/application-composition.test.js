import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { createActiveLessonSelection } from '../src/active-lesson-selection.js';
import { composeApplication } from '../src/application-composition.js';
import { createApplicationDomRegistry } from '../src/application-dom-registry.js';
import { composeApplicationLifecycle } from '../src/application-lifecycle-composition.js';
import { composeLessonsApplication } from '../src/lessons-application-composition.js';
import { LessonStore } from '../src/lesson-store.js';
import { ProjectMenuController } from '../src/project-menu-controller.js';
import { readRuntimeModuleDependencies } from './module-dependency-boundaries.js';

class MemoryStorage {
  constructor() {
    this.entries = new Map();
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

function installGlobal(name, value, restorations) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  restorations.push(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

function installBrowserGlobals(dom, restorations) {
  const browserGlobals = {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    location: dom.window.location,
    history: dom.window.history,
    localStorage: dom.window.localStorage,
    confirm: () => true,
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    requestAnimationFrame: (callback) => callback(0),
    innerHeight: dom.window.innerHeight,
    devicePixelRatio: dom.window.devicePixelRatio,
  };
  for (const [name, value] of Object.entries(browserGlobals)) {
    installGlobal(name, value, restorations);
  }
}

function createCanvasContext() {
  return {
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    setTransform() {},
  };
}

function createApplicationLifecycle(projectMenuController) {
  const controller = {
    initialize() {},
    destroy() {},
  };

  return composeApplicationLifecycle({
    paper: {},
    desktopShellController: controller,
    appearanceController: controller,
    projectMenuController,
    calculatorAndCards: controller,
    sketchCanvasController: controller,
    projectsComposition: controller,
    lessonsComposition: {
      initialize() {},
      ensureModalRoot() {},
      renderLessons() {},
      destroy() {},
    },
    projectStore: { initialize() {} },
    loadDrawing() {},
    renderProjects() {},
    showSketchPage() {},
    coachService: { connect: () => Promise.resolve() },
    coach: controller,
    pageInterpretationController: controller,
    navigationComposition: controller,
    previewExport: controller,
    importExportComposition: controller,
    toastController: controller,
    resizeCanvas() {},
    ResizeObserverConstructor: class {
      observe() {}
      disconnect() {}
    },
  });
}

test('application entrypoint depends only on setup and lifecycle composition', async () => {
  const dependencies = await readRuntimeModuleDependencies(
    new URL('../src/application-composition.js', import.meta.url),
  );

  assert.deepEqual(
    dependencies,
    new Set(['./application-lifecycle-composition.js', './application-setup-composition.js']),
  );
});

test('application composition delegates setup without starting the returned lifecycle', () => {
  const applicationDom = createApplicationDomRegistry(new JSDOM().window.document);
  const lifecycleDependencies = { boundary: 'setup result' };
  const calls = [];
  const lifecycle = {
    start() {
      calls.push('start');
    },
    destroy() {
      calls.push('destroy');
    },
  };

  const application = composeApplication(applicationDom, {
    composeSetup(receivedApplicationDom) {
      calls.push('setup');
      assert.equal(receivedApplicationDom, applicationDom);
      return lifecycleDependencies;
    },
    composeLifecycle(receivedDependencies) {
      calls.push('lifecycle');
      assert.equal(receivedDependencies, lifecycleDependencies);
      return lifecycle;
    },
  });

  assert.equal(application, lifecycle);
  assert.deepEqual(calls, ['setup', 'lifecycle']);
});

test('application lifecycle ignores start and destroy calls outside state transitions', () => {
  const calls = new Map();
  const count = (name) => calls.set(name, (calls.get(name) ?? 0) + 1);
  const controller = (name) => ({
    initialize: () => count(`${name}.initialize`),
    destroy: () => count(`${name}.destroy`),
  });
  class ResizeObserver {
    constructor() {
      count('observer.create');
    }
    observe() {
      count('observer.observe');
    }
    disconnect() {
      count('observer.disconnect');
    }
  }

  const lifecycle = composeApplicationLifecycle({
    paper: {},
    desktopShellController: controller('desktop'),
    appearanceController: controller('appearance'),
    calculatorAndCards: controller('calculator'),
    sketchCanvasController: controller('sketch'),
    projectsComposition: controller('projectUi'),
    lessonsComposition: {
      initialize: () => count('lessons.initialize'),
      ensureModalRoot: () => count('lessons.ensureModalRoot'),
      renderLessons: () => count('lessons.render'),
      destroy: () => count('lessons.destroy'),
    },
    projectStore: { initialize: () => count('projects.initialize') },
    loadDrawing: () => count('drawing.load'),
    renderProjects: () => count('projects.render'),
    showSketchPage: () => count('navigation.showSketch'),
    coachService: {
      connect: () => {
        count('coach.connect');
        return Promise.resolve();
      },
    },
    coach: controller('coach'),
    pageInterpretationController: controller('interpretation'),
    navigationComposition: controller('navigation'),
    previewExport: controller('preview'),
    importExportComposition: controller('importExport'),
    toastController: controller('toast'),
    resizeCanvas: () => count('canvas.resize'),
    ResizeObserverConstructor: ResizeObserver,
  });

  lifecycle.destroy();
  lifecycle.start();
  lifecycle.start();
  lifecycle.destroy();
  lifecycle.destroy();

  for (const [name, callCount] of calls) {
    assert.equal(callCount, 1, `${name} should run exactly once`);
  }
});

test('application lifecycle reconstruction leaves one handler on persistent feature elements', (context) => {
  const previousDocument = globalThis.document;
  const dom = new JSDOM(`
    <!doctype html>
    <body>
      <button id="project-menu-button" aria-expanded="false">Project</button>
      <div id="project-menu" role="menu" hidden>
        <button role="menuitem">New project</button>
      </div>
    </body>
  `);
  globalThis.document = dom.window.document;
  let reconstructedApplication = null;
  context.after(() => {
    reconstructedApplication?.destroy();
    if (previousDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
    dom.window.close();
  });

  const button = document.querySelector('#project-menu-button');
  const menu = document.querySelector('#project-menu');
  const constructApplication = () =>
    createApplicationLifecycle(new ProjectMenuController({ button, menu }));

  const firstApplication = constructApplication();
  firstApplication.start();
  firstApplication.destroy();

  reconstructedApplication = constructApplication();
  reconstructedApplication.start();
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  assert.equal(menu.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('lesson application keeps generation, navigation, and persistence behind module boundaries', async () => {
  const dependencies = await readRuntimeModuleDependencies(
    new URL('../src/lessons-application-composition.js', import.meta.url),
  );

  assert.equal(dependencies.has('./lesson-generation-composition.js'), true);
  assert.equal(dependencies.has('./lessons-composition.js'), true);
  assert.equal(dependencies.has('./lesson-ai.js'), false);
  assert.equal(dependencies.has('./lesson-payload-contract.js'), false);
  assert.equal(dependencies.has('./storage.js'), false);
  assert.equal(dependencies.has('./grist-process-adapter.js'), false);
});

test('lesson application composes Grist generation, navigation, and teardown behavior', async (context) => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <main id="app">
        <nav>
          <button data-page="sketch" class="active"></button>
          <button data-page="lessons"></button>
        </nav>
        <div class="workspace">
          <section id="sketch-view" class="active"></section>
          <section id="lessons-view">
            <section id="lesson-detail"><div id="lesson-detail-content"></div></section>
          </section>
        </div>
        <aside id="coach-panel"></aside>
      </main>
      <section id="lesson-modal">
        <button id="close-lesson-modal"></button>
        <div id="lesson-modal-error"></div>
        <form id="lesson-form">
          <textarea id="lesson-goal">Learn fractions</textarea>
          <select id="lesson-level"><option selected>Beginner</option></select>
        </form>
        <div id="lesson-generating"></div>
      </section>
      <button id="create-lesson"></button>
      <button id="add-lesson"></button>
      <button id="empty-create"></button>
      <span id="lesson-count"></span>
      <span id="completed-count"></span>
      <span id="progress-number"></span>
      <span id="progress-fill"></span>
      <div class="progress-days"><span></span><span></span></div>
      <div id="lesson-empty"></div>
      <div class="lesson-section-head"></div>
      <div id="topic-list"></div>
      <div id="lesson-grid"></div>
      <input id="page-title">
      <textarea id="coach-prompt"></textarea>
    </body>`,
    { url: 'http://localhost/' },
  );
  const restorations = [];
  installBrowserGlobals(dom, restorations);
  const canvasContext = createCanvasContext();
  const originalGetContext = dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.getContext = () => canvasContext;
  const resizeObservers = [];
  class ResizeObserver {
    observe(target) {
      this.target = target;
      resizeObservers.push(this);
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  installGlobal('ResizeObserver', ResizeObserver, restorations);
  context.after(() => {
    dom.window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    for (const restore of restorations.reverse()) restore();
    dom.window.close();
  });

  const storage = new MemoryStorage();
  let resolvePersistedLesson;
  const persistedLesson = new Promise((resolve) => {
    resolvePersistedLesson = resolve;
  });
  class ObservedLessonStore extends LessonStore {
    prepend(lesson) {
      const storedLesson = super.prepend(lesson);
      resolvePersistedLesson(storedLesson);
      return storedLesson;
    }
  }
  const lessonStore = new ObservedLessonStore(storage);
  const activeLessonSelection = createActiveLessonSelection({ lessonStore });
  const modelParserCalls = [];
  const coachCalls = [];
  const application = dom.window.document.querySelector('#app');
  const workspace = dom.window.document.querySelector('.workspace');
  const sketchView = dom.window.document.querySelector('#sketch-view');
  const lessonsView = dom.window.document.querySelector('#lessons-view');
  const detail = dom.window.document.querySelector('#lesson-detail');
  const detailContent = dom.window.document.querySelector('#lesson-detail-content');
  const form = dom.window.document.querySelector('#lesson-form');
  const composition = composeLessonsApplication({
    application: { root: application },
    lessons: {
      view: lessonsView,
      modal: dom.window.document.querySelector('#lesson-modal'),
      detail,
      detailContent,
      form,
      goal: dom.window.document.querySelector('#lesson-goal'),
      level: dom.window.document.querySelector('#lesson-level'),
      generating: dom.window.document.querySelector('#lesson-generating'),
    },
    desktopBridge: {
      async parseModelJson(raw) {
        modelParserCalls.push(raw);
        return {
          title: 'Fractions',
          topic: 'Arithmetic',
          summary: 'Parts of a whole',
          explanation: 'A fraction represents equal parts.',
          example: 'One half is 1/2.',
          practice: 'Shade one half.',
          hint: 'Split the shape equally.',
        };
      },
    },
    lessonStore,
    activeLessonSelection,
    coachService: {
      isActive: false,
      async run(prompt, image) {
        coachCalls.push({ prompt, image });
        return 'not JSON: Grist must parse this model output';
      },
    },
    renderLatex() {},
    coach: { open() {} },
    drawingCommands: { saveDrawing() {} },
    showToast(message) {
      assert.fail(message);
    },
    sketchCanvasController: { resize() {} },
    lessonDetailElements: {
      workspace,
      pageButtons: [...dom.window.document.querySelectorAll('[data-page]')],
      sketchView,
      pageTitle: dom.window.document.querySelector('#page-title'),
      lessonsView,
      detail,
      content: detailContent,
      coachPrompt: dom.window.document.querySelector('#coach-prompt'),
    },
  });

  composition.initialize();
  composition.initialize();
  dom.window.document.querySelector('#create-lesson').click();
  assert.equal(dom.window.document.querySelector('#lesson-modal').parentElement, application);
  assert.equal(dom.window.document.querySelector('#lesson-modal').classList.contains('open'), true);
  composition.hideLessonModal();

  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  const generatedLesson = await persistedLesson;

  assert.equal(coachCalls.length, 1);
  assert.equal(coachCalls[0].image, null);
  assert.deepEqual(modelParserCalls, ['not JSON: Grist must parse this model output']);
  assert.equal(generatedLesson.title, 'Fractions');
  assert.equal(new LessonStore(storage).find(generatedLesson.id)?.title, 'Fractions');
  assert.equal(composition.getActiveLesson()?.id, generatedLesson.id);
  assert.equal(detail.classList.contains('open'), true);
  assert.equal(workspace.classList.contains('lesson-integrated'), true);
  assert.equal(resizeObservers.length, 1);

  composition.clearActiveLesson();
  assert.equal(composition.getActiveLesson(), null);
  composition.destroy();
  composition.destroy();
  assert.equal(resizeObservers[0].disconnected, true);

  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  assert.equal(coachCalls.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 110));
});
