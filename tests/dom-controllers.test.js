import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { composeCalculatorAndCards } from '../src/calculator-cards-composition.js';
import { CalculatorPanelController } from '../src/calculator-panel-controller.js';
import { CodexCoachService } from '../src/codex-coach-service.js';
import { createApplicationDomRegistry } from '../src/application-dom-registry.js';
import { resolveLessonDetailTransientElements } from '../src/lesson-detail-dom.js';
import { LessonDetailUI } from '../src/lesson-detail-ui.js';
import { LessonLayoutController } from '../src/lesson-layout-controller.js';
import { LessonLibraryUI } from '../src/lesson-library-ui.js';
import { MathCardsController } from '../src/math-cards-controller.js';
import { PageInterpretationController } from '../src/page-interpretation-controller.js';
import { PageTabsUI } from '../src/page-tabs-ui.js';
import { ProjectsPanelUI } from '../src/projects-panel-ui.js';
import { ProjectMenuController } from '../src/project-menu-controller.js';
import { SHORTCUT_COMMANDS, ShortcutsController } from '../src/shortcuts-controller.js';
import { SketchCanvasController } from '../src/sketch-canvas-controller.js';
import { readRuntimeModuleDependencies } from './module-dependency-boundaries.js';

function installDom(body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.confirm = () => true;
  globalThis.prompt = () => null;
  globalThis.requestAnimationFrame = (callback) => callback();
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  return dom;
}

