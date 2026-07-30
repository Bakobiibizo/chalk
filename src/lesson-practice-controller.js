import {
  isEraserPointer,
  pointFromPointerEvent,
  releaseCanvasPointer,
  renderPressureStroke,
  setCanvasToolAppearance,
} from './drawing-canvas.js';
import { removeSelectedStrokes, undoStroke } from './drawing-history.js';
import { canvasImageDataUrl } from './image-compositor.js';
import { currentLessonTime } from './lesson-runtime-factories.js';
import { SelectionEngine, strokePointBounds } from './selection-engine.js';
import {
  createDistanceSamplingStrategy,
  StrokeSession,
  StrokeSessionState,
} from './stroke-session.js';

/**
 * @typedef {import('./drawing-canvas.js').DrawingTool} DrawingTool
 * @typedef {import('./drawing-canvas.js').NormalizedPressurePoint} NormalizedPressurePoint
 * @typedef {import('./drawing-canvas.js').NormalizedStroke} NormalizedStroke
 * @typedef {import('./drawing-canvas.js').PixelPoint} PixelPoint
 * @typedef {import('./drawing-canvas.js').StrokeTool} StrokeTool
 * @typedef {import('./selection-engine.js').SelectionBounds} SelectionBounds
 *
 * @typedef {object} PracticeLesson
 * @property {NormalizedStroke[]} [practiceStrokes]
 * @property {number} [practiceCanvasHeight]
 * @property {string} [practiceUpdatedAt]
 *
 * @typedef {object} LessonPracticeControllerOptions
 * @property {PracticeLesson} lesson
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLElement} paper
 * @property {HTMLElement} emptyState
 * @property {HTMLElement} selectionBox
 * @property {HTMLButtonElement} undoButton
 * @property {HTMLButtonElement} clearButton
 * @property {Iterable<HTMLElement>} toolButtons
 * @property {HTMLElement} inputLabel
 * @property {() => void} persistLesson
 * @property {() => string} [createTimestamp]
 * @property {(message: string) => boolean} [confirmClear]
 *
 * @typedef {readonly [EventTarget, string, EventListener]} OwnedListener
 */

