import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { loadStylesheetCatalog } from './stylesheet-catalog.js';

const stylesheetInventory = [
  'tokens.css',
  'base.css',
  'desktop-shell.css',
  'navigation-focus.css',
  'canvas.css',
  'calculator.css',
  'math-cards.css',
  'popovers.css',
  'projects.css',
  'coach.css',
  'selection.css',
  'lesson-library.css',
  'lesson-detail.css',
  'lesson-layout.css',
  'lesson-practice.css',
  'lesson-modal.css',
  'responsive.css',
  'appearance.css',
  'themes.css',
];

const selectorOwnership = new Map([
  [':root', ['tokens.css']],
  ['#app', ['base.css']],
  ['.desktop-titlebar', ['desktop-shell.css']],
  ['.topbar', ['navigation-focus.css', 'responsive.css']],
  ['.app-view.active', ['navigation-focus.css']],
  ['.paper', ['canvas.css']],
  ['#canvas', ['canvas.css']],
  ['.math-panel.open', ['calculator.css']],
  ['.math-card', ['math-cards.css']],
  ['.popover.show', ['popovers.css']],
  ['.sessions-panel.open', ['projects.css']],
  ['.coach-panel.open', ['coach.css']],
  ['#canvas.selecting', ['selection.css']],
  ['.lesson-selection-box.show', ['selection.css']],
  ['.lessons-sidebar', ['lesson-library.css', 'responsive.css']],
  ['.lesson-progress-card', ['lesson-library.css', 'responsive.css']],
  ['.lesson-card', ['lesson-library.css']],
  ['.lesson-empty.show', ['lesson-library.css']],
  ['.lessons-page', ['lesson-detail.css']],
  ['.lesson-detail.open', ['lesson-detail.css']],
  ['.lesson-graph-block', ['lesson-detail.css']],
  ['.workspace.lesson-integrated', ['lesson-layout.css']],
  ['.workspace.lesson-integrated > .coach-panel-docked', ['lesson-layout.css']],
  ['.lesson-layout-divider', ['lesson-layout.css']],
  ['.lesson-layout-tab', ['lesson-layout.css']],
  ['.lesson-practice-pane', ['lesson-practice.css']],
  ['.lesson-practice-tools', ['lesson-practice.css']],
  ['.lesson-practice-paper', ['lesson-practice.css']],
  ['.lesson-practice-canvas', ['lesson-practice.css']],
  ['.lesson-practice-empty.hidden', ['lesson-practice.css']],
  ['.lesson-practice-status', ['lesson-practice.css']],
  ['#lesson-modal.open', ['lesson-modal.css']],
  ['.lesson-picker', ['lesson-modal.css']],
  ['.lesson-modal-error.show', ['lesson-modal.css']],
  ['.lesson-grid', ['lesson-library.css', 'responsive.css']],
  ['.appearance-popover.show', ['appearance.css']],
  [':root[data-theme="dark"]', ['themes.css']],
]);

const catalogPromise = loadStylesheetCatalog();

function computedStyle(dom, selector) {
  const element = dom.window.document.querySelector(selector);
  assert.ok(element, `expected fixture element ${selector}`);
  return dom.window.getComputedStyle(element);
}

function ruleInMedia(catalog, path, selector, mediaQuery) {
  const rule = catalog
    .rulesFor(path, selector)
    .find((candidate) => candidate.mediaQueries.includes(mediaQuery));
  assert.ok(rule, `expected ${path} to own ${selector} inside ${mediaQuery}`);
  return rule;
}

test('stylesheet entry, directory inventory, and selector ownership stay aligned', async () => {
  const catalog = await catalogPromise;

  assert.deepEqual(catalog.imports, stylesheetInventory);
  assert.deepEqual(catalog.directoryPaths, [...stylesheetInventory].sort());

  for (const [selector, expectedOwners] of selectorOwnership) {
    assert.deepEqual(
      catalog.ownersOf(selector),
      [...expectedOwners].sort(),
      `unexpected owner set for ${selector}`,
    );
  }
});