function click(selector) {
  const element = document.querySelector(selector);
  assert.ok(element, `expected ${selector} to exist`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return element;
}

function pointerEvent(type, { pointerId = 1, clientX = 0, button = 0 } = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

test('application DOM registry resolves persistent bootstrap elements into named groups', () => {
  installDom(`
    <main id="app"><nav><button data-page="sketch"></button></nav>
      <div class="workspace"><section id="sketch-view"><canvas id="canvas"></canvas><div id="paper"></div></section>
      <section id="lessons-view"><section id="lesson-detail"><div id="lesson-detail-content"></div></section></section></div>
      <textarea id="coach-prompt"></textarea><div id="toast"></div>
    </main>
    <form id="lesson-form"><input id="lesson-goal"><select id="lesson-level"></select></form>
  `);

  const registry = createApplicationDomRegistry(document);

  assert.equal(registry.application.root, document.querySelector('#app'));
  assert.equal(registry.application.toast, document.querySelector('#toast'));
  assert.equal(registry.application.workspace, document.querySelector('.workspace'));
  assert.deepEqual(registry.application.pageButtons, [
    document.querySelector('[data-page="sketch"]'),
  ]);
  assert.equal(registry.sketch.view, document.querySelector('#sketch-view'));
  assert.equal(registry.sketch.canvas, document.querySelector('#canvas'));
  assert.equal(registry.sketch.paper, document.querySelector('#paper'));
  assert.equal(registry.lessons.view, document.querySelector('#lessons-view'));
  assert.equal(registry.lessons.detail, document.querySelector('#lesson-detail'));
  assert.equal(registry.lessons.detailContent, document.querySelector('#lesson-detail-content'));
  assert.equal(registry.lessons.form, document.querySelector('#lesson-form'));
  assert.equal(registry.lessons.goal, document.querySelector('#lesson-goal'));
  assert.equal(registry.lessons.level, document.querySelector('#lesson-level'));
  assert.equal(registry.coach.prompt, document.querySelector('#coach-prompt'));
});

test('project menu exposes actions and closes after selection, outside click, or Escape', () => {
  installDom(`
    <button id="project-button" aria-expanded="false"></button>
    <div id="project-menu" role="menu" hidden><button role="menuitem">New</button></div>
    <button id="outside"></button>
  `);
  const button = document.querySelector('#project-button');
  const menu = document.querySelector('#project-menu');
  const controller = new ProjectMenuController({ button, menu });
  controller.initialize();

  click('#project-button');
  assert.equal(menu.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  click('[role="menuitem"]');
  assert.equal(menu.hidden, true);

  click('#project-button');
  click('#outside');
  assert.equal(menu.hidden, true);

  click('#project-button');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, button);

  controller.destroy();
});

test('project and page controllers delegate transitions to store commands', () => {
  installDom(`
    <button id="projects-open"></button><button id="projects-close"></button>
    <button id="projects-new"></button><aside id="projects-panel"></aside>
    <div id="projects-scrim"></div><div id="projects-list"></div><nav id="page-tabs"></nav>
  `);
  const sessions = [
    {
      id: 1,
      title: 'First',
      updatedAt: '2026-01-01T00:00:00Z',
      activePageId: 11,
      pages: [
        { id: 11, title: 'Page 1', updatedAt: '2026-01-01T00:00:00Z', strokes: [], cards: [] },
        { id: 12, title: 'Page 2', updatedAt: '2026-01-01T00:00:00Z', strokes: [], cards: [] },
      ],
    },
    {
      id: 2,
      title: 'Second',
      updatedAt: '2026-01-02T00:00:00Z',
      activePageId: 21,
      pages: [
        { id: 21, title: 'Page 1', updatedAt: '2026-01-02T00:00:00Z', strokes: [], cards: [] },
      ],
    },
  ];
  let persisted = 0;
  let projectChanges = 0;
  let pageChanges = 0;
  let beforeProjectChanges = 0;
  let beforePageChanges = 0;
  let pageProjectChanges = 0;
  const projectCommands = [];
  const pageCommands = [];
  const pageToasts = [];
  const projectStore = {
    state: { sessions, activeId: 1 },
    activeSession() {
      return this.state.sessions.find((session) => session.id === this.state.activeId);
    },
    createProject() {
      projectCommands.push(['createProject']);
      const project = {
        id: 3,
        title: 'Untitled project',
        updatedAt: '2026-01-03T00:00:00Z',
        activePageId: 31,
        pages: [
          {
            id: 31,
            title: 'Page 1',
            updatedAt: '2026-01-03T00:00:00Z',
            strokes: [],
            cards: [],
          },
        ],
      };
      this.state.sessions.unshift(project);
      this.state.activeId = project.id;
      this.persist();
      return project;
    },
    activateProject(id) {
      projectCommands.push(['activateProject', id]);
      if (id === this.state.activeId) return false;
      if (!this.state.sessions.some((session) => session.id === id)) return false;
      this.state.activeId = id;
      this.persist();
      return true;
    },
    deleteProject(id) {
      projectCommands.push(['deleteProject', id]);
      if (this.state.sessions.length <= 1) return null;
      const project = this.state.sessions.find((session) => session.id === id);
      if (!project) return null;
      const previousActiveId = this.state.activeId;
      this.state.sessions = this.state.sessions.filter((session) => session.id !== id);
      if (!this.state.sessions.some((session) => session.id === this.state.activeId)) {
        this.state.activeId = this.state.sessions[0].id;
      }
      this.persist();
      return {
        project,
        activeProjectChanged: previousActiveId !== this.state.activeId,
      };
    },
    addPage() {
      pageCommands.push(['addPage']);
      const project = this.activeSession();
      const page = {
        id: 10 + (project.pages.length + 1) + project.pages.length,
        title: `Page ${project.pages.length + 1}`,
        updatedAt: new Date().toISOString(),
        strokes: [],
        cards: [],
      };
      project.pages.push(page);
      project.activePageId = page.id;
      project.updatedAt = page.updatedAt;
      this.persist();
      return page;
    },
    activatePage(id) {
      pageCommands.push(['activatePage', id]);
      const project = this.activeSession();
      if (id === project.activePageId || !project.pages.some((page) => page.id === id)) {
        return false;
      }
      project.activePageId = id;
      this.persist();
      return true;
    },
    renamePage(id, title) {
      pageCommands.push(['renamePage', id, title]);
      const normalizedTitle = typeof title === 'string' ? title.trim() : '';
      const project = this.activeSession();
      const page = project.pages.find((item) => item.id === id);
      if (!page || !normalizedTitle) return null;
      page.title = normalizedTitle;
      page.updatedAt = new Date().toISOString();
      project.updatedAt = page.updatedAt;
      this.persist();
      return page;
    },
    deletePage(id) {
      pageCommands.push(['deletePage', id]);
      const project = this.activeSession();
      if (project.pages.length <= 1) return null;
      const pageIndex = project.pages.findIndex((page) => page.id === id);
      if (pageIndex === -1) return null;
      const page = project.pages[pageIndex];
      const previousActivePageId = project.activePageId;
      project.pages.splice(pageIndex, 1);
      if (previousActivePageId === id) {
        project.activePageId = project.pages[Math.max(0, pageIndex - 1)].id;
      }
      project.updatedAt = new Date().toISOString();
      this.persist();
      return {
        page,
        activePageChanged: previousActivePageId !== project.activePageId,
      };
    },
    persist() {
      persisted += 1;
    },
  };
  const panel = new ProjectsPanelUI({
    projectStore,
    openButton: document.querySelector('#projects-open'),
    closeButton: document.querySelector('#projects-close'),
    newButton: document.querySelector('#projects-new'),
    panel: document.querySelector('#projects-panel'),
    scrim: document.querySelector('#projects-scrim'),
    list: document.querySelector('#projects-list'),
    isBlocked: () => false,
    showToast() {},
    beforeChange() {
      beforeProjectChanges += 1;
    },
    onProjectChanged: () => {
      projectChanges += 1;
    },
  });
  click('#projects-open');
  assert.equal(document.querySelector('#projects-panel').classList.contains('open'), false);
  panel.initialize();
  panel.initialize();
  click('#projects-open');
  assert.ok(document.querySelector('#projects-panel').classList.contains('open'));
  click('[data-session="2"]');
  assert.equal(projectStore.state.activeId, 2);
  assert.equal(projectChanges, 1);
  click('#projects-new');
  assert.equal(projectStore.state.activeId, 3);
  click('#projects-open');
  click('[data-session="3"] .session-delete');
  assert.equal(projectStore.state.activeId, 1);
  assert.equal(panel.panel.classList.contains('open'), true);
  click('#projects-close');
  assert.deepEqual(projectCommands, [
    ['activateProject', 2],
    ['createProject'],
    ['deleteProject', 3],
  ]);
  assert.equal(beforeProjectChanges, 2);
  assert.equal(projectChanges, 3);

  const tabs = new PageTabsUI({
    projectStore,
    tabs: document.querySelector('#page-tabs'),
    isBlocked: () => false,
    showToast: (message) => pageToasts.push(message),
    beforeChange: () => {
      beforePageChanges += 1;
    },
    onPageChanged: () => {
      pageChanges += 1;
    },
    onProjectsChanged: () => {
      pageProjectChanges += 1;
    },
  });
  tabs.render();
  click('[data-project-page="12"]');
  assert.equal(projectStore.activeSession().activePageId, 12);
  globalThis.prompt = () => '  Worked example  ';
  document
    .querySelector('[data-project-page="12"]')
    .dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(projectStore.activeSession().pages[1].title, 'Worked example');
  click('[data-add-project-page]');
  assert.equal(projectStore.activeSession().pages.length, 3);
  tabs.render();
  const deleteConfirmations = [];
  globalThis.confirm = (message) => {
    deleteConfirmations.push(message);
    return true;
  };
  click('[data-project-page="11"] .page-tab-close');
  assert.deepEqual(
    projectStore.activeSession().pages.map((page) => page.id),
    [12, 15],
  );
  assert.deepEqual(pageCommands, [
    ['activatePage', 12],
    ['renamePage', 12, '  Worked example  '],
    ['addPage'],
    ['deletePage', 11],
  ]);
  assert.equal(beforePageChanges, 2);
  assert.equal(pageChanges, 3);
  assert.equal(pageProjectChanges, 2);
  assert.deepEqual(pageToasts, ['Page 3 added · chat kept with project']);
  assert.deepEqual(deleteConfirmations, ['Delete “Page 1”? This cannot be undone.']);
  assert.equal(persisted, 7);
  assert.equal(panel.panel.classList.contains('open'), false);
  panel.destroy();
  panel.destroy();
  click('#projects-open');
  assert.equal(panel.panel.classList.contains('open'), false);
});

test('lesson library cards open lessons and delete controls do not also open them', () => {
  installDom(`
    <span id="lesson-count"></span><span id="completed-count"></span><span id="progress-number"></span>
    <i id="progress-fill"></i><div class="progress-days"><span></span><span></span></div>
    <div id="lesson-empty"></div><header class="lesson-section-head"></header>
    <div id="topic-list"></div><div id="lesson-grid"></div>
  `);
  const opened = [];
  const deleted = [];
  const store = {
    lessons: [
      {
        id: 7,
        topic: 'Algebra',
        title: 'Variables',
        summary: 'Solve for x',
        minutes: 8,
        level: 'Beginner',
        completed: true,
      },
    ],
  };
  const library = new LessonLibraryUI({
    store,
    ensureModalRoot() {},
    openLesson: (id) => opened.push(id),
    deleteLesson: (id) => deleted.push(id),
  });
  library.render();
  assert.equal(document.querySelector('#progress-number').textContent, '1 of 1 lessons');
  click('.lesson-card');
  click('.delete-lesson');
  assert.deepEqual(opened, [7]);
  assert.deepEqual(deleted, [7]);
});

test('lesson detail integrates beside the sketch and routes complete, minimize, and coach actions', () => {
  installDom(`
    <div class="workspace"><main id="sketch-view"></main><section id="lessons-view">
    <section id="lesson-detail"><div id="lesson-detail-content"></div></section></section></div>
    <button data-page="sketch"></button><button data-page="lessons"></button>
    <input id="page-title"><textarea id="coach-prompt"></textarea>
  `);
  const lesson = {
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
    practiceStrokes: [],
  };
  let saves = 0;
  let coachOpens = 0;
  let activeLesson = null;
  let practiceSetups = 0;
  let practiceElements = null;
  const persistentElements = {
    workspace: document.querySelector('.workspace'),
    sketchView: document.querySelector('#sketch-view'),
    lessonsView: document.querySelector('#lessons-view'),
    detail: document.querySelector('#lesson-detail'),
    content: document.querySelector('#lesson-detail-content'),
    pageButtons: [...document.querySelectorAll('[data-page]')],
    pageTitle: document.querySelector('#page-title'),
    coachPrompt: document.querySelector('#coach-prompt'),
  };
  const detail = new LessonDetailUI({
    persistentElements,
    resolveTransientElements: resolveLessonDetailTransientElements,
    findLesson: (id) => (id === lesson.id ? lesson : null),
    toggleLessonCompleted: (id) => {
      assert.equal(id, lesson.id);
      lesson.completed = !lesson.completed;
      saves += 1;
      return lesson;
    },
    generateNextLesson: () => ({ status: 'complete', node: null }),
    renderLatex() {},
    setupPractice(receivedLesson, elements) {
      assert.equal(receivedLesson, lesson);
      practiceSetups += 1;
      practiceElements = elements;
    },
    destroyPractice() {},
    renderLessons() {},
    renderLessonPicker() {},
    openCoach: () => {
      coachOpens += 1;
    },
    saveDrawing: () => {
      saves += 1;
    },
    showToast() {},
    setActiveLesson: (id) => {
      activeLesson = id;
    },
  });
  detail.open(4);
  assert.equal(activeLesson, 4);
  assert.equal(practiceSetups, 1);
  assert.equal(practiceElements.canvas, persistentElements.content.querySelector('canvas'));
  assert.equal(practiceElements.toolButtons.length, 3);
  assert.ok(document.querySelector('#lesson-detail').classList.contains('open'));
  assert.ok(document.querySelector('.workspace').classList.contains('lesson-integrated'));
  assert.ok(document.querySelector('#lessons-view').classList.contains('integrated-lesson-panel'));
  click('[data-complete]');
  assert.equal(lesson.completed, true);
  assert.equal(practiceSetups, 2);
  click('[data-ask-lesson]');
  assert.equal(coachOpens, 1);
  assert.match(document.querySelector('#coach-prompt').value, /Angles/);
  click('[data-practice]');
  assert.equal(activeLesson, null);
  assert.equal(document.querySelector('#lesson-detail').classList.contains('open'), false);
  assert.equal(document.querySelector('.workspace').classList.contains('lesson-integrated'), false);
  assert.equal(saves, 2);
});

test('lesson detail transient DOM is resolved from newly rendered content only', () => {
  installDom(`
    <button data-complete="outside"></button>
    <div id="lesson-content">
      <canvas class="lesson-practice-canvas"></canvas>
      <div class="lesson-practice-paper"></div><div class="lesson-practice-empty"></div>
      <div class="lesson-selection-box"></div><button data-practice-undo></button>
      <button data-practice-clear></button><button data-practice-tool="pen"></button>
      <span class="practice-input-status"></span><button data-complete="inside"></button>
      <button data-practice></button><button data-ask-lesson></button>
      <button data-next-graph-node></button>
    </div>
  `);
  const content = document.querySelector('#lesson-content');

  const elements = resolveLessonDetailTransientElements(content);

  assert.equal(elements.completeButton.dataset.complete, 'inside');
  assert.ok(content.contains(elements.practice.canvas));
  assert.equal(elements.practice.toolButtons.length, 1);
});

test('lesson detail controller depends on rendering, not DOM lookup or model modules', async () => {
  const dependencies = await readRuntimeModuleDependencies(
    new URL('../src/lesson-detail-ui.js', import.meta.url),
  );

  assert.deepEqual(dependencies, new Set(['./lesson-detail-template.js']));
});

test('lesson layout drags, resizes, and restores all three integrated panes', () => {
  installDom(`
    <div class="workspace lesson-integrated">
      <main id="sketch-view">
        <nav class="toolbar"></nav>
        <aside id="coach-panel"></aside>
      </main>
      <section id="lessons-view" class="integrated-lesson-panel"></section>
    </div>
  `);
  const workspace = document.querySelector('.workspace');
  workspace.getBoundingClientRect = () => ({ left: 0, width: 1000 });
  const coachPane = document.querySelector('#coach-panel');
  const toolbar = document.querySelector('.toolbar');
  coachPane.getBoundingClientRect = () => ({ top: 132, height: 420 });
  let resizeCalls = 0;
  const controller = new LessonLayoutController({
    workspace,
    sketchPane: document.querySelector('#sketch-view'),
    lessonPane: document.querySelector('#lessons-view'),
    coachPane,
    toolbar,
    onResize: () => {
      resizeCalls += 1;
    },
  });

  controller.activate();
  const tabs = [...document.querySelectorAll('.lesson-layout-tab')];
  const dividers = [...document.querySelectorAll('.lesson-layout-divider')];
  assert.deepEqual(
    tabs.map((tab) => [tab.dataset.pane, tab.textContent]),
    [
      ['sketch', ''],
      ['lesson', ''],
      ['coach', ''],
    ],
  );
  assert.equal(dividers.length, 2);
  assert.equal(coachPane.parentElement, workspace);
  assert.equal(toolbar.parentElement, workspace);
  assert.ok(toolbar.classList.contains('integrated-toolbar'));
  assert.equal(toolbar.style.order, '0');
  assert.equal(coachPane.style.getPropertyValue('--coach-pinned-top'), '');
  assert.equal(coachPane.style.order, '1');
  assert.equal(document.querySelector('[data-pane="coach"]').tabIndex, -1);

  const lessonTab = document.querySelector('[data-pane="lesson"]');
  lessonTab.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 500 }));
  window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 40 }));
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 40 }));
  assert.equal(coachPane.style.order, '1');
  assert.equal(document.querySelector('#lessons-view').style.order, '3');
  assert.equal(document.querySelector('#sketch-view').style.order, '5');

  dividers[0].dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
  );
  assert.equal(workspace.style.getPropertyValue('--lesson-layout-pane-1'), '26fr');

  dividers[1].dispatchEvent(pointerEvent('pointerdown', { pointerId: 8, clientX: 760 }));
  window.dispatchEvent(pointerEvent('pointermove', { pointerId: 8, clientX: 800 }));
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 8, clientX: 800 }));
  const persisted = JSON.parse(localStorage.getItem('chalk-lesson-layout'));
  assert.deepEqual(persisted.paneOrder, ['coach', 'lesson', 'sketch']);
  assert.equal(Math.round(persisted.paneSizes.lesson), 54);
  assert.equal(Math.round(persisted.paneSizes.sketch), 20);
  assert.equal(Math.round(persisted.paneSizes.coach), 26);
  assert.equal('coachTopPx' in persisted, false);
  assert.ok(resizeCalls >= 3);

  controller.destroy();
  assert.equal(document.querySelectorAll('.lesson-layout-divider').length, 0);
  assert.equal(document.querySelectorAll('.lesson-layout-tab').length, 0);
  assert.equal(toolbar.parentElement, document.querySelector('#sketch-view'));
  assert.equal(document.querySelector('#sketch-view').firstElementChild, toolbar);
  assert.equal(toolbar.classList.contains('integrated-toolbar'), false);
  const restored = new LessonLayoutController({
    workspace,
    sketchPane: document.querySelector('#sketch-view'),
    lessonPane: document.querySelector('#lessons-view'),
    coachPane,
    toolbar,
  });
  restored.activate();
  assert.equal(coachPane.style.order, '1');
  assert.equal(document.querySelector('#lessons-view').style.order, '3');
  assert.equal(workspace.style.getPropertyValue('--lesson-layout-pane-1'), '26fr');
  assert.equal(document.querySelectorAll('.lesson-layout-divider').length, 2);
  restored.destroy();
});

