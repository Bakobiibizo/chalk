/**
 * @typedef {import('./drawing-canvas.js').PressurePoint} PressurePoint
 * @typedef {import('./drawing-canvas.js').StrokeStyle} StrokeMetadata
 * @typedef {'idle' | 'drawing' | 'selecting'} StrokeSessionKind
 * @typedef {'drawing' | 'selecting'} StrokeSessionMode
 * @typedef {'start' | 'sample'} StrokeRenderPhase
 * @typedef {Readonly<{kind: 'idle'}>} IdleStrokeSessionState
 * @typedef {Readonly<{kind: 'selecting'}>} SelectingStrokeSessionState
 */

/**
 * @template {PressurePoint} Point
 * @typedef {StrokeMetadata & {points: Point[]}} SessionStroke
 */

/**
 * @template {PressurePoint} Point
 * @typedef {Readonly<{kind: 'drawing', stroke: SessionStroke<Point>}>} DrawingStrokeSessionState
 */

/**
 * @template {PressurePoint} Point
 * @typedef {IdleStrokeSessionState | SelectingStrokeSessionState | DrawingStrokeSessionState<Point>} StrokeSessionValue
 */

/**
 * @template {PressurePoint} Point
 * @typedef {object} StrokeSamplingContext
 * @property {PointerEvent} event
 * @property {SessionStroke<Point>} stroke
 * @property {Point} previousPoint
 * @property {(event: PointerEvent) => Point} coordinate
 */

/**
 * @template {PressurePoint} Point
 * @typedef {(context: StrokeSamplingContext<Point>) => Point[]} StrokeSamplingStrategy
 */

/**
 * @typedef {object} StrokeSelectionStrategy
 * @property {(event: PointerEvent) => void} start
 * @property {(event: PointerEvent) => void} move
 * @property {(event: PointerEvent) => void} end
 */

/**
 * @template {PressurePoint} Point
 * @typedef {object} StrokeSessionStrategies
 * @property {(event: PointerEvent) => Point} coordinate
 * @property {(context: {event: PointerEvent, initialPoint: Point}) => StrokeMetadata} constructStroke
 * @property {StrokeSamplingStrategy<Point>} sample
 * @property {StrokeSelectionStrategy} selection
 * @property {(stroke: SessionStroke<Point>, context: {phase: StrokeRenderPhase, event: PointerEvent, stroke: SessionStroke<Point>}) => void} render
 * @property {(stroke: SessionStroke<Point>, context: {event: PointerEvent}) => void} persist
 */

/**
 * @template {PressurePoint} Point
 * @typedef {{kind: 'selecting'} | {kind: 'drawing', stroke: SessionStroke<Point>}} StrokeSessionEndResult
 */

export const StrokeSessionState = Object.freeze({
  IDLE: 'idle',
  DRAWING: 'drawing',
  SELECTING: 'selecting',
});

/** @type {IdleStrokeSessionState} */
const idleState = Object.freeze({ kind: StrokeSessionState.IDLE });
/** @type {SelectingStrokeSessionState} */
const selectingState = Object.freeze({ kind: StrokeSessionState.SELECTING });

/**
 * @param {string} name
 * @param {unknown} value
 */
function requireFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`Stroke session ${name} strategy must be a function.`);
  }
}

/** @param {StrokeSelectionStrategy} selection */
function requireSelectionStrategy(selection) {
  if (!selection || typeof selection !== 'object') {
    throw new TypeError('Stroke session selection strategy must be an object.');
  }
  requireFunction('selection.start', selection.start);
  requireFunction('selection.move', selection.move);
  requireFunction('selection.end', selection.end);
}

/**
 * @template {PressurePoint} Point
 * @param {Point} point
 * @param {string} strategyName
 * @returns {Point}
 */
function requirePoint(point, strategyName) {
  if (
    !point ||
    typeof point !== 'object' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    throw new TypeError(
      `Stroke session ${strategyName} strategy must return a point with finite x and y values.`,
    );
  }
  return point;
}

/**
 * @param {unknown} metadata
 * @returns {StrokeMetadata}
 */
function requireStrokeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('Stroke construction strategy must return a stroke metadata object.');
  }
  if (Object.hasOwn(metadata, 'points')) {
    throw new TypeError('Stroke construction strategy must not define session-owned points.');
  }
  return /** @type {StrokeMetadata} */ (metadata);
}

/**
 * @template {PressurePoint} Point
 * @param {{minimumDistance: number}} options
 * @returns {StrokeSamplingStrategy<Point>}
 */
