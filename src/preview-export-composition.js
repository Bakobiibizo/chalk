import { canvasImageDataUrl, downloadCanvasPng } from './image-compositor.js';

/**
 * @typedef {import('./drawing-command-port.js').DrawingCommands} DrawingCommands
 * @typedef {import('./image-compositor.js').CanvasImageOptions} CanvasImageOptions
 * @typedef {import('./math-cards-controller.js').MathCardsController} MathCardsController
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 *
 * @typedef {object} PreviewExportComposition
 * @property {(scale?: number) => string} createPageImageDataURL
 * @property {() => void} initialize
 * @property {() => void} destroy
 */

/**
 * @param {{
 *   sketch: {
 *     canvas: HTMLCanvasElement,
 *     exportButton: HTMLButtonElement,
 *     pageTitle: HTMLInputElement,
 *   },
 *   mathCardsController: MathCardsController,
 *   projectStore: ProjectStore,
 *   drawingCommands: DrawingCommands,
 *   showToast: (message: string) => void,
 *   createImageDataUrl?: typeof canvasImageDataUrl,
 *   downloadPng?: typeof downloadCanvasPng,
 * }} options
 * @returns {PreviewExportComposition}
 */
export function composePreviewExport({
  sketch,
  mathCardsController,
  projectStore,
  drawingCommands,
  showToast,
  createImageDataUrl = canvasImageDataUrl,
  downloadPng = downloadCanvasPng,
}) {
  const { canvas, exportButton, pageTitle } = sketch;
  let initialized = false;
  const saveDrawing = () => void drawingCommands.saveDrawing();

  /**
   * @param {number} scale
   * @returns {CanvasImageOptions}
   */
  function imageOptions(scale) {
    const rect = canvas.getBoundingClientRect();
    return {
      cards: mathCardsController.getCards(),
      scale,
      width: rect.width,
      height: rect.height,
    };
  }

  function createPageImageDataURL(scale = 2) {
    return createImageDataUrl(canvas, imageOptions(scale));
  }

  function exportPage() {
    const exportName = `${pageTitle.value || 'chalk-project'}-${projectStore.activePage()?.title || 'page'}`;
    const filename = `${exportName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    downloadPng(canvas, filename, imageOptions(2));
    showToast('Page exported as PNG');
  }

  return {
    createPageImageDataURL,
    initialize() {
      if (initialized) return;
      initialized = true;
      exportButton.addEventListener('click', exportPage);
      pageTitle.addEventListener('change', saveDrawing);
    },
    destroy() {
      if (!initialized) return;
      initialized = false;
      exportButton.removeEventListener('click', exportPage);
      pageTitle.removeEventListener('change', saveDrawing);
    },
  };
}