test('lesson layout defers and coalesces sketch canvas resizing', () => {
  installDom(`
    <div class="workspace lesson-integrated">
      <main id="sketch-view">
        <nav class="toolbar"></nav>
        <aside id="coach-panel"></aside>
      </main>
      <section id="lessons-view" class="integrated-lesson-panel"></section>
    </div>
  `);
  const scheduledFrames = [];
  const canceledFrames = [];
  window.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };
  window.cancelAnimationFrame = (frameId) => canceledFrames.push(frameId);
  let resizeCalls = 0;
  const controller = new LessonLayoutController({
    workspace: document.querySelector('.workspace'),
    sketchPane: document.querySelector('#sketch-view'),
    lessonPane: document.querySelector('#lessons-view'),
    coachPane: document.querySelector('#coach-panel'),
    onResize: () => {
      resizeCalls += 1;
    },
  });

  controller.activate();
  controller.apply();
  controller.apply();
  assert.equal(resizeCalls, 0);
  assert.equal(scheduledFrames.length, 1);

  scheduledFrames[0](0);
  assert.equal(resizeCalls, 1);
  controller.apply();
  assert.equal(scheduledFrames.length, 2);

  controller.destroy();
  assert.deepEqual(canceledFrames, [2]);
});

test('lesson layout observes only integrated-state transitions', async () => {
  installDom(`
    <div class="workspace lesson-integrated">
      <main id="sketch-view">
        <nav class="toolbar"></nav>
        <aside id="coach-panel"></aside>
      </main>
      <section id="lessons-view" class="integrated-lesson-panel"></section>
    </div>
  `);
  const workspace = document.querySelector('.workspace');
  const sketchPane = document.querySelector('#sketch-view');
  const coachPane = document.querySelector('#coach-panel');
  const toolbar = document.querySelector('.toolbar');
  let resizeCalls = 0;
  const controller = new LessonLayoutController({
    workspace,
    sketchPane,
    lessonPane: document.querySelector('#lessons-view'),
    coachPane,
    toolbar,
    onResize: () => {
      resizeCalls += 1;
    },
  });

  controller.activate();
  workspace.classList.add('unrelated-workspace-state');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resizeCalls, 1);

  workspace.classList.remove('lesson-integrated');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(coachPane.parentElement, sketchPane);
  assert.equal(toolbar.parentElement, sketchPane);

  workspace.classList.add('lesson-integrated');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(coachPane.parentElement, workspace);
  assert.equal(toolbar.parentElement, workspace);
  assert.equal(resizeCalls, 2);

  controller.destroy();
});

