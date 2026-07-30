const STORAGE_KEY = 'chalk-lesson-layout';
const PANE_IDS = /** @type {const} */ (['sketch', 'lesson', 'coach']);
const PANE_LABELS = Object.freeze({
  sketch: 'Sketch',
  lesson: 'Lesson',
  coach: 'Chat',
});
const DEFAULT_LAYOUT = Object.freeze({
  paneOrder: /** @type {PaneId[]} */ (['coach', 'sketch', 'lesson']),
  paneSizes: Object.freeze({ sketch: 36, lesson: 40, coach: 24 }),
});
const MINIMUM_PANE_PERCENT = 18;
const KEYBOARD_RESIZE_PERCENT = 2;

/**
 * @typedef {'sketch' | 'lesson' | 'coach'} PaneId
 * @typedef {{sketch: number, lesson: number, coach: number}} PaneSizes
 * @typedef {{
 *   paneOrder: PaneId[],
 *   paneSizes: PaneSizes,
 * }} LessonLayout
 * @typedef {{
 *   type: 'resize',
 *   pointerId: number,
 *   dividerIndex: number,
 *   order: PaneId[],
 *   sizes: PaneSizes,
 * } | {
 *   type: 'reorder',
 *   pointerId: number,
 *   paneId: PaneId,
 *   order: PaneId[],
 *   sizes: PaneSizes,
 *   targetIndex: number,
 *   handle: HTMLButtonElement,
 * }} LayoutDrag
 *
 * @typedef {object} LessonLayoutOptions
 * @property {HTMLElement} workspace
 * @property {HTMLElement} sketchPane
 * @property {HTMLElement} lessonPane
 * @property {HTMLElement | null} coachPane
 * @property {HTMLElement | null | undefined} [toolbar]
 * @property {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [storage]
 * @property {() => void} [onResize]
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is PaneId}
 */
function isPaneId(value) {
  return typeof value === 'string' && PANE_IDS.includes(/** @type {PaneId} */ (value));
}

/**
 * @param {unknown} value
 * @param {PaneId[]} fallback
 * @returns {PaneId[]}
 */
function normalizePaneOrder(value, fallback) {
  const order = Array.isArray(value) ? value.filter(isPaneId) : [...fallback];
  if (order.length !== PANE_IDS.length || new Set(order).size !== PANE_IDS.length) {
    return /** @type {PaneId[]} */ (['coach', ...fallback.filter((paneId) => paneId !== 'coach')]);
  }
  return /** @type {PaneId[]} */ (['coach', ...order.filter((paneId) => paneId !== 'coach')]);
}

/**
 * Normalize pane sizes to a stable 100-percent allocation while reserving the
 * minimum usable width for every pane.
 *
 * @param {unknown} value
 * @param {PaneSizes} fallback
 * @returns {PaneSizes}
 */
function normalizePaneSizes(value, fallback) {
  const record = isRecord(value) ? value : {};
  const requested = PANE_IDS.map((paneId) => {
    const candidate = record[paneId];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : fallback[paneId];
  });
  const extras = requested.map((size) => Math.max(0, size - MINIMUM_PANE_PERCENT));
  const extraTotal = extras.reduce((total, size) => total + size, 0);
  const distributable = 100 - MINIMUM_PANE_PERCENT * PANE_IDS.length;
  const normalizedExtras =
    extraTotal > 0
      ? extras.map((size) => (size / extraTotal) * distributable)
      : PANE_IDS.map((paneId) => fallback[paneId] - MINIMUM_PANE_PERCENT);

  return {
    sketch: MINIMUM_PANE_PERCENT + normalizedExtras[0],
    lesson: MINIMUM_PANE_PERCENT + normalizedExtras[1],
    coach: MINIMUM_PANE_PERCENT + normalizedExtras[2],
  };
}

/**
 * @param {PaneId[]} order
 * @param {PaneId} paneId
 * @param {number} targetIndex
 * @returns {PaneId[]}
 */
function movePane(order, paneId, targetIndex) {
  const nextOrder = order.filter((candidate) => candidate !== paneId);
  nextOrder.splice(Math.max(0, Math.min(targetIndex, nextOrder.length)), 0, paneId);
  return nextOrder;
}

/**
 * @param {number} value
 * @returns {number}
 */