test('responsive contracts remain with their feature stylesheet', async () => {
  const catalog = await catalogPromise;

  const modalRule = ruleInMedia(catalog, 'lesson-modal.css', '.lesson-modal', '(max-width: 560px)');
  assert.equal(modalRule.style.padding, '8px');
  assert.equal(modalRule.style.alignItems, 'stretch');

  const practiceRule = ruleInMedia(
    catalog,
    'lesson-practice.css',
    '.lesson-practice-pane',
    '(max-width: 700px)',
  );
  assert.equal(practiceRule.style.position, 'relative');
  assert.equal(practiceRule.style.height, '58vh');
  assert.equal(practiceRule.style.minHeight, '390px');

  const compactLayoutRule = ruleInMedia(
    catalog,
    'lesson-layout.css',
    '.workspace.lesson-integrated',
    '(max-width: 760px)',
  );
  assert.equal(compactLayoutRule.style.display, 'block');

  const compactCoachRule = ruleInMedia(
    catalog,
    'lesson-layout.css',
    '.workspace.lesson-integrated > .coach-panel-docked',
    '(max-width: 760px)',
  );
  assert.equal(compactCoachRule.style.position, 'relative');
  assert.equal(compactCoachRule.style.minHeight, '520px');

  const compactTabRule = ruleInMedia(
    catalog,
    'lesson-layout.css',
    '.workspace.lesson-integrated > .lesson-layout-pane > .lesson-layout-tab',
    '(max-width: 760px)',
  );
  assert.equal(compactTabRule.style.display, 'none');

  const narrowArticleRule = ruleInMedia(
    catalog,
    'lesson-detail.css',
    '.lesson-detail article',
    '(max-width: 520px)',
  );
  assert.equal(narrowArticleRule.style.padding, '35px 22px 45px');

  const narrowGridRule = ruleInMedia(
    catalog,
    'responsive.css',
    '.lesson-grid',
    '(max-width: 520px)',
  );
  assert.equal(narrowGridRule.style.gridTemplateColumns, '1fr');
});

test('overlay and panel state classes produce their visible interaction states', async (context) => {
  const catalog = await catalogPromise;
  const dom = await catalog.createDocument(`
    <div class="math-panel"><div class="panel-content"></div></div>
    <div class="coach-panel"></div>
    <div class="sessions-panel"></div>
    <div class="popover"></div>
    <div class="appearance-popover"></div>
    <div class="lesson-modal" id="lesson-modal"><div class="lesson-modal-card"></div></div>
    <div class="lesson-modal-error"></div>
  `);
  context.after(() => dom.window.close());
  const document = dom.window.document;

  assert.equal(computedStyle(dom, '.math-panel').visibility, 'hidden');
  document.querySelector('.math-panel').classList.add('open');
  assert.equal(computedStyle(dom, '.math-panel').visibility, 'visible');
  assert.equal(computedStyle(dom, '.math-panel').opacity, '1');

  assert.equal(computedStyle(dom, '.coach-panel').pointerEvents, 'none');
  document.querySelector('.coach-panel').classList.add('open');
  assert.equal(computedStyle(dom, '.coach-panel').pointerEvents, 'auto');
  assert.equal(computedStyle(dom, '.coach-panel').opacity, '1');

  document.querySelector('.sessions-panel').classList.add('open');
  assert.equal(computedStyle(dom, '.sessions-panel').transform, 'translateX(0)');

  assert.equal(computedStyle(dom, '.popover').display, 'none');
  document.querySelector('.popover').classList.add('show');
  assert.equal(computedStyle(dom, '.popover').display, 'flex');

  assert.equal(computedStyle(dom, '.appearance-popover').display, 'none');
  document.querySelector('.appearance-popover').classList.add('show');
  assert.equal(computedStyle(dom, '.appearance-popover').display, 'block');

  assert.equal(computedStyle(dom, '#lesson-modal').display, 'none');
  document.querySelector('#lesson-modal').classList.add('open');
  const openModalStyle = computedStyle(dom, '#lesson-modal');
  assert.equal(openModalStyle.display, 'flex');
  assert.equal(openModalStyle.position, 'fixed');
  assert.equal(openModalStyle.zIndex, '240');
  assert.equal(openModalStyle.pointerEvents, 'auto');
  assert.equal(computedStyle(dom, '.lesson-modal-card').overscrollBehavior, 'contain');

  assert.equal(computedStyle(dom, '.lesson-modal-error').display, 'none');
  document.querySelector('.lesson-modal-error').classList.add('show');
  assert.equal(computedStyle(dom, '.lesson-modal-error').display, 'block');
});