test('lesson layout docks the live coach panel and restores its floating home', async () => {
  installDom(`
    <div class="workspace lesson-integrated">
      <main id="sketch-view"><section id="coach-panel"></section></main>
      <section id="lessons-view" class="integrated-lesson-panel"></section>
    </div>
  `);
  const workspace = document.querySelector('.workspace');
  const sketchPane = document.querySelector('#sketch-view');
  const coachPane = document.querySelector('#coach-panel');
  coachPane.getBoundingClientRect = () => ({ top: 148, height: 360 });
  const controller = new LessonLayoutController({
    workspace,
    sketchPane,
    lessonPane: document.querySelector('#lessons-view'),
    coachPane,
  });

  controller.activate();
  assert.equal(coachPane.parentElement, workspace);
  assert.ok(coachPane.classList.contains('coach-panel-docked'));
  assert.equal(coachPane.style.getPropertyValue('--coach-pinned-top'), '');
  assert.equal(coachPane.style.order, '1');

  workspace.classList.remove('lesson-integrated');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(coachPane.parentElement, sketchPane);
  assert.equal(coachPane.classList.contains('coach-panel-docked'), false);

  controller.destroy();
});

test('calculator submit and pin creates a persisted math card through DOM events', async () => {
  installDom(`
    <button id="panel-toggle"></button><aside id="math-panel"><button id="close-panel"></button></aside>
    <form id="math-form"><input id="expression"><button type="submit">Calculate</button></form>
    <span id="result-value"></span><button id="pin-result" disabled></button>
    <button id="clear-history"></button><div id="history-list"></div>
    <div id="paper"><div id="cards"></div></div>
  `);
  const paper = document.querySelector('#paper');
  Object.defineProperties(paper, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  let persisted = 0;
  let createdIdentifiers = 0;
  const cards = new MathCardsController({
    container: document.querySelector('#cards'),
    paper,
    onPersist: () => {
      persisted += 1;
    },
    onChange() {},
    createIdentifier: () => {
      createdIdentifiers += 1;
      return 7001;
    },
  });
  const calculator = new CalculatorPanelController({ onPinResult: (result) => cards.pin(result) });
  calculator.initialize();
  click('#panel-toggle');
  document.querySelector('#expression').value = '2 + 3 * 4';
  document
    .querySelector('#math-form')
    .dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('#result-value').textContent, '14');
  click('#pin-result');
  assert.equal(cards.getCards().length, 1);
  assert.equal(cards.getCards()[0].id, 7001);
  assert.equal(createdIdentifiers, 1);
  assert.equal(document.querySelector('.math-card').dataset.card, '7001');
  assert.equal(document.querySelector('.card-result').textContent.trim(), '= 14');
  assert.equal(persisted, 1);
  assert.equal(document.querySelector('#math-panel').classList.contains('open'), false);
  await new Promise((resolve) => setTimeout(resolve, 260));
});