export function createDistanceSamplingStrategy({ minimumDistance }) {
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0) {
    throw new TypeError('Stroke sampling minimumDistance must be a non-negative finite number.');
  }

  return ({ event, previousPoint, coordinate }) => {
    const pointerEvents = event.getCoalescedEvents?.() ?? [event];
    /** @type {Point[]} */
    const points = [];
    let latestPoint = previousPoint;

    for (const pointerEvent of pointerEvents) {
      const point = coordinate(pointerEvent);
      if (Math.hypot(point.x - latestPoint.x, point.y - latestPoint.y) > minimumDistance) {
        points.push(point);
        latestPoint = point;
      }
    }

    return points;
  };
}

/** @template {PressurePoint} Point */
export class StrokeSession {
  /** @type {StrokeSessionValue<Point>} */
  #state = idleState;

  /** @param {StrokeSessionStrategies<Point>} strategies */
  constructor({ coordinate, constructStroke, sample, selection, render, persist }) {
    requireFunction('coordinate', coordinate);
    requireFunction('stroke construction', constructStroke);
    requireFunction('sampling', sample);
    requireSelectionStrategy(selection);
    requireFunction('render', render);
    requireFunction('persistence', persist);

    /** @type {(event: PointerEvent) => Point} */
    this.coordinate = (event) => requirePoint(coordinate(event), 'coordinate');
    this.constructStroke = constructStroke;
    this.sample = sample;
    this.selection = selection;
    this.render = render;
    this.persist = persist;
  }

  /** @returns {StrokeSessionValue<Point>} */
  get state() {
    return this.#state;
  }

  /** @returns {SessionStroke<Point> | null} */
  get activeStroke() {
    return this.#state.kind === StrokeSessionState.DRAWING ? this.#state.stroke : null;
  }

  /**
   * @param {PointerEvent} event
   * @param {{mode?: StrokeSessionMode}} [options]
   * @returns {StrokeSessionValue<Point>}
   */
  start(event, { mode = StrokeSessionState.DRAWING } = {}) {
    this.#requireIdle('start');

    if (mode === StrokeSessionState.SELECTING) {
      this.#state = selectingState;
      try {
        this.selection.start(event);
      } catch (error) {
        this.#state = idleState;
        throw error;
      }
      return this.#state;
    }
    if (mode !== StrokeSessionState.DRAWING) {
      throw new RangeError(`Unknown stroke session mode: ${mode}`);
    }

    const initialPoint = this.coordinate(event);
    const metadata = requireStrokeMetadata(
      this.constructStroke({
        event,
        initialPoint,
      }),
    );
    /** @type {SessionStroke<Point>} */
    const stroke = { ...metadata, points: [initialPoint] };
    this.#state = Object.freeze({
      kind: StrokeSessionState.DRAWING,
      stroke,
    });
    try {
      this.render(stroke, {
        phase: 'start',
        event,
        stroke,
      });
    } catch (error) {
      this.#state = idleState;
      throw error;
    }
    return this.#state;
  }

  /**
   * @param {PointerEvent} event
   * @returns {boolean}
   */
  move(event) {
    if (this.#state.kind === StrokeSessionState.IDLE) return false;
    if (this.#state.kind === StrokeSessionState.SELECTING) {
      this.selection.move(event);
      return true;
    }

    const stroke = this.#state.stroke;
    const previousPointCount = stroke.points.length;
    const previousPoint = stroke.points.at(-1);
    if (!previousPoint) {
      throw new Error('Drawing stroke must retain its initial point.');
    }
    const sampledPoints = this.sample({
      event,
      stroke,
      previousPoint,
      coordinate: this.coordinate,
    });
    if (!Array.isArray(sampledPoints)) {
      throw new TypeError('Stroke sampling strategy must return an array of points.');
    }
    const points = sampledPoints.map((point) => requirePoint(point, 'sampling'));
    if (!points.length) return false;

    stroke.points.push(...points);
    this.render(
      {
        ...stroke,
        points: stroke.points.slice(Math.max(0, previousPointCount - 1)),
      },
      {
        phase: 'sample',
        event,
        stroke,
      },
    );
    return true;
  }

  /**
   * @param {PointerEvent} event
   * @returns {StrokeSessionEndResult<Point> | null}
   */
  end(event) {
    if (this.#state.kind === StrokeSessionState.IDLE) return null;
    if (this.#state.kind === StrokeSessionState.SELECTING) {
      this.selection.end(event);
      this.#state = idleState;
      return { kind: StrokeSessionState.SELECTING };
    }

    const stroke = this.#state.stroke;
    this.persist(stroke, { event });
    this.#state = idleState;
    return {
      kind: StrokeSessionState.DRAWING,
      stroke,
    };
  }

  /** @param {string} action */
  #requireIdle(action) {
    if (this.#state.kind !== StrokeSessionState.IDLE) {
      throw new Error(`Cannot ${action} while stroke session is ${this.#state.kind}.`);
    }
  }
}
