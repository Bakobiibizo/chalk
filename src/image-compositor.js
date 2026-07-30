const PAGE_BACKGROUND = '#fffefa';

/**
 * @typedef {import('./project-payload-contract.js').ProjectCard} ProjectCard
 *
 * @typedef {object} CanvasImageOptions
 * @property {readonly ProjectCard[]} [cards]
 * @property {number} [scale]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [background]
 *
 * @typedef {object} MathCardDrawingOptions
 * @property {number} [cardWidth]
 * @property {number} [cardHeight]
 */

/**
 * @param {CanvasRenderingContext2D} context
 * @param {readonly ProjectCard[]} cards
 * @param {number} width
 * @param {number} height
 * @param {MathCardDrawingOptions} [options]
 */
export function drawMathCards(
  context,
  cards,
  width,
  height,
  { cardWidth = 155, cardHeight = 68 } = {},
) {
  for (const card of cards) {
    const x = (Number(card.x) / 100) * width;
    const y = (Number(card.y) / 100) * height;
    context.fillStyle = '#fff9d9';
    context.strokeStyle = '#e5dca7';
    context.lineWidth = 1;
    context.fillRect(x, y, cardWidth, cardHeight);
    context.strokeRect(x, y, cardWidth, cardHeight);
    context.fillStyle = '#837c60';
    context.font = '10px sans-serif';
    context.fillText(card.expression, x + 14, y + 20);
    context.fillStyle = '#24241f';
    context.font = '24px Georgia';
    context.fillText(`= ${card.result}`, x + 14, y + 49);
  }
}

/**
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {CanvasImageOptions} [options]
 * @returns {HTMLCanvasElement}
 */
export function composeCanvasImage(
  sourceCanvas,
  {
    cards = [],
    scale = 1,
    width = sourceCanvas.getBoundingClientRect().width,
    height = sourceCanvas.getBoundingClientRect().height,
    background = PAGE_BACKGROUND,
  } = {},
) {
  const output = document.createElement('canvas');
  output.width = Math.round(width * scale);
  output.height = Math.round(height * scale);
  const context = output.getContext('2d');
  if (!context) {
    throw new Error('Canvas image composition requires a 2D rendering context.');
  }
  context.scale(scale, scale);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
  drawMathCards(context, cards, width, height);
  return output;
}

/**
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {CanvasImageOptions} [options]
 * @returns {string}
 */
export function canvasImageDataUrl(sourceCanvas, options) {
  return composeCanvasImage(sourceCanvas, options).toDataURL('image/png');
}

/**
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} filename
 * @param {CanvasImageOptions} [options]
 */
export function downloadCanvasPng(sourceCanvas, filename, options) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvasImageDataUrl(sourceCanvas, options);
  link.click();
}