test('calculator lifecycle removes owned listeners and pending focus work', async () => {
  const dom = installDom(`
    <button id="outside"></button>
    <button id="panel-toggle"></button>
    <div id="calculator-scrim"></div>
    <aside id="math-panel" aria-hidden="true"><button id="close-panel"></button></aside>
    <form id="math-form"><input id="expression"><button type="submit">Calculate</button></form>
    <span id="result-value"></span><button id="pin-result" disabled></button>
    <button id="clear-history"></button><div id="history-list"></div>
    <button data-insert="sqrt()"></button>
    <button data-calculator-action="clear"></button>
    <button data-calculator-action="backspace"></button>
    <button id="angle-mode"></button>
  `);
  localStorage.setItem(
    'chalk-calculations',
    JSON.stringify([{ expression: '1 + 1', result: '2' }]),
  );
  const controller = new CalculatorPanelController({ onPinResult() {} });
  const eventTargetPrototype = dom.window.EventTarget.prototype;
  const originalAddEventListener = eventTargetPrototype.addEventListener;
  const originalRemoveEventListener = eventTargetPrototype.removeEventListener;
  const addedListeners = [];
  const removedListeners = [];
  eventTargetPrototype.addEventListener = function (type, listener, options) {
    addedListeners.push({ target: this, type, listener });
    return originalAddEventListener.call(this, type, listener, options);
  };
  eventTargetPrototype.removeEventListener = function (type, listener, options) {
    removedListeners.push({ target: this, type, listener });
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  try {
    controller.initialize();
    const initializedListenerCount = addedListeners.length;
    controller.initialize();
    assert.equal(addedListeners.length, initializedListenerCount);
    click('[data-history="0"]');
    assert.equal(document.querySelector('#expression').value, '1 + 1');
    document.querySelector('#expression').value = '2 + 2';
    document
      .querySelector('#math-form')
      .dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
    assert.equal(controller.calculations.length, 2);
    document.querySelector('#outside').focus();
    controller.open();
    controller.destroy();
    controller.destroy();
  } finally {
    eventTargetPrototype.addEventListener = originalAddEventListener;
    eventTargetPrototype.removeEventListener = originalRemoveEventListener;
  }

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(document.activeElement, document.querySelector('#outside'));
  assert.ok(addedListeners.length > 0);
  assert.equal(removedListeners.length, addedListeners.length);
  for (const added of addedListeners) {
    assert.equal(
      removedListeners.filter(
        (removed) =>
          removed.target === added.target &&
          removed.type === added.type &&
          removed.listener === added.listener,
      ).length,
      1,
      `expected one matching removal for ${added.type}`,
    );
  }

  document.querySelector('#expression').value = '2 + 2';
  document
    .querySelector('#math-form')
    .dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(controller.calculations.length, 2);

  controller.initialize();
  document
    .querySelector('#math-form')
    .dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(controller.calculations.length, 3);
  controller.destroy();
  assert.equal(controller.initialized, false);
  assert.deepEqual(controller.listeners, []);
  assert.equal(controller.focusTimer, null);
});

test('calculator and cards composition exposes explicit calculator lifecycle', () => {
  installDom(`
    <button id="panel-toggle"></button>
    <aside id="math-panel" aria-hidden="true"><button id="close-panel"></button></aside>
    <form id="math-form"><input id="expression"></form>
    <span id="result-value"></span><button id="pin-result" disabled></button>
    <button id="clear-history"></button><div id="history-list"></div>
    <div id="math-cards"></div><div id="paper"></div>
  `);
  const composition = composeCalculatorAndCards({
    $: (selector) => document.querySelector(selector),
    paper: document.querySelector('#paper'),
    drawingCommands: {
      saveDrawing() {},
      redraw() {},
    },
    showToast() {},
  });

  assert.equal(composition.calculator.initialized, false);
  composition.initialize();
  composition.initialize();
  assert.equal(composition.calculator.initialized, true);
  composition.destroy();
  composition.destroy();
  assert.equal(composition.calculator.initialized, false);
  click('#panel-toggle');
  assert.equal(document.querySelector('#math-panel').classList.contains('open'), false);
});

test('sidebar interpret action owns one disposable listener across reconstruction', async () => {
  installDom(`
    <button id="panel-toggle"></button><aside id="math-panel"><button id="close-panel"></button></aside>
    <form id="math-form"><input id="expression"></form>
    <button id="interpret-page"></button>
    <span id="result-value"></span><button id="pin-result" disabled></button>
    <button id="clear-history"></button><div id="history-list"></div>
  `);
  let requests = 0;
  const calculator = new CalculatorPanelController({ onPinResult() {} });
  calculator.initialize();
  const messages = [];
  const interpretation = new PageInterpretationController({
    button: document.querySelector('#interpret-page'),
    interpretPage: async () => {
      requests += 1;
      return 'sqrt(16) + 2';
    },
    onInterpretation: (value) => calculator.openWithExpression(value),
    showToast: (message) => messages.push(message),
  });
  interpretation.initialize();
  interpretation.initialize();

  click('#interpret-page');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requests, 1);
  assert.equal(document.querySelector('#expression').value, 'sqrt(16) + 2');
  assert.equal(document.querySelector('#math-panel').classList.contains('open'), true);
  assert.match(messages.at(-1), /interpretation added/i);
  assert.equal(document.querySelector('#interpret-page').disabled, false);

  interpretation.destroy();
  interpretation.destroy();
  assert.equal(interpretation.initialized, false);
  click('#interpret-page');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests, 1);

  interpretation.initialize();
  interpretation.initialize();
  click('#interpret-page');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests, 2);
});