test('selection behavior is shared by the sketch and lesson canvases', async (context) => {
  const catalog = await catalogPromise;
  const dom = await catalog.createDocument(`
    <canvas id="canvas" class="selecting"></canvas>
    <canvas class="lesson-practice-canvas selecting"></canvas>
    <div class="selection-box"></div>
    <div class="lesson-selection-box"></div>
  `);
  context.after(() => dom.window.close());
  const document = dom.window.document;

  assert.equal(computedStyle(dom, '#canvas').cursor, 'default');
  assert.equal(computedStyle(dom, '.lesson-practice-canvas').cursor, 'default');

  for (const selector of ['.selection-box', '.lesson-selection-box']) {
    const hiddenStyle = computedStyle(dom, selector);
    assert.equal(hiddenStyle.display, 'none');
    assert.equal(hiddenStyle.pointerEvents, 'none');
    assert.equal(hiddenStyle.borderStyle, 'dashed');
    assert.equal(hiddenStyle.borderColor, 'rgb(49, 91, 223)');

    document.querySelector(selector).classList.add('show');
    assert.equal(computedStyle(dom, selector).display, 'block');
  }
});

test('lesson library, detail, and practice surfaces render their base layout contracts', async (context) => {
  const catalog = await catalogPromise;
  const dom = await catalog.createDocument(`
    <aside class="lessons-sidebar"></aside>
    <header class="lessons-header"></header>
    <section class="lesson-progress-card"></section>
    <div class="lesson-grid"></div>
    <article class="lesson-card"></article>
    <div class="lesson-empty show"></div>
    <div class="lesson-detail open">
      <article>
        <div class="lesson-graph-block"></div>
        <button class="complete-lesson"></button>
      </article>
    </div>
    <div class="lesson-practice-pane">
      <nav class="lesson-practice-tools"></nav>
      <div class="lesson-practice-paper">
        <canvas class="lesson-practice-canvas"></canvas>
        <div class="lesson-practice-empty hidden"></div>
      </div>
      <footer class="lesson-practice-status"></footer>
    </div>
    <div class="lessons-page integrated-lesson-panel">
      <div class="lesson-practice-pane integrated-practice"></div>
    </div>
  `);
  context.after(() => dom.window.close());

  const sidebarStyle = computedStyle(dom, '.lessons-sidebar');
  assert.equal(sidebarStyle.width, '215px');
  assert.equal(sidebarStyle.position, 'relative');

  const headerStyle = computedStyle(dom, '.lessons-header');
  assert.equal(headerStyle.display, 'flex');
  assert.equal(headerStyle.justifyContent, 'space-between');
  assert.equal(headerStyle.maxWidth, '1000px');

  assert.equal(computedStyle(dom, '.lesson-progress-card').display, 'grid');
  assert.equal(computedStyle(dom, '.lesson-progress-card').gridTemplateColumns, '155px 1fr auto');
  assert.equal(computedStyle(dom, '.lesson-grid').display, 'grid');
  assert.equal(computedStyle(dom, '.lesson-card').minHeight, '202px');
  assert.equal(computedStyle(dom, '.lesson-card').flexDirection, 'column');
  assert.equal(computedStyle(dom, '.lesson-empty').display, 'block');

  const detailStyle = computedStyle(dom, '.lesson-detail');
  assert.equal(detailStyle.position, 'absolute');
  assert.equal(detailStyle.overflowY, 'auto');
  const articleStyle = computedStyle(dom, '.lesson-detail > article');
  assert.equal(articleStyle.minHeight, 'calc(100vh - 72px)');
  assert.equal(articleStyle.padding, '61px 39px 65px');
  assert.equal(computedStyle(dom, '.lesson-graph-block').borderStyle, 'solid');
  assert.equal(computedStyle(dom, '.complete-lesson').cursor, 'pointer');

  const practiceStyle = computedStyle(dom, 'body > .lesson-practice-pane');
  assert.equal(practiceStyle.display, 'flex');
  assert.equal(practiceStyle.position, 'sticky');
  assert.equal(practiceStyle.height, 'calc(100vh - 72px)');
  assert.equal(computedStyle(dom, '.lesson-practice-tools').width, '60px');
  assert.equal(computedStyle(dom, '.lesson-practice-paper').overflow, 'hidden');
  assert.equal(computedStyle(dom, '.lesson-practice-canvas').position, 'absolute');
  assert.equal(computedStyle(dom, '.lesson-practice-canvas').touchAction, 'none');
  assert.equal(computedStyle(dom, '.lesson-practice-empty').opacity, '0');
  assert.equal(computedStyle(dom, '.lesson-practice-status').justifyContent, 'space-between');
  assert.equal(computedStyle(dom, '.integrated-practice').display, 'none');
});

