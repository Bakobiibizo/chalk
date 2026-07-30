/**
 * @typedef {import('./drawing-canvas.js').CoordinatePoint} CoordinatePoint
 * @typedef {import('./drawing-canvas.js').PixelPoint} PixelPoint
 *
 * @typedef {object} SelectionBounds
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 *
 * @typedef {'box' | 'move'} SelectionMode
 *
 * @typedef {object} SelectionState
 * @property {number[]} indices
 * @property {SelectionMode | null} mode
 * @property {SelectionBounds | null} bounds
 * @property {PixelPoint | null} start
 * @property {number} dx
 * @property {number} dy
 */

/**
 * @template Stroke
 * @typedef {object} SelectionEngineOptions
 * @property {HTMLElement} selectionBox
 * @property {() => Stroke[]} getStrokes
 * @property {(event: PointerEvent) => PixelPoint} pointFromEvent
 * @property {(stroke: Stroke) => SelectionBounds | null} strokeBounds
 * @property {(stroke: Stroke, dx: number, dy: number) => void} moveStroke
 * @property {() => void} [onMoved]
 * @property {number} [padding]
 */

/**
 * @template {CoordinatePoint} Point
 * @param {{points: Point[]}} stroke
 * @param {(point: Point) => PixelPoint} [mapPoint]
 * @returns {SelectionBounds | null}
 */
export function strokePointBounds(stroke, mapPoint = (point) => point) {
  if (!stroke?.points.length) return null;
  const points = stroke.points.map(mapPoint);
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

/** @returns {SelectionState} */
const emptySelection = () => ({ indices: [], mode: null, bounds: null, start: null, dx: 0, dy: 0 });

/**
 * @param {SelectionBounds} first
 * @param {SelectionBounds} second
 * @returns {boolean}
 */
const intersects = (first, second) =>
  first.right >= second.left &&
  first.left <= second.right &&
  first.bottom >= second.top &&
  first.top <= second.bottom;

/**
 * @param {SelectionBounds | null} bounds
 * @returns {bounds is SelectionBounds}
 */
const hasBounds = (bounds) => bounds !== null;

/** @template Stroke */
export class SelectionEngine {
  /** @param {SelectionEngineOptions<Stroke>} options */
  constructor(options) {
    this.selectionBox = options.selectionBox;
    this.getStrokes = options.getStrokes;
    this.pointFromEvent = options.pointFromEvent;
    this.strokeBounds = options.strokeBounds;
    this.moveStroke = options.moveStroke;
    this.onMoved = options.onMoved;
    this.padding = options.padding ?? 6;
    /** @type {SelectionState} */
    this.state = emptySelection();
  }

  /** @returns {boolean} */
  get active() {
    return Boolean(this.state.mode);
  }

  /** @returns {number[]} */
  get selectedIndices() {
    return [...this.state.indices];
  }

  /**
   * @param {SelectionBounds | null} [bounds]
   * @param {number} [dx]
   * @param {number} [dy]
   */
  render(bounds = this.state.bounds, dx = 0, dy = 0) {
    if (!bounds) {
      this.selectionBox.classList.remove('show');
      return;
    }
    this.selectionBox.classList.add('show');
    Object.assign(this.selectionBox.style, {
      left: `${bounds.left + dx}px`,
      top: `${bounds.top + dy}px`,
      width: `${Math.max(1, bounds.right - bounds.left)}px`,
      height: `${Math.max(1, bounds.bottom - bounds.top)}px`,
    });
  }
  clear() {
    this.state = emptySelection();
    this.render(null);
  }

  /**
   * @param {readonly number[]} indices
   * @returns {SelectionBounds | null}
   */
  combinedBounds(indices) {
    const strokes = this.getStrokes();
    const bounds = indices.map((index) => this.strokeBounds(strokes[index])).filter(hasBounds);
    if (!bounds.length) return null;
    return {
      left: Math.min(...bounds.map((item) => item.left)) - this.padding,
      top: Math.min(...bounds.map((item) => item.top)) - this.padding,
      right: Math.max(...bounds.map((item) => item.right)) + this.padding,
      bottom: Math.max(...bounds.map((item) => item.bottom)) + this.padding,
    };
  }

  /** @param {PointerEvent} event */
  start(event) {
    const point = this.pointFromEvent(event);
    const bounds = this.state.bounds;
    const inside = Boolean(
      bounds &&
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom,
    );
    this.state.mode = inside && this.state.indices.length ? 'move' : 'box';
    this.state.start = point;
    this.state.dx = 0;
    this.state.dy = 0;
    if (!inside) {
      this.state.indices = [];
      this.state.bounds = { left: point.x, top: point.y, right: point.x, bottom: point.y };
    }
    this.render();
  }

  /** @param {PointerEvent} event */
  move(event) {
    if (!this.state.mode) return;
    const point = this.pointFromEvent(event);
    const start = this.state.start;
    if (!start) {
      throw new Error('Active selection must retain its starting point.');
    }
    if (this.state.mode === 'box') {
      this.state.bounds = {
        left: Math.min(start.x, point.x),
        top: Math.min(start.y, point.y),
        right: Math.max(start.x, point.x),
        bottom: Math.max(start.y, point.y),
      };
    } else {
      this.state.dx = point.x - start.x;
      this.state.dy = point.y - start.y;
    }
    this.render(this.state.bounds, this.state.dx, this.state.dy);
  }
  end() {
    const strokes = this.getStrokes();
    if (this.state.mode === 'box') {
      const area = this.state.bounds;
      if (!area) {
        throw new Error('Box selection must retain its bounds.');
      }
      this.state.indices = strokes
        .map((stroke, index) => {
          const bounds = this.strokeBounds(stroke);
          return bounds && intersects(bounds, area) ? index : -1;
        })
        .filter((index) => index >= 0);
      this.state.bounds = this.combinedBounds(this.state.indices);
    } else if (this.state.mode === 'move' && (this.state.dx || this.state.dy)) {
      for (const index of this.state.indices)
        this.moveStroke(strokes[index], this.state.dx, this.state.dy);
      this.state.bounds = this.combinedBounds(this.state.indices);
      this.onMoved?.();
    }
    this.state.mode = null;
    this.state.dx = 0;
    this.state.dy = 0;
    this.render();
  }
}