test('shortcut commands declare callback stages in precedence order', () => {
  assert.deepEqual(
    SHORTCUT_COMMANDS.map(({ name }) => name),
    [
      'delete-selection',
      'undo-redo',
      'select-tool',
      'toggle-focus',
      'exit-focus',
      'close-lesson-modal',
      'change-pen-size',
    ],
  );

  for (const command of SHORTCUT_COMMANDS) {
    assert.ok(command.match.name, `${command.name} must have a named match function`);
    assert.ok(command.context.name, `${command.name} must have a named context function`);
    assert.ok(command.execute.name, `${command.name} must have a named execute function`);
  }
});

test('shortcuts route to lesson practice, sketch actions, and modal/focus escape paths', () => {
  installDom('<input id="editor"><div id="surface" tabindex="0"></div>');
  const calls = [];
  let lessonOpen = true;
  const practice = {
    undo: () => calls.push('practice.undo'),
    setTool: (tool) => calls.push(`practice.${tool}`),
    deleteSelection: () => {
      calls.push('practice.delete');
      return true;
    },
  };
  let focusMode = false;
  let modalOpen = true;
  const shortcuts = new ShortcutsController({
    isLessonOpen: () => lessonOpen,
    getLessonPracticeController: () => practice,
    undo: () => calls.push('undo'),
    redo: () => calls.push('redo'),
    setTool: (tool) => calls.push(`sketch.${tool}`),
    isSketchActive: () => true,
    toggleFocusMode: () => {
      focusMode = true;
      calls.push('focus');
    },
    isFocusMode: () => focusMode,
    exitFocusMode: () => {
      focusMode = false;
      calls.push('exit-focus');
    },
    isLessonModalOpen: () => modalOpen,
    hideLessonModal: () => {
      modalOpen = false;
      calls.push('hide-modal');
    },
    getPenSize: () => 4,
    setPenSize: (size) => calls.push(`size.${size}`),
    deleteSelection: () => {
      calls.push('sketch.delete');
      return true;
    },
  });
  shortcuts.bind();
  const surface = document.querySelector('#surface');
  surface.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
  );
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  surface.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
  );
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  lessonOpen = false;
  surface.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
  );
  surface.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    }),
  );
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: '[', bubbles: true }));
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: ']', bubbles: true }));
  document
    .querySelector('#editor')
    .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  document
    .querySelector('#editor')
    .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  assert.deepEqual(calls, [
    'practice.undo',
    'practice.eraser',
    'sketch.eraser',
    'practice.delete',
    'focus',
    'exit-focus',
    'hide-modal',
    'undo',
    'redo',
    'size.3',
    'size.5',
  ]);

  shortcuts.destroy();
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  assert.deepEqual(calls, [
    'practice.undo',
    'practice.eraser',
    'sketch.eraser',
    'practice.delete',
    'focus',
    'exit-focus',
    'hide-modal',
    'undo',
    'redo',
    'size.3',
    'size.5',
  ]);

  shortcuts.initialize();
  lessonOpen = true;
  surface.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  assert.deepEqual(calls.slice(-2), ['practice.pen', 'sketch.pen']);
  shortcuts.destroy();
});

