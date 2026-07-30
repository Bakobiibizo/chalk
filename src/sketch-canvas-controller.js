import { $, $$ } from './dom.js';
import {
  isEraserPointer,
  pointFromPointerEvent,
  releaseCanvasPointer,
  renderPressureStroke,
  setCanvasToolAppearance,
} from './drawing-canvas.js';
import { removeSelectedStrokes, undoStroke } from './drawing-history.js';
import { SelectionEngine, strokePointBounds } from './selection-engine.js';
import {
  createDistanceSamplingStrategy,
  StrokeSession,
  StrokeSessionState,
} from './stroke-session.js';

/**
 * @typedef {import('./drawing-canvas.js').DrawingTool} DrawingTool
 * @typedef {import('./drawing-canvas.js').PixelStroke} PixelStroke
 * @typedef {import('./drawing-canvas.js').StrokeTool} StrokeTool
 * @typedef {import('./project-payload-contract.js').ProjectCard} ProjectCard
 * @typedef {import('./project-payload-contract.js').ProjectPage} ProjectPage
 *
 * @typedef {object} SketchCanvasState
 * @property {DrawingTool} tool
 * @property {string} color
 * @property {number} size
 * @property {PixelStroke[]} strokes
 * @property {PixelStroke[]} redo
 *
 * @typedef {object} SketchCanvasControllerOptions
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLElement} paper
 * @property {HTMLElement} emptyState
 * @property {HTMLButtonElement} undoButton
 * @property {HTMLButtonElement} redoButton
 * @property {HTMLElement} inputStatus
 * @property {HTMLElement} selectionBox
 * @property {() => ProjectCard[]} getCards
 * @property {() => void} clearCards
 * @property {() => ProjectPage | null | undefined} getActivePage
 * @property {() => void} onSave
 * @property {(message: string) => void} onToast
 *
 * @typedef {object} OwnedListener
 * @property {EventTarget} target
 * @property {string} type
 * @property {EventListener} listener
 */

/**
 * @template {Element} ElementType
 * @param {string} selector
 * @returns {ElementType}
 */
function requiredElement(selector) {
  const element = $(selector);
  if (!element) {
    throw new Error(`Sketch canvas requires DOM element: ${selector}`);
  }
  return /** @type {ElementType} */ (element);
}

/**
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
function htmlElements(selector) {
  return /** @type {HTMLElement[]} */ ($$(selector));
}