test('integrated lessons extend the sketch workspace and dock the coach', async (context) => {
  const catalog = await catalogPromise;
  const dom = await catalog.createDocument(`
    <div class="workspace lesson-integrated">
      <nav class="toolbar integrated-toolbar" style="order: 0"></nav>
      <aside class="coach-panel coach-panel-docked open lesson-layout-pane" style="order: 1">
        <button class="lesson-layout-tab"></button>
        <header class="coach-head"></header>
      </aside>
      <div class="lesson-layout-divider" style="order: 2"></div>
      <div id="sketch-view" class="app-view active lesson-layout-pane" style="order: 3">
        <button class="lesson-layout-tab"></button>
        <section class="paper-wrap"><div class="paper"><canvas id="canvas"></canvas></div></section>
      </div>
      <div class="lesson-layout-divider" style="order: 4"></div>
      <section class="lessons-page integrated-lesson-panel lesson-layout-pane" style="order: 5">
        <button class="lesson-layout-tab"></button>
        <div class="lesson-detail open"><article></article></div>
      </section>
    </div>
  `);
  context.after(() => dom.window.close());

  const workspaceStyle = computedStyle(dom, '.workspace');
  assert.equal(workspaceStyle.display, 'grid');
  assert.equal(workspaceStyle.gridTemplateRows, 'max-content');
  assert.equal(workspaceStyle.alignContent, 'stretch');
  assert.equal(workspaceStyle.alignItems, 'stretch');
  assert.equal(workspaceStyle.overflow, 'auto');
  assert.ok(workspaceStyle.gridTemplateColumns.startsWith('60px'));
  assert.ok(workspaceStyle.gridTemplateColumns.includes('8px'));

  const toolbarStyle = computedStyle(dom, '.integrated-toolbar');
  assert.equal(toolbarStyle.order, '0');
  assert.equal(toolbarStyle.position, 'sticky');
  assert.equal(toolbarStyle.left, '0px');
  assert.equal(toolbarStyle.top, '0px');
  assert.equal(toolbarStyle.width, '60px');
  assert.equal(toolbarStyle.height, 'calc(100vh - 72px)');

  const sketchStyle = computedStyle(dom, '#sketch-view');
  assert.equal(sketchStyle.order, '3');
  assert.equal(sketchStyle.height, 'auto');
  assert.equal(sketchStyle.minHeight, '0px');
  assert.equal(sketchStyle.alignSelf, 'stretch');
  const paperWrapStyle = computedStyle(dom, '.paper-wrap');
  assert.equal(paperWrapStyle.height, 'auto');
  assert.equal(paperWrapStyle.minHeight, '0px');
  assert.equal(paperWrapStyle.alignSelf, 'stretch');
  const paperStyle = computedStyle(dom, '.paper');
  assert.equal(paperStyle.flexGrow, '1');
  assert.equal(paperStyle.flexShrink, '1');
  assert.equal(paperStyle.minHeight, '0px');
  const canvasStyle = computedStyle(dom, '#canvas');
  assert.equal(canvasStyle.position, 'absolute');
  assert.equal(canvasStyle.inset, '0px');

  const lessonPanelStyle = computedStyle(dom, '.integrated-lesson-panel');
  assert.equal(lessonPanelStyle.order, '5');
  assert.equal(lessonPanelStyle.display, 'block');
  assert.equal(lessonPanelStyle.minHeight, '0px');

  const integratedDetailStyle = computedStyle(dom, '.lesson-detail');
  assert.equal(integratedDetailStyle.position, 'relative');
  assert.equal(integratedDetailStyle.height, 'auto');
  assert.equal(integratedDetailStyle.minHeight, '0px');
  assert.equal(integratedDetailStyle.overflow, 'visible');
  assert.equal(computedStyle(dom, '.lesson-detail article').paddingTop, '64px');

  const dividerStyle = computedStyle(dom, '.lesson-layout-divider');
  assert.equal(dividerStyle.display, 'block');
  assert.equal(dividerStyle.width, '8px');
  assert.equal(dividerStyle.cursor, 'col-resize');

  const tabStyle = computedStyle(dom, '.lesson-layout-tab');
  assert.equal(tabStyle.display, 'block');
  assert.equal(tabStyle.cursor, 'grab');
  assert.equal(tabStyle.width, '70px');
  assert.equal(tabStyle.height, '22px');
  assert.ok(tabStyle.backgroundImage.includes('radial-gradient'));

  const coachStyle = computedStyle(dom, '.coach-panel-docked');
  assert.equal(coachStyle.order, '1');
  assert.equal(coachStyle.position, 'sticky');
  assert.equal(coachStyle.top, '0px');
  assert.equal(coachStyle.height, 'calc(100vh - 72px)');
  assert.equal(coachStyle.alignSelf, 'start');
  assert.equal(coachStyle.resize, 'none');
  assert.equal(coachStyle.opacity, '1');
  assert.equal(coachStyle.pointerEvents, 'auto');
});