test('Delete removes the sketch selection, persists once, and is ignored in text fields', () => {
  installDom('<input id="editor"><div id="surface" tabindex="0"></div>');
  const calls = [];
  const sketch = Object.create(SketchCanvasController.prototype);
  sketch.state = {
    strokes: [{ id: 'keep' }, { id: 'delete-first' }, { id: 'delete-second' }],
    redo: [{ id: 'redo' }],
  };
  sketch.selectionEngine = {
    selectedIndices: [1, 2],
    clear: () => calls.push('clear'),
  };
  sketch.redraw = () => calls.push('redraw');
  sketch.onSave = () => calls.push('save');

  const shortcuts = new ShortcutsController({
    isLessonOpen: () => false,
    getLessonPracticeController: () => null,
    isSketchActive: () => true,
    deleteSelection: () => sketch.deleteSelection(),
  });
  shortcuts.initialize();

  const deleteEvent = new window.KeyboardEvent('keydown', {
    key: 'Delete',
    bubbles: true,
    cancelable: true,
  });
  document.querySelector('#surface').dispatchEvent(deleteEvent);
  document
    .querySelector('#editor')
    .dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    );

  assert.equal(deleteEvent.defaultPrevented, true);
  assert.deepEqual(sketch.state.strokes, [{ id: 'keep' }]);
  assert.deepEqual(sketch.state.redo, []);
  assert.deepEqual(calls, ['clear', 'redraw', 'save']);
  shortcuts.destroy();
});

test('sketch canvas uses the shared stroke session without changing stroke persistence', () => {
  installDom(`
    <canvas id="canvas"></canvas>
    <div id="paper"></div>
    <div id="empty-state"></div>
    <button id="undo"></button>
    <button id="redo"></button>
    <div id="input-status"></div>
    <div id="selection-box"></div>
  `);
  const contextCalls = [];
  const context = {
    save: () => contextCalls.push('save'),
    restore: () => contextCalls.push('restore'),
    beginPath: () => contextCalls.push('beginPath'),
    arc: () => contextCalls.push('arc'),
    fill: () => contextCalls.push('fill'),
    moveTo: () => contextCalls.push('moveTo'),
    lineTo: () => contextCalls.push('lineTo'),
    stroke: () => contextCalls.push('stroke'),
  };
  const canvas = document.querySelector('#canvas');
  const capturedPointers = [];
  const releasedPointers = [];
  canvas.getContext = () => context;
  canvas.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 200,
    height: 100,
  });
  canvas.setPointerCapture = (pointerId) => capturedPointers.push(pointerId);
  canvas.releasePointerCapture = (pointerId) => releasedPointers.push(pointerId);
  let saveCount = 0;
  const controller = new SketchCanvasController({
    canvas,
    paper: document.querySelector('#paper'),
    emptyState: document.querySelector('#empty-state'),
    undoButton: document.querySelector('#undo'),
    redoButton: document.querySelector('#redo'),
    inputStatus: document.querySelector('#input-status'),
    selectionBox: document.querySelector('#selection-box'),
    getCards: () => [],
    clearCards() {},
    getActivePage: () => null,
    onSave: () => {
      saveCount += 1;
    },
    onToast() {},
  });
  controller.state.redo = [{ tool: 'pen', points: [] }];

  controller.startStroke({
    button: 0,
    buttons: 1,
    pointerType: 'pen',
    pointerId: 7,
    pressure: 0.4,
    clientX: 20,
    clientY: 30,
    preventDefault() {},
  });
  controller.moveStroke({
    pointerType: 'pen',
    pointerId: 7,
    pressure: 0.8,
    clientX: 25,
    clientY: 40,
    getCoalescedEvents: () => [
      { pointerType: 'pen', pressure: 0.5, clientX: 20.1, clientY: 30.1 },
      { pointerType: 'pen', pressure: 0.8, clientX: 25, clientY: 40 },
    ],
  });
  controller.endStroke({ pointerId: 7 });

  controller.state.tool = 'select';
  controller.startStroke({
    button: 0,
    pointerType: 'mouse',
    pointerId: 8,
    pressure: 0,
    clientX: 15,
    clientY: 25,
    preventDefault() {},
  });
  assert.deepEqual(controller.strokeSession.state, { kind: 'selecting' });
  controller.moveStroke({
    pointerType: 'mouse',
    pointerId: 8,
    pressure: 0,
    clientX: 30,
    clientY: 45,
  });
  controller.endStroke({ pointerId: 8 });

  assert.deepEqual(controller.getStrokes(), [
    {
      tool: 'pen',
      color: '#252522',
      size: 4,
      points: [
        { x: 10, y: 10, pressure: 0.4 },
        { x: 15, y: 20, pressure: 0.8 },
      ],
    },
  ]);
  assert.equal(Object.hasOwn(controller.state, 'drawing'), false);
  assert.equal(Object.hasOwn(controller.state, 'activeStroke'), false);
  assert.deepEqual(controller.strokeSession.state, { kind: 'idle' });
  assert.deepEqual(controller.state.redo, []);
  assert.equal(saveCount, 1);
  assert.deepEqual(capturedPointers, [7, 8]);
  assert.deepEqual(releasedPointers, [7, 8]);
  assert.equal(controller.undoButton.disabled, false);
  assert.equal(controller.redoButton.disabled, true);
  assert.equal(controller.inputStatus.textContent, ' Ready for pen');
  assert.ok(contextCalls.includes('fill'));
  assert.ok(contextCalls.includes('stroke'));
});