export class LessonLayoutController {
  /** @param {LessonLayoutOptions} options */
  constructor({
    workspace,
    sketchPane,
    lessonPane,
    coachPane,
    toolbar = null,
    storage = globalThis.localStorage,
    onResize = () => {},
  }) {
    this.workspace = workspace;
    this.sketchPane = sketchPane;
    this.lessonPane = lessonPane;
    this.coachPane = coachPane;
    this.toolbar = toolbar;
    this.storage = storage;
    this.onResize = onResize;
    this.document = workspace.ownerDocument;
    this.view = /** @type {Window & typeof globalThis} */ (this.document.defaultView);
    /** @type {Map<PaneId, HTMLElement>} */
    this.panes = new Map([
      ['sketch', sketchPane],
      ['lesson', lessonPane],
    ]);
    if (coachPane) this.panes.set('coach', coachPane);
    /** @type {LessonLayout} */
    this.layout = this.load();
    /** @type {LayoutDrag | null} */
    this.drag = null;
    /** @type {HTMLDivElement[]} */
    this.dividers = [];
    /** @type {Map<PaneId, HTMLButtonElement>} */
    this.tabs = new Map();
    /** @type {{parent: HTMLElement | null, nextSibling: ChildNode | null} | null} */
    this.coachHome = coachPane
      ? { parent: coachPane.parentElement, nextSibling: coachPane.nextSibling }
      : null;
    /** @type {{parent: HTMLElement | null, nextSibling: ChildNode | null} | null} */
    this.toolbarHome = toolbar
      ? { parent: toolbar.parentElement, nextSibling: toolbar.nextSibling }
      : null;
    /** @type {MutationObserver | null} */
    this.workspaceObserver = null;
    this.lessonIntegrated = workspace.classList.contains('lesson-integrated');
    /** @type {number | null} */
    this.resizeFrame = null;
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
  }

  /** @returns {LessonLayout} */
  load() {
    const serialized = this.storage?.getItem(STORAGE_KEY);
    if (serialized === null || serialized === undefined) {
      return {
        paneOrder: [...DEFAULT_LAYOUT.paneOrder],
        paneSizes: { ...DEFAULT_LAYOUT.paneSizes },
      };
    }

    const stored = /** @type {unknown} */ (JSON.parse(serialized));
    if (!isRecord(stored)) {
      throw new TypeError('Stored lesson layout must be an object.');
    }
    if (
      stored.paneOrder !== undefined &&
      (!Array.isArray(stored.paneOrder) ||
        stored.paneOrder.length !== PANE_IDS.length ||
        !stored.paneOrder.every(isPaneId) ||
        new Set(stored.paneOrder).size !== PANE_IDS.length)
    ) {
      throw new TypeError('Stored lesson pane order is invalid.');
    }
    const storedPaneSizes = isRecord(stored.paneSizes) ? stored.paneSizes : null;
    if (
      stored.paneSizes !== undefined &&
      (!storedPaneSizes ||
        !PANE_IDS.every(
          (paneId) =>
            typeof storedPaneSizes[paneId] === 'number' && Number.isFinite(storedPaneSizes[paneId]),
        ))
    ) {
      throw new TypeError('Stored lesson pane sizes are invalid.');
    }
    if (
      stored.lessonSide !== undefined &&
      stored.lessonSide !== 'left' &&
      stored.lessonSide !== 'right'
    ) {
      throw new TypeError('Stored legacy lesson side is invalid.');
    }
    if (
      stored.lessonWidthPercent !== undefined &&
      (typeof stored.lessonWidthPercent !== 'number' || !Number.isFinite(stored.lessonWidthPercent))
    ) {
      throw new TypeError('Stored legacy lesson width is invalid.');
    }

    const legacyOrder =
      stored.lessonSide === 'left'
        ? /** @type {PaneId[]} */ (['lesson', 'sketch', 'coach'])
        : DEFAULT_LAYOUT.paneOrder;
    const legacyLessonWidth =
      typeof stored.lessonWidthPercent === 'number'
        ? stored.lessonWidthPercent
        : DEFAULT_LAYOUT.paneSizes.lesson;
    const legacySizes = {
      sketch: Math.max(MINIMUM_PANE_PERCENT, 76 - legacyLessonWidth),
      lesson: legacyLessonWidth,
      coach: 24,
    };

    return {
      paneOrder: normalizePaneOrder(stored.paneOrder, legacyOrder),
      paneSizes: normalizePaneSizes(stored.paneSizes, legacySizes),
    };
  }