export class SketchCanvasController {
  /** @param {SketchCanvasControllerOptions} options */
  constructor({
    canvas,
    paper,
    emptyState,
    undoButton,
    redoButton,
    inputStatus,
    selectionBox,
    getCards,
    clearCards,
    getActivePage,
    onSave,
    onToast,
  }) {
    this.canvas = canvas;
    this.paper = paper;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Sketch canvas requires a 2D rendering context.');
    }
    this.context = context;
    this.emptyState = emptyState;
    this.undoButton = undoButton;
    this.redoButton = redoButton;
    this.inputStatus = inputStatus;
    this.getCards = getCards;
    this.clearCards = clearCards;
    this.getActivePage = getActivePage;
    this.onSave = onSave;
    this.onToast = onToast;
    /** @type {SketchCanvasState} */
    this.state = {
      tool: 'pen',
      color: '#252522',
      size: 4,
      strokes: [],
      redo: [],
    };
    this.selectionEngine = new SelectionEngine({
      selectionBox,
      getStrokes: () => this.state.strokes,
      pointFromEvent: (event) => pointFromPointerEvent(this.canvas, event),
      strokeBounds: strokePointBounds,
      moveStroke: (stroke, dx, dy) =>
        stroke.points.forEach((point) => {
          point.x += dx;
          point.y += dy;
        }),
      onMoved: () => {
        this.redraw();
        this.onSave();
      },
    });
    this.strokeSession = new StrokeSession({
      coordinate: (event) => pointFromPointerEvent(this.canvas, event),
      constructStroke: ({ event }) => ({
        tool: /** @type {StrokeTool} */ (isEraserPointer(event) ? 'eraser' : this.state.tool),
        color: this.state.color,
        size: this.state.size,
      }),
      sample: createDistanceSamplingStrategy({ minimumDistance: 0.25 }),
      selection: {
        start: (event) => this.selectionEngine.start(event),
        move: (event) => this.selectionEngine.move(event),
        end: () => this.selectionEngine.end(),
      },
      render: (stroke) => renderPressureStroke(this.context, stroke),
      persist: (stroke) => this.persistStroke(stroke),
    });
    this.startStroke = this.startStroke.bind(this);
    this.moveStroke = this.moveStroke.bind(this);
    this.endStroke = this.endStroke.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    /** @type {OwnedListener[]} */
    this.listeners = [];
    this.initialized = false;
  }

  /**
   * @param {EventTarget} target
   * @param {string} type
   * @param {EventListener} listener
   */
  addListener(target, type, listener) {
    target.addEventListener(type, listener);
    this.listeners.push({ target, type, listener });
  }

  initialize() {
    if (this.initialized) return;
    this.addListener(this.canvas, 'pointerdown', (event) =>
      this.startStroke(/** @type {PointerEvent} */ (event)),
    );
    this.addListener(this.canvas, 'pointermove', (event) =>
      this.moveStroke(/** @type {PointerEvent} */ (event)),
    );
    this.addListener(this.canvas, 'pointerup', (event) =>
      this.endStroke(/** @type {PointerEvent} */ (event)),
    );
    this.addListener(this.canvas, 'pointercancel', (event) =>
      this.endStroke(/** @type {PointerEvent} */ (event)),
    );
    this.addListener(this.canvas, 'contextmenu', (event) => event.preventDefault());
    htmlElements('[data-tool]').forEach((button) =>
      this.addListener(button, 'click', () =>
        this.setTool(/** @type {DrawingTool} */ (button.dataset.tool)),
      ),
    );
    this.addListener(this.undoButton, 'click', () => this.undo());
    this.addListener(this.redoButton, 'click', () => this.redo());

    /** @type {HTMLElement} */
    const colorPopover = requiredElement('#color-popover');
    /** @type {HTMLElement} */
    const sizePopover = requiredElement('#size-popover');
    this.addListener(requiredElement('#color-tool'), 'click', (event) => {
      event.stopPropagation();
      colorPopover.classList.toggle('show');
      sizePopover.classList.remove('show');
    });
    this.addListener(requiredElement('#size-tool'), 'click', (event) => {
      event.stopPropagation();
      sizePopover.classList.toggle('show');
      colorPopover.classList.remove('show');
    });
    for (const popover of [colorPopover, sizePopover]) {
      this.addListener(popover, 'pointerdown', (event) => event.stopPropagation());
      this.addListener(popover, 'click', (event) => event.stopPropagation());
    }
    htmlElements('[data-color]').forEach((button) =>
      this.addListener(button, 'click', () => {
        this.state.color = button.dataset.color ?? this.state.color;
        /** @type {HTMLElement} */
        const colorDot = requiredElement('.color-dot');
        colorDot.style.background = this.state.color;
        colorDot.classList.toggle('adaptive-ink', button.hasAttribute('data-adaptive-ink'));
        htmlElements('[data-color]').forEach((item) =>
          item.classList.toggle('selected', item === button),
        );
        colorPopover.classList.remove('show');
        this.setTool('pen');
      }),
    );
    /** @type {HTMLInputElement} */
    const sizeRange = requiredElement('#size-range');
    this.addListener(sizeRange, 'input', () => this.setPenSize(sizeRange.value));
    this.addListener(sizeRange, 'change', () => this.setPenSize(sizeRange.value));
    this.setPenSize(this.state.size);
    this.addListener(document, 'click', this.handleDocumentClick);
    this.addListener(requiredElement('#grid-tool'), 'click', (event) => {
      this.paper.classList.toggle('grid');
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      target.classList.toggle('active');
    });
    this.addListener(requiredElement('#clear-page-tool'), 'click', () => this.clearPage());
    this.initialized = true;
  }

  handleDocumentClick() {
    requiredElement('#color-popover').classList.remove('show');
    requiredElement('#size-popover').classList.remove('show');
  }

  destroy() {
    if (!this.initialized) return;
    for (const { target, type, listener } of this.listeners)
      target.removeEventListener(type, listener);
    this.listeners = [];
    this.selectionEngine.clear();
    this.initialized = false;
  }

  resize() {
    const rect = this.paper.getBoundingClientRect();
    const scale = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * scale);
    this.canvas.height = Math.round(rect.height * scale);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.redraw();
  }

  redraw() {
    const rect = this.canvas.getBoundingClientRect();
    this.context.clearRect(0, 0, rect.width, rect.height);
    this.state.strokes.forEach((stroke) => renderPressureStroke(this.context, stroke));
    this.emptyState.classList.toggle(
      'hidden',
      this.state.strokes.length > 0 || this.getCards().length > 0,
    );
    this.undoButton.disabled = this.state.strokes.length === 0;
    this.redoButton.disabled = this.state.redo.length === 0;
  }

  /** @param {PointerEvent} event */
  startStroke(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    const mode =
      this.state.tool === 'select' ? StrokeSessionState.SELECTING : StrokeSessionState.DRAWING;
    this.strokeSession.start(event, { mode });
    if (mode === StrokeSessionState.SELECTING) return;
    this.state.redo = [];
    this.emptyState.classList.add('hidden');
    this.redoButton.disabled = true;
    this.inputStatus.innerHTML = `<i></i> ${event.pointerType === 'pen' ? `Pen · ${Math.round(event.pressure * 100)}% pressure` : 'Drawing'}`;
  }

  /** @param {PointerEvent} event */
  moveStroke(event) {
    const mode = this.strokeSession.state.kind;
    if (mode === StrokeSessionState.IDLE) return;
    this.strokeSession.move(event);
    if (mode === StrokeSessionState.DRAWING && event.pointerType === 'pen')
      this.inputStatus.innerHTML = `<i></i> Pen · ${Math.round(event.pressure * 100)}% pressure`;
  }

  /** @param {PointerEvent} event */
  endStroke(event) {
    const result = this.strokeSession.end(event);
    if (!result) return;
    releaseCanvasPointer(this.canvas, event.pointerId);
  }

  /** @param {PixelStroke} stroke */
  persistStroke(stroke) {
    this.state.strokes.push(stroke);
    this.inputStatus.innerHTML = '<i></i> Ready for pen';
    this.emptyState.classList.add('hidden');
    this.undoButton.disabled = this.state.strokes.length === 0;
    this.redoButton.disabled = true;
    this.onSave();
  }

  clearSelection() {
    this.selectionEngine.clear();
  }

  deleteSelection() {
    const remainingStrokes = removeSelectedStrokes(
      this.state.strokes,
      this.selectionEngine.selectedIndices,
    );
    if (!remainingStrokes) return false;
    this.state.strokes = remainingStrokes;
    this.state.redo = [];
    this.clearSelection();
    this.redraw();
    this.onSave();
    return true;
  }

  /** @param {DrawingTool} tool */
  setTool(tool) {
    this.state.tool = tool;
    htmlElements('[data-tool]').forEach((button) =>
      button.classList.toggle('active', button.dataset.tool === tool),
    );
    setCanvasToolAppearance(this.canvas, tool, { eraserSize: this.state.size });
    if (tool !== 'select') this.clearSelection();
  }

  /** @param {number | string} size */
  setPenSize(size) {
    this.state.size = Math.max(1, Math.min(12, Number(size)));
    /** @type {HTMLInputElement} */
    const sizeRange = requiredElement('#size-range');
    sizeRange.value = String(this.state.size);
    requiredElement('#size-value').textContent = String(this.state.size);
    /** @type {HTMLElement} */
    const sizeIndicator = requiredElement('.size-tool span');
    sizeIndicator.style.width = `${Math.min(15, this.state.size + 2)}px`;
    sizeIndicator.style.height = `${Math.min(15, this.state.size + 2)}px`;
    if (this.state.tool === 'eraser')
      setCanvasToolAppearance(this.canvas, this.state.tool, { eraserSize: this.state.size });
  }

  undo() {
    if (!this.state.strokes.length) return;
    this.clearSelection();
    undoStroke(this.state.strokes, this.state.redo);
    this.redraw();
    this.onSave();
  }

  redo() {
    if (!this.state.redo.length) return;
    this.clearSelection();
    const stroke = this.state.redo.pop();
    if (!stroke) return;
    this.state.strokes.push(stroke);
    this.redraw();
    this.onSave();
  }

  clearPage() {
    const page = this.getActivePage();
    if ((!this.state.strokes.length && !this.getCards().length) || !page) return;
    if (!confirm(`Clear everything from “${page.title}”?`)) return;
    this.clearSelection();
    this.state.strokes = [];
    this.state.redo = [];
    this.clearCards();
    this.redraw();
    this.onSave();
    this.onToast('Page cleared');
  }

  /** @param {PixelStroke[] | null | undefined} strokes */
  loadStrokes(strokes) {
    this.state.strokes = structuredClone(strokes || []);
    this.state.redo = [];
    this.clearSelection();
  }

  /** @returns {PixelStroke[]} */
  getStrokes() {
    return this.state.strokes;
  }

  /** @returns {number} */
  getPenSize() {
    return this.state.size;
  }
}