test('sketch canvas resize changes only the bitmap dimensions', () => {
  installDom(`
    <canvas id="canvas"></canvas>
    <div id="paper"></div>
    <div id="empty-state"></div>
    <button id="undo"></button>
    <button id="redo"></button>
    <div id="input-status"></div>
    <div id="selection-box"></div>
  `);
  const canvas = document.querySelector('#canvas');
  const paper = document.querySelector('#paper');
  canvas.getContext = () => ({
    clearRect() {},
    setTransform() {},
  });
  canvas.getBoundingClientRect = () => ({ width: 240, height: 360 });
  paper.getBoundingClientRect = () => ({ width: 240, height: 360 });
  const controller = new SketchCanvasController({
    canvas,
    paper,
    emptyState: document.querySelector('#empty-state'),
    undoButton: document.querySelector('#undo'),
    redoButton: document.querySelector('#redo'),
    inputStatus: document.querySelector('#input-status'),
    selectionBox: document.querySelector('#selection-box'),
    getCards: () => [],
    clearCards() {},
    getActivePage: () => null,
    onSave() {},
    onToast() {},
  });

  controller.resize();

  assert.equal(canvas.width, 240);
  assert.equal(canvas.height, 360);
  assert.equal(canvas.style.width, '');
  assert.equal(canvas.style.height, '');
});

test('sketch canvas destroy removes every listener installed by initialize', () => {
  const dom = installDom(`
    <canvas id="canvas"></canvas>
    <div id="paper"></div>
    <div id="empty-state"></div>
    <button id="undo"></button>
    <button id="redo"></button>
    <div id="input-status"></div>
    <div id="selection-box"></div>
    <button data-tool="pen"></button>
    <button id="color-tool"></button>
    <button id="size-tool"></button>
    <div id="color-popover"><button data-color="#315bdf"></button></div>
    <div id="size-popover"></div>
    <span class="color-dot"></span>
    <input id="size-range" value="4">
    <span id="size-value"></span>
    <div class="size-tool"><span></span></div>
    <button id="grid-tool"></button>
    <button id="clear-page-tool"></button>
  `);
  const canvas = document.querySelector('#canvas');
  canvas.getContext = () => ({});
  const controller = new SketchCanvasController({
    canvas,
    paper: document.querySelector('#paper'),
    emptyState: document.querySelector('#empty-state'),
    undoButton: document.querySelector('#undo'),
    redoButton: document.querySelector('#redo'),
    inputStatus: document.querySelector('#input-status'),
    selectionBox: document.querySelector('#selection-box'),
    getCards: () => [],
    clearCards() {},
    getActivePage: () => null,
    onSave() {},
    onToast() {},
  });
  const eventTargetPrototype = dom.window.EventTarget.prototype;
  const originalAddEventListener = eventTargetPrototype.addEventListener;
  const originalRemoveEventListener = eventTargetPrototype.removeEventListener;
  const addedListeners = [];
  const removedListeners = [];
  eventTargetPrototype.addEventListener = function (type, listener, options) {
    addedListeners.push({ target: this, type, listener });
    return originalAddEventListener.call(this, type, listener, options);
  };
  eventTargetPrototype.removeEventListener = function (type, listener, options) {
    removedListeners.push({ target: this, type, listener });
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  try {
    controller.initialize();
    controller.initialize();
    controller.destroy();
    controller.destroy();
  } finally {
    eventTargetPrototype.addEventListener = originalAddEventListener;
    eventTargetPrototype.removeEventListener = originalRemoveEventListener;
  }

  assert.ok(addedListeners.length > 0);
  assert.equal(removedListeners.length, addedListeners.length);
  for (const added of addedListeners) {
    assert.equal(
      removedListeners.filter(
        (removed) =>
          removed.target === added.target &&
          removed.type === added.type &&
          removed.listener === added.listener,
      ).length,
      1,
      `expected one matching removal for ${added.type}`,
    );
  }

  const selectedTools = [];
  controller.setTool = (tool) => selectedTools.push(tool);
  document.querySelector('[data-tool]').click();
  assert.deepEqual(selectedTools, []);
  controller.initialize();
  document.querySelector('[data-tool]').click();
  assert.deepEqual(selectedTools, ['pen']);
  controller.destroy();
  assert.equal(controller.initialized, false);
  assert.deepEqual(controller.listeners, []);
});

class FakeCodexClient extends EventTarget {
  constructor() {
    super();
    this.threadId = null;
  }
  async send() {}
  useThread(threadId) {
    this.threadId = threadId;
  }
  emit(type, detail = {}) {
    const event = new Event(type);
    Object.defineProperty(event, 'detail', { value: detail });
    this.dispatchEvent(event);
  }
}

test('coach status DOM reflects connectivity while overlapping requests remain rejected', async () => {
  installDom('<button id="codex-status"></button>');
  const client = new FakeCodexClient();
  const statusElement = document.querySelector('#codex-status');
  const service = new CodexCoachService({
    location: window.location,
    statusElement,
    activeSession: () => null,
    activeThread: () => null,
    persistSession() {},
    createClient: () => client,
  });
  service.initialize();
  service.initialize();
  client.emit('status', { connected: true });
  assert.ok(statusElement.classList.contains('connected'));
  assert.equal(statusElement.title, 'Connected to Codex app service');
  const first = service.run('first');
  await assert.rejects(service.run('overlap'), /already working/);
  client.emit('status', { connected: false, reason: 'Service stopped' });
  assert.equal(statusElement.classList.contains('connected'), false);
  assert.equal(statusElement.title, 'Service stopped');
  client.emit('complete');
  assert.equal(await first, '');
  assert.equal(service.isActive, false);
});