export class LessonPracticeController {
  /** @param {LessonPracticeControllerOptions} options */
  constructor({
    lesson,
    canvas,
    paper,
    emptyState,
    selectionBox,
    undoButton,
    clearButton,
    toolButtons,
    inputLabel,
    persistLesson,
    createTimestamp = () => currentLessonTime().toISOString(),
    confirmClear = (message) => globalThis.confirm(message),
  }) {
    this.lesson = lesson;
    this.canvas = canvas;
    this.paper = paper;
    this.emptyState = emptyState;
    this.undoButton = undoButton;
    this.clearButton = clearButton;
    this.inputLabel = inputLabel;
    this.persistLesson = persistLesson;
    this.createTimestamp = createTimestamp;
    this.confirmClear = confirmClear;
    this.toolButtons = [...toolButtons];
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Lesson practice canvas requires a 2D rendering context.');
    }
    this.context = context;
    /** @type {NormalizedStroke[]} */
    this.strokes = structuredClone(lesson.practiceStrokes || []);
    /** @type {DrawingTool} */
    this.tool = 'pen';
    this.selection = new SelectionEngine({
      selectionBox,
      getStrokes: () => this.strokes,
      pointFromEvent: (event) => this.pixelPoint(event),
      strokeBounds: (stroke) => this.strokeBounds(stroke),
      moveStroke: (stroke, dx, dy) => this.moveSelectedStroke(stroke, dx, dy),
      onMoved: () => {
        this.redraw();
        this.persist();
      },
    });
    this.strokeSession = new StrokeSession({
      coordinate: (event) => pointFromPointerEvent(this.canvas, event, { normalized: true }),
      constructStroke: ({ event }) => ({
        tool: /** @type {StrokeTool} */ (isEraserPointer(event) ? 'eraser' : this.tool),
        canvasHeight: this.canvas.getBoundingClientRect().height,
      }),
      sample: createDistanceSamplingStrategy({ minimumDistance: 0.0005 }),
      selection: {
        start: (event) => this.selection.start(event),
        move: (event) => this.selection.move(event),
        end: () => this.selection.end(),
      },
      render: (stroke) => this.drawStroke(stroke),
      persist: (stroke) => this.strokes.push(stroke),
    });
    /** @type {OwnedListener[]} */
    this.listeners = [
      [canvas, 'pointerdown', (event) => this.start(/** @type {PointerEvent} */ (event))],
      [canvas, 'pointermove', (event) => this.move(/** @type {PointerEvent} */ (event))],
      [canvas, 'pointerup', (event) => this.end(/** @type {PointerEvent} */ (event))],
      [canvas, 'pointercancel', (event) => this.end(/** @type {PointerEvent} */ (event))],
      [canvas, 'contextmenu', (event) => event.preventDefault()],
      [undoButton, 'click', () => this.undo()],
      [clearButton, 'click', () => this.clear()],
      ...this.toolButtons.map(
        (button) =>
          /** @type {OwnedListener} */ ([
            button,
            'click',
            () => this.setTool(/** @type {DrawingTool} */ (button.dataset.practiceTool)),
          ]),
      ),
    ];
    for (const [target, type, listener] of this.listeners) target.addEventListener(type, listener);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(paper);
    requestAnimationFrame(() => this.resize());
  }

  /**
   * @param {PointerEvent} event
   * @returns {PixelPoint}
   */
  pixelPoint(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /**
   * @param {NormalizedStroke} stroke
   * @returns {number}
   */
  drawingHeight(stroke) {
    const height = this.canvas.getBoundingClientRect().height;
    return Math.min(stroke.canvasHeight || height, height);
  }

  /**
   * @param {NormalizedStroke} stroke
   * @returns {SelectionBounds | null}
   */
  strokeBounds(stroke) {
    const bounds = this.canvas.getBoundingClientRect();
    const height = this.drawingHeight(stroke);
    return strokePointBounds(stroke, (point) => ({
      x: point.x * bounds.width,
      y: point.y * height,
    }));
  }

  /**
   * @param {NormalizedStroke} stroke
   * @param {number} dx
   * @param {number} dy
   */
  moveSelectedStroke(stroke, dx, dy) {
    const bounds = this.canvas.getBoundingClientRect();
    const height = this.drawingHeight(stroke);
    for (const point of stroke.points) {
      point.x += dx / bounds.width;
      point.y += dy / height;
    }
  }

  /** @param {NormalizedStroke} stroke */
  drawStroke(stroke) {
    const bounds = this.canvas.getBoundingClientRect();
    const height = this.drawingHeight(stroke);
    renderPressureStroke(this.context, stroke, {
      color: '#252522',
      mapPoint: (point) => ({ x: point.x * bounds.width, y: point.y * height }),
    });
  }

  redraw() {
    const bounds = this.canvas.getBoundingClientRect();
    const activeStroke = this.strokeSession.activeStroke;
    this.context.clearRect(0, 0, bounds.width, bounds.height);
    for (const stroke of this.strokes) this.drawStroke(stroke);
    if (activeStroke) this.drawStroke(activeStroke);
    this.emptyState.classList.toggle('hidden', this.strokes.length > 0 || Boolean(activeStroke));
    this.undoButton.disabled = this.strokes.length === 0;
  }

  resize() {
    const bounds = this.paper.getBoundingClientRect();
    const legacyHeight = this.lesson.practiceCanvasHeight || Math.max(520, innerHeight - 72);
    for (const stroke of this.strokes) stroke.canvasHeight ||= legacyHeight;
    this.lesson.practiceCanvasHeight ||= legacyHeight;
    const scale = Math.max(1, Math.min(2, devicePixelRatio || 1));
    this.canvas.width = Math.round(bounds.width * scale);
    this.canvas.height = Math.round(bounds.height * scale);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.redraw();
  }

  persist() {
    this.lesson.practiceStrokes = this.strokes;
    this.lesson.practiceUpdatedAt = this.createTimestamp();
    this.persistLesson();
  }

  /** @param {PointerEvent} event */
  start(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    const mode = this.tool === 'select' ? StrokeSessionState.SELECTING : StrokeSessionState.DRAWING;
    this.strokeSession.start(event, { mode });
    if (mode === StrokeSessionState.SELECTING) return;
    this.updateInputLabel(event);
    this.emptyState.classList.add('hidden');
  }

  /** @param {PointerEvent} event */
  move(event) {
    const mode = this.strokeSession.state.kind;
    if (mode === StrokeSessionState.IDLE) return;
    this.strokeSession.move(event);
    if (mode === StrokeSessionState.DRAWING && event.pointerType === 'pen')
      this.updateInputLabel(event);
  }

  /** @param {PointerEvent} event */
  end(event) {
    const result = this.strokeSession.end(event);
    if (!result) return;
    if (result.kind === StrokeSessionState.DRAWING) {
      this.inputLabel.textContent = 'Ready for pen';
      this.redraw();
      this.persist();
    }
    releaseCanvasPointer(this.canvas, event.pointerId);
  }

  /** @param {PointerEvent} event */
  updateInputLabel(event) {
    this.inputLabel.textContent =
      event.pointerType === 'pen'
        ? `Pen · ${Math.round(event.pressure * 100)}% pressure`
        : 'Drawing';
  }

  /** @param {DrawingTool} nextTool */
  setTool(nextTool) {
    this.tool = nextTool;
    for (const button of this.toolButtons)
      button.classList.toggle('active', button.dataset.practiceTool === nextTool);
    setCanvasToolAppearance(this.canvas, nextTool);
    if (nextTool !== 'select') this.selection.clear();
  }

  undo() {
    this.selection.clear();
    undoStroke(this.strokes);
    this.redraw();
    this.persist();
  }

  deleteSelection() {
    const remainingStrokes = removeSelectedStrokes(this.strokes, this.selection.selectedIndices);
    if (!remainingStrokes) return false;
    this.strokes = remainingStrokes;
    this.selection.clear();
    this.redraw();
    this.persist();
    return true;
  }

  clear() {
    if (this.strokes.length && !this.confirmClear('Clear this lesson practice page?')) return;
    this.selection.clear();
    this.strokes.length = 0;
    this.redraw();
    this.persist();
  }

  toImage() {
    return canvasImageDataUrl(this.canvas, {
      width: this.canvas.width,
      height: this.canvas.height,
    });
  }

  destroy() {
    this.resizeObserver.disconnect();
    for (const [target, type, listener] of this.listeners)
      target.removeEventListener(type, listener);
  }
}
