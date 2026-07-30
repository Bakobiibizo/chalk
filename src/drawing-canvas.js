/**
 * @typedef {object} CoordinatePoint
 * @property {number} x
 * @property {number} y
 *
 * PixelPoint and NormalizedPoint use optional phantom fields so strict checking
 * rejects accidental cross-space assignment without changing persisted objects.
 *
 * @typedef {CoordinatePoint & {readonly __coordinateSpace?: 'pixel'}} PixelPoint
 * @typedef {CoordinatePoint & {readonly __coordinateSpace?: 'normalized'}} NormalizedPoint
 *
 * @typedef {CoordinatePoint & {pressure: number}} PressurePoint
 * @typedef {PixelPoint & {pressure: number}} PixelPressurePoint
 * @typedef {NormalizedPoint & {pressure: number}} NormalizedPressurePoint
 *
 * @typedef {'pen' | 'eraser'} StrokeTool
 * @typedef {StrokeTool | 'select'} DrawingTool
 *
 * @typedef {object} StrokeStyle
 * @property {StrokeTool} tool
 * @property {number} [size]
 * @property {string} [color]
 * @property {number} [canvasHeight]
 */

/**
 * @template {PressurePoint} Point
 * @typedef {StrokeStyle & {points: Point[]}} PressureStroke
 */

/**
 * @typedef {PressureStroke<PixelPressurePoint>} PixelStroke
 * @typedef {PressureStroke<NormalizedPressurePoint>} NormalizedStroke
 *
 * @typedef {object} PointerPressureEvent
 * @property {string} pointerType
 * @property {number} pressure
 */

/**
 * @typedef {object} PressureStrokeContext
 * @property {string} lineCap
 * @property {string} lineJoin
 * @property {string} globalCompositeOperation
 * @property {string | CanvasGradient | CanvasPattern} strokeStyle
 * @property {string | CanvasGradient | CanvasPattern} fillStyle
 * @property {number} lineWidth
 * @property {() => void} save
 * @property {() => void} restore
 * @property {() => void} beginPath
 * @property {(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void} arc
 * @property {() => void} fill
 * @property {(x: number, y: number) => void} moveTo
 * @property {(x: number, y: number) => void} lineTo
 * @property {() => void} stroke
 */

/**
 * @param {PointerPressureEvent} event
 * @returns {number}
 */
export function pointerPressure(event) {
  return event.pointerType === 'mouse' ? 0.55 : Math.max(event.pressure, 0.08);
}

/**
 * @overload
 * @param {{getBoundingClientRect: () => {left: number, top: number, width: number, height: number}}} canvas
 * @param {PointerPressureEvent & {clientX: number, clientY: number}} event
 * @param {{normalized: true}} options
 * @returns {NormalizedPressurePoint}
 */

/**
 * @overload
 * @param {{getBoundingClientRect: () => {left: number, top: number, width: number, height: number}}} canvas
 * @param {PointerPressureEvent & {clientX: number, clientY: number}} event
 * @param {{normalized?: false}} [options]
 * @returns {PixelPressurePoint}
 */

/**
 * @param {{getBoundingClientRect: () => {left: number, top: number, width: number, height: number}}} canvas
 * @param {PointerPressureEvent & {clientX: number, clientY: number}} event
 * @param {{normalized?: boolean}} [options]
 * @returns {PixelPressurePoint | NormalizedPressurePoint}
 */
export function pointFromPointerEvent(canvas, event, { normalized = false } = {}) {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  return {
    x: normalized ? x / bounds.width : x,
    y: normalized ? y / bounds.height : y,
    pressure: pointerPressure(event),
  };
}

/**
 * @param {{pointerType: string, button: number, buttons: number}} event
 * @returns {boolean}
 */
export function isEraserPointer(event) {
  return event.pointerType === 'pen' && (event.button === 5 || event.buttons === 32);
}

/**
 * @param {number} penWidth
 * @returns {number}
 */
export function eraserWidth(penWidth) {
  return penWidth + 2;
}

/**
 * @param {number} width
 * @returns {string}
 */
export function eraserCursor(width) {
  const diameter = Math.ceil(width);
  const padding = 2;
  const size = diameter + padding * 2;
  const center = size / 2;
  const radius = diameter / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#252522" stroke-width="1"/><circle cx="${center}" cy="${center}" r="${radius + 1}" fill="none" stroke="white" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}

/**
 * @param {{classList: {toggle: (token: string, force?: boolean) => boolean}, style: {cursor: string}}} canvas
 * @param {string} tool
 * @param {{eraserSize?: number}} [options]
 */
export function setCanvasToolAppearance(canvas, tool, { eraserSize = 4 } = {}) {
  canvas.classList.toggle('eraser', tool === 'eraser');
  canvas.classList.toggle('selecting', tool === 'select');
  canvas.style.cursor = tool === 'eraser' ? eraserCursor(eraserWidth(eraserSize)) : '';
}

/**
 * @param {{releasePointerCapture: (pointerId: number) => void}} canvas
 * @param {number} pointerId
 */
export function releaseCanvasPointer(canvas, pointerId) {
  try {
    canvas.releasePointerCapture(pointerId);
  } catch {}
}

/**
 * @param {StrokeStyle} stroke
 * @param {Pick<PressurePoint, 'pressure'>} point
 * @param {{size?: number, eraserWidth?: number}} [options]
 * @returns {number}
 */
export function pressureStrokeWidth(
  stroke,
  point,
  { size = stroke.size ?? 4, eraserWidth: effectiveEraserWidth } = {},
) {
  if (stroke.tool === 'eraser') return effectiveEraserWidth ?? eraserWidth(size);
  return size * (0.45 + point.pressure * 1.05);
}

/**
 * @template {PressurePoint} Point
 * @param {PressureStrokeContext} context
 * @param {PressureStroke<Point>} stroke
 * @param {{
 *   color?: string | CanvasGradient | CanvasPattern,
 *   mapPoint?: (point: Point) => CoordinatePoint,
 *   size?: number,
 *   eraserWidth?: number
 * }} [options]
 */
export function renderPressureStroke(
  context,
  stroke,
  {
    color = stroke.color ?? '#252522',
    mapPoint = (point) => point,
    size = stroke.size ?? 4,
    eraserWidth,
  } = {},
) {
  if (!stroke?.points.length) return;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.fillStyle = color;

  if (stroke.points.length === 1) {
    const sourcePoint = stroke.points[0];
    const point = mapPoint(sourcePoint);
    context.beginPath();
    context.arc(
      point.x,
      point.y,
      pressureStrokeWidth(stroke, sourcePoint, { size, eraserWidth }) / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    for (let index = 1; index < stroke.points.length; index++) {
      const previousSource = stroke.points[index - 1];
      const currentSource = stroke.points[index];
      const previous = mapPoint(previousSource);
      const current = mapPoint(currentSource);
      context.beginPath();
      context.lineWidth =
        (pressureStrokeWidth(stroke, previousSource, { size, eraserWidth }) +
          pressureStrokeWidth(stroke, currentSource, { size, eraserWidth })) /
        2;
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
  }
  context.restore();
}