  persist() {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.layout));
  }

  activate() {
    this.workspace.classList.remove('lesson-pane-left');
    this.ensureControls();
    this.dockCoach();
    this.dockToolbar();
    this.observeWorkspace();
    this.apply();
  }

  observeWorkspace() {
    if (this.workspaceObserver) return;
    this.lessonIntegrated = this.workspace.classList.contains('lesson-integrated');
    const Observer = this.view.MutationObserver;
    const observer = new Observer(() => {
      const lessonIntegrated = this.workspace.classList.contains('lesson-integrated');
      if (lessonIntegrated === this.lessonIntegrated) return;
      this.lessonIntegrated = lessonIntegrated;
      if (lessonIntegrated) {
        this.dockCoach();
        this.dockToolbar();
        this.apply();
      } else {
        this.restoreCoach();
        this.restoreToolbar();
      }
    });
    observer.observe(this.workspace, {
      attributes: true,
      attributeFilter: ['class'],
    });
    this.workspaceObserver = observer;
  }

  dockCoach() {
    if (!this.coachPane || this.coachPane.parentElement === this.workspace) return;
    this.coachPane.classList.add('coach-panel-docked');
    this.coachPane.style.removeProperty('--coach-pinned-top');
    this.workspace.append(this.coachPane);
  }

  restoreCoach() {
    if (!this.coachPane || !this.coachHome?.parent) return;
    this.coachPane.classList.remove('coach-panel-docked');
    this.coachPane.style.removeProperty('order');
    this.coachPane.style.removeProperty('--coach-pinned-top');
    const { parent, nextSibling } = this.coachHome;
    if (nextSibling?.parentElement === parent) parent.insertBefore(this.coachPane, nextSibling);
    else parent.append(this.coachPane);
  }

  dockToolbar() {
    if (!this.toolbar || this.toolbar.parentElement === this.workspace) return;
    this.toolbar.classList.add('integrated-toolbar');
    this.toolbar.style.order = '0';
    this.workspace.prepend(this.toolbar);
  }

  restoreToolbar() {
    if (!this.toolbar || !this.toolbarHome?.parent) return;
    this.toolbar.classList.remove('integrated-toolbar');
    this.toolbar.style.removeProperty('order');
    const { parent, nextSibling } = this.toolbarHome;
    if (nextSibling?.parentElement === parent) parent.insertBefore(this.toolbar, nextSibling);
    else parent.append(this.toolbar);
  }

  ensureControls() {
    const paneOrder = this.availablePaneOrder();
    for (const paneId of paneOrder) {
      const pane = this.panes.get(paneId);
      if (!pane) continue;
      pane.classList.add('lesson-layout-pane');
      if (this.tabs.has(paneId)) continue;
      const tab = this.document.createElement('button');
      tab.type = 'button';
      tab.className = 'lesson-layout-tab';
      tab.dataset.pane = paneId;
      if (paneId === 'coach') {
        tab.setAttribute('aria-label', 'Chat pane pinned to the left');
        tab.title = 'Chat pane pinned to the left';
        tab.tabIndex = -1;
      } else {
        tab.setAttribute('aria-label', `Drag ${PANE_LABELS[paneId]} pane to move it`);
        tab.title = `Drag to move ${PANE_LABELS[paneId]}`;
        tab.addEventListener('pointerdown', (event) => this.startReorder(event, paneId));
        tab.addEventListener('keydown', (event) => this.reorderWithKeyboard(event, paneId));
      }
      pane.prepend(tab);
      this.tabs.set(paneId, tab);
    }

    const dividerCount = Math.max(0, paneOrder.length - 1);
    while (this.dividers.length < dividerCount) {
      const divider = this.document.createElement('div');
      const dividerIndex = this.dividers.length;
      divider.className = 'lesson-layout-divider';
      divider.dataset.dividerIndex = String(dividerIndex);
      divider.setAttribute('role', 'separator');
      divider.setAttribute(
        'aria-label',
        `Resize panes ${dividerIndex + 1} and ${dividerIndex + 2}`,
      );
      divider.setAttribute('aria-orientation', 'vertical');
      divider.tabIndex = 0;
      divider.addEventListener('pointerdown', (event) => this.startResize(event, dividerIndex));
      divider.addEventListener('keydown', (event) => this.resizeWithKeyboard(event, dividerIndex));
      this.workspace.append(divider);
      this.dividers.push(divider);
    }
  }

  /** @returns {PaneId[]} */
  availablePaneOrder() {
    return this.layout.paneOrder.filter((paneId) => this.panes.has(paneId));
  }

  apply() {
    const paneOrder = this.availablePaneOrder();
    const activeSizes = normalizePaneSizes(this.layout.paneSizes, DEFAULT_LAYOUT.paneSizes);
    this.layout.paneSizes = activeSizes;
    this.workspace.style.setProperty('--lesson-layout-pane-count', String(paneOrder.length));

    for (const [index, paneId] of paneOrder.entries()) {
      const pane = this.panes.get(paneId);
      if (!pane) continue;
      pane.style.order = String(index * 2 + 1);
      pane.dataset.layoutPosition = String(index + 1);
      this.workspace.style.setProperty(
        `--lesson-layout-pane-${index + 1}`,
        `${activeSizes[paneId]}fr`,
      );
      const tab = this.tabs.get(paneId);
      if (tab) tab.setAttribute('aria-posinset', String(index + 1));
    }

    for (const [index, divider] of this.dividers.entries()) {
      const paneId = paneOrder[index];
      const adjacentPaneId = paneOrder[index + 1];
      if (!paneId || !adjacentPaneId) continue;
      const pairTotal = activeSizes[paneId] + activeSizes[adjacentPaneId];
      divider.style.order = String(index * 2 + 2);
      divider.setAttribute('aria-valuemin', String(MINIMUM_PANE_PERCENT));
      divider.setAttribute('aria-valuemax', String(Math.round(pairTotal - MINIMUM_PANE_PERCENT)));
      divider.setAttribute('aria-valuenow', String(Math.round(activeSizes[paneId])));
      divider.setAttribute(
        'aria-label',
        `Resize ${PANE_LABELS[paneId]} and ${PANE_LABELS[adjacentPaneId]} panes`,
      );
    }

    this.scheduleResize();
  }

  scheduleResize() {
    if (this.resizeFrame !== null) return;
    if (typeof this.view.requestAnimationFrame !== 'function') {
      this.onResize();
      return;
    }
    this.resizeFrame = this.view.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.onResize();
    });
  }

  /** @param {PointerEvent} event @param {number} dividerIndex */
  startResize(event, dividerIndex) {
    if (event.button !== 0) return;
    this.drag = {
      type: 'resize',
      pointerId: event.pointerId,
      dividerIndex,
      order: this.availablePaneOrder(),
      sizes: { ...this.layout.paneSizes },
    };
    const divider = this.dividers[dividerIndex];
    divider?.classList.add('dragging');
    divider?.setPointerCapture?.(event.pointerId);
    this.addPointerListeners();
    event.preventDefault();
  }

  /** @param {PointerEvent} event @param {PaneId} paneId */
  startReorder(event, paneId) {
    if (event.button !== 0 || paneId === 'coach') return;
    const handle = this.tabs.get(paneId);
    if (!handle) return;
    const order = this.availablePaneOrder();
    this.drag = {
      type: 'reorder',
      pointerId: event.pointerId,
      paneId,
      order,
      sizes: { ...this.layout.paneSizes },
      targetIndex: order.indexOf(paneId),
      handle,
    };
    handle.classList.add('dragging');
    this.workspace.classList.add('reordering-panes');
    handle.setPointerCapture?.(event.pointerId);
    this.addPointerListeners();
    event.preventDefault();
  }

  addPointerListeners() {
    this.view.addEventListener('pointermove', this.onPointerMove);
    this.view.addEventListener('pointerup', this.onPointerEnd);
    this.view.addEventListener('pointercancel', this.onPointerEnd);
  }

  removePointerListeners() {
    this.view.removeEventListener('pointermove', this.onPointerMove);
    this.view.removeEventListener('pointerup', this.onPointerEnd);
    this.view.removeEventListener('pointercancel', this.onPointerEnd);
  }

  /** @param {PointerEvent} event */
  onPointerMove(event) {
    if (!this.drag) return;
    if (this.drag.type === 'resize') {
      this.resizeFromPointer(event.clientX, this.drag);
      return;
    }

    const targetIndex = Math.max(
      1,
      this.targetIndexAt(event.clientX, this.drag.order, this.drag.sizes),
    );
    if (targetIndex === this.drag.targetIndex) return;
    this.drag.targetIndex = targetIndex;
    this.layout.paneOrder = movePane(this.drag.order, this.drag.paneId, targetIndex);
    this.apply();
  }

  /**
   * @param {number} clientX
   * @param {Extract<LayoutDrag, {type: 'resize'}>} drag
   */
  resizeFromPointer(clientX, drag) {
    const leftPaneId = drag.order[drag.dividerIndex];
    const rightPaneId = drag.order[drag.dividerIndex + 1];
    if (!leftPaneId || !rightPaneId) return;
    const bounds = this.workspace.getBoundingClientRect();
    if (!bounds.width) return;
    const pointerPercent = ((clientX - bounds.left) / bounds.width) * 100;
    const precedingPercent = drag.order
      .slice(0, drag.dividerIndex)
      .reduce((total, paneId) => total + drag.sizes[paneId], 0);
    const pairTotal = drag.sizes[leftPaneId] + drag.sizes[rightPaneId];
    const leftSize = Math.min(
      pairTotal - MINIMUM_PANE_PERCENT,
      Math.max(MINIMUM_PANE_PERCENT, pointerPercent - precedingPercent),
    );
    this.layout.paneSizes[leftPaneId] = leftSize;
    this.layout.paneSizes[rightPaneId] = pairTotal - leftSize;
    this.apply();
  }

  /**
   * @param {number} clientX
   * @param {PaneId[]} order
   * @param {PaneSizes} sizes
   * @returns {number}
   */
  targetIndexAt(clientX, order, sizes) {
    const bounds = this.workspace.getBoundingClientRect();
    if (!bounds.width) return 0;
    const pointerPercent = Math.max(
      0,
      Math.min(100, ((clientX - bounds.left) / bounds.width) * 100),
    );
    let cumulative = 0;
    for (const [index, paneId] of order.entries()) {
      cumulative += sizes[paneId];
      if (pointerPercent <= cumulative) return index;
    }
    return order.length - 1;
  }

  /** @param {PointerEvent} event */
  onPointerEnd(event) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.removePointerListeners();
    this.workspace.classList.remove('reordering-panes');

    if (drag.type === 'resize') {
      const divider = this.dividers[drag.dividerIndex];
      divider?.classList.remove('dragging');
      try {
        divider?.releasePointerCapture?.(event.pointerId);
      } catch {}
    } else {
      drag.handle.classList.remove('dragging');
      try {
        drag.handle.releasePointerCapture?.(event.pointerId);
      } catch {}
    }
    this.persist();
    this.apply();
  }

  /** @param {KeyboardEvent} event @param {number} dividerIndex */
  resizeWithKeyboard(event, dividerIndex) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const paneOrder = this.availablePaneOrder();
    const leftPaneId = paneOrder[dividerIndex];
    const rightPaneId = paneOrder[dividerIndex + 1];
    if (!leftPaneId || !rightPaneId) return;
    const pairTotal = this.layout.paneSizes[leftPaneId] + this.layout.paneSizes[rightPaneId];
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const leftSize = Math.min(
      pairTotal - MINIMUM_PANE_PERCENT,
      Math.max(
        MINIMUM_PANE_PERCENT,
        this.layout.paneSizes[leftPaneId] + direction * KEYBOARD_RESIZE_PERCENT,
      ),
    );
    this.layout.paneSizes[leftPaneId] = leftSize;
    this.layout.paneSizes[rightPaneId] = pairTotal - leftSize;
    this.persist();
    this.apply();
    event.preventDefault();
  }

  /** @param {KeyboardEvent} event @param {PaneId} paneId */
  reorderWithKeyboard(event, paneId) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const paneOrder = this.availablePaneOrder();
    const currentIndex = paneOrder.indexOf(paneId);
    const targetIndex = currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
    if (targetIndex < 1 || targetIndex >= paneOrder.length) return;
    this.layout.paneOrder = movePane(paneOrder, paneId, targetIndex);
    this.persist();
    this.apply();
    this.tabs.get(paneId)?.focus();
    event.preventDefault();
  }

  destroy() {
    this.removePointerListeners();
    if (this.resizeFrame !== null) {
      this.view.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    this.workspaceObserver?.disconnect();
    this.workspaceObserver = null;
    this.workspace.classList.remove('reordering-panes', 'lesson-pane-left');
    for (const property of [
      '--lesson-layout-pane-count',
      '--lesson-layout-pane-1',
      '--lesson-layout-pane-2',
      '--lesson-layout-pane-3',
    ]) {
      this.workspace.style.removeProperty(property);
    }
    for (const divider of this.dividers) divider.remove();
    for (const [paneId, tab] of this.tabs) {
      tab.remove();
      const pane = this.panes.get(paneId);
      pane?.classList.remove('lesson-layout-pane');
      pane?.removeAttribute('data-layout-position');
      pane?.style.removeProperty('order');
    }
    this.restoreCoach();
    this.restoreToolbar();
    this.dividers = [];
    this.tabs.clear();
    this.drag = null;
  }
}