test('dark theme preserves adaptive ink, calculator contrast, divider, and desktop chrome', async (context) => {
  const catalog = await catalogPromise;
  const dom = await catalog.createDocument(
    `
      <div class="desktop-shell">
        <header class="desktop-titlebar"><div class="desktop-titlebar-drag"></div></header>
        <div id="app">
          <canvas id="canvas"></canvas>
          <span class="color-dot adaptive-ink"></span>
          <div class="color-popover"><button data-adaptive-ink></button></div>
          <div class="scientific-keypad">
            <button class="mode-key"></button>
            <button class="utility-key"></button>
            <button class="equals-key"></button>
          </div>
          <div class="lesson-layout-divider"></div>
        </div>
      </div>
    `,
    { theme: 'dark' },
  );
  context.after(() => dom.window.close());

  assert.equal(computedStyle(dom, '#canvas').filter, 'invert(1) hue-rotate(180deg)');
  assert.equal(computedStyle(dom, '.color-dot').backgroundColor, 'rgb(239, 238, 232)');
  assert.equal(
    computedStyle(dom, '.color-popover [data-adaptive-ink]').backgroundColor,
    'rgb(239, 238, 232)',
  );

  const genericCalculatorStyle = computedStyle(dom, '.scientific-keypad button');
  assert.equal(genericCalculatorStyle.backgroundColor, 'rgb(48, 49, 44)');
  assert.equal(genericCalculatorStyle.borderColor, 'rgb(85, 86, 79)');
  assert.equal(genericCalculatorStyle.color, 'rgb(239, 238, 232)');

  const modeRule = catalog.rulesFor(
    'themes.css',
    '[data-theme="dark"] .scientific-keypad .mode-key',
  )[0];
  const utilityRule = catalog.rulesFor(
    'themes.css',
    '[data-theme="dark"] .scientific-keypad .utility-key',
  )[0];
  const equalsRule = catalog.rulesFor(
    'themes.css',
    '[data-theme="dark"] .scientific-keypad .equals-key',
  )[0];
  assert.ok(modeRule);
  assert.ok(utilityRule);
  assert.ok(equalsRule);
  assert.equal(modeRule.style.color, 'rgb(243, 160, 91)');
  assert.equal(utilityRule.style.color, 'rgb(255, 179, 168)');
  assert.equal(equalsRule.style.background, 'rgb(239, 238, 232)');
  assert.equal(equalsRule.style.color, 'rgb(37, 38, 33)');

  const titlebarStyle = computedStyle(dom, '.desktop-titlebar');
  assert.equal(titlebarStyle.display, 'flex');
  assert.equal(titlebarStyle.backgroundColor, 'rgb(39, 40, 36)');
  assert.equal(titlebarStyle.borderBottomColor, 'rgb(70, 71, 64)');
  assert.equal(computedStyle(dom, '.desktop-titlebar-drag').cursor, 'grab');

  const activeDragRule = catalog.rulesFor('desktop-shell.css', '.desktop-titlebar-drag:active')[0];
  assert.equal(activeDragRule.style.cursor, 'grabbing');

  assert.ok(
    computedStyle(dom, '.lesson-layout-divider').backgroundImage.includes('rgb(85, 88, 79)'),
  );
});

