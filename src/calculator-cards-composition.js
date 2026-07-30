import { CalculatorPanelController } from './calculator-panel-controller.js';
import { MathCardsController } from './math-cards-controller.js';
import { parseLegacyCardPayload } from './project-payload-contract.js';

/**
 * @typedef {import('./drawing-command-port.js').DrawingCommands} DrawingCommands
 *
 * @typedef {object} CalculatorAndCardsComposition
 * @property {MathCardsController} cards
 * @property {CalculatorPanelController} calculator
 * @property {() => void} initialize
 * @property {() => void} destroy
 */

/**
 * @param {{
 *   $: (selector: string) => HTMLElement,
 *   paper: HTMLElement,
 *   drawingCommands: DrawingCommands,
 *   showToast: (message: string) => void,
 * }} options
 * @returns {CalculatorAndCardsComposition}
 */
export function composeCalculatorAndCards({ $, paper, drawingCommands, showToast }) {
  /** @type {unknown} */
  const storedCards = JSON.parse(localStorage.getItem('chalk-cards') || '[]');
  const cards = new MathCardsController({
    container: $('#math-cards'),
    paper,
    initialCards: parseLegacyCardPayload(storedCards),
    onPersist: () => void drawingCommands.saveDrawing(),
    onChange: () => void drawingCommands.redraw(),
  });
  const calculator = new CalculatorPanelController({
    onPinResult: (result) => {
      cards.pin(result);
      showToast('Calculation added to the page');
    },
  });
  return {
    cards,
    calculator,
    initialize() {
      calculator.initialize();
    },
    destroy() {
      calculator.destroy();
    },
  };
}