test('focus and snapshot controls retain their DOM and rendered placement contracts', async (context) => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const applicationDom = new JSDOM(indexHtml);
  context.after(() => applicationDom.window.close());
  const document = applicationDom.window.document;
  const topActions = document.querySelector('.top-actions');
  const lowerTools = document.querySelector('.tool-group.lower');

  assert.ok(topActions);
  assert.ok(lowerTools);
  assert.equal(topActions.querySelector('#focus-trigger'), null);
  assert.equal(topActions.querySelector('#export'), null);
  assert.equal(document.querySelector('.focus-hud'), null);
  assert.equal(document.querySelector('[data-focus-tool]'), null);

  const lowerToolIds = [...lowerTools.querySelectorAll(':scope > .tool')].map(
    (element) => element.id,
  );
  assert.ok(lowerToolIds.indexOf('focus-trigger') >= 0);
  assert.ok(lowerToolIds.indexOf('focus-trigger') < lowerToolIds.indexOf('clear-page-tool'));

  const snapshotButton = lowerTools.querySelector('#export');
  assert.ok(snapshotButton);
  assert.equal(snapshotButton.getAttribute('aria-label'), 'Snapshot');
  assert.equal(snapshotButton.getAttribute('title'), 'Snapshot');
  const snapshotLens = snapshotButton.querySelector('circle[cx="12"][cy="13"][r="4"]');
  assert.ok(snapshotLens);

  const adaptiveInkButton = document.querySelector('[data-color][data-adaptive-ink]');
  assert.ok(adaptiveInkButton);
  assert.equal(adaptiveInkButton.dataset.color, '#252522');

  const catalog = await catalogPromise;
  const focusDom = await catalog.createDocument(`
    <div id="app" class="focus-mode">
      <header class="topbar"></header>
      <main class="workspace">
        <section id="sketch-view" class="app-view active">
          <nav class="toolbar"></nav>
          <div class="paper-wrap">
            <div class="page-tabs"></div>
            <div class="paper"></div>
          </div>
        </section>
      </main>
      <div class="math-panel"></div>
      <aside class="coach-panel"></aside>
    </div>
  `);
  context.after(() => focusDom.window.close());

  assert.equal(computedStyle(focusDom, '.topbar').display, 'none');
  assert.equal(computedStyle(focusDom, '.workspace').height, '100%');
  assert.equal(computedStyle(focusDom, '.toolbar').display, 'flex');
  assert.equal(computedStyle(focusDom, '.paper-wrap').padding, '0px');
  assert.equal(computedStyle(focusDom, '.page-tabs').display, 'none');
  assert.equal(computedStyle(focusDom, '.math-panel').display, 'none');
  assert.equal(computedStyle(focusDom, '.coach-panel').display, 'none');
});
