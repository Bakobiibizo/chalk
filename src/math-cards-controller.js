import { escapeHtml } from './dom.js';
import { createRuntimeMathCardIdentifier } from './math-card-runtime-factories.js';

/**
 * @typedef {import('./project-payload-contract.js').ProjectCard} ProjectCard
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} ProjectIdentifier
 */

export class MathCardsController {
  /**
   * @param {{
   *   container: HTMLElement,
   *   paper: HTMLElement,
   *   initialCards?: readonly ProjectCard[],
   *   onPersist: () => void,
   *   onChange: () => void,
   *   createIdentifier?: () => ProjectIdentifier,
   * }} options
   */
  constructor({
    container,
    paper,
    initialCards = [],
    onPersist,
    onChange,
    createIdentifier = createRuntimeMathCardIdentifier,
  }) {
    this.container = container;
    this.paper = paper;
    /** @type {ProjectCard[]} */
    this.cards = structuredClone([...initialCards]);
    this.onPersist = onPersist;
    this.onChange = onChange;
    this.createIdentifier = createIdentifier;
  }

  getCards() {
    return this.cards;
  }

  /** @param {readonly ProjectCard[]} cards */
  setCards(cards) {
    this.cards = structuredClone([...cards]);
    this.render();
  }

  clear() {
    this.cards = [];
    this.render();
  }

  /** @param {Pick<ProjectCard, 'expression' | 'result'>} result */
  pin(result) {
    const offset = this.cards.length * 18;
    this.cards.push({
      ...result,
      id: this.createIdentifier(),
      x: Math.min(68, 18 + (offset / this.paper.clientWidth) * 100),
      y: Math.min(70, 16 + (offset / this.paper.clientHeight) * 100),
    });
    this.persistAndNotify();
    this.render();
  }

  render() {
    this.container.innerHTML = this.cards
      .map(
        (card) => `
      <div class="math-card" data-card="${card.id}" style="left:${card.x}%;top:${card.y}%">
        <button class="delete-card" aria-label="Delete calculation">×</button>
        <span class="card-expression">${escapeHtml(card.expression)}</span>
        <span class="card-result">= ${escapeHtml(card.result)}</span>
      </div>
    `,
      )
      .join('');
    this.container.querySelectorAll('.delete-card').forEach((button) =>
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const cardElement = /** @type {HTMLElement | null} */ (button.closest('.math-card'));
        if (!cardElement) return;
        const id = Number(cardElement.dataset.card);
        this.cards = this.cards.filter((card) => card.id !== id);
        this.persistAndNotify();
        this.render();
      }),
    );
    this.container
      .querySelectorAll('.math-card')
      .forEach((card) => this.enableDrag(/** @type {HTMLElement} */ (card)));
  }

  persistAndNotify() {
    this.onPersist();
    this.onChange();
  }

  /** @param {HTMLElement} cardElement */
  enableDrag(cardElement) {
    cardElement.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.matches('button')) return;
      event.preventDefault();
      cardElement.setPointerCapture(event.pointerId);
      const paperRect = this.paper.getBoundingClientRect();
      const cardRect = cardElement.getBoundingClientRect();
      const offsetX = event.clientX - cardRect.left;
      const offsetY = event.clientY - cardRect.top;
      /** @param {PointerEvent} moveEvent */
      const move = (moveEvent) => {
        const x = Math.max(
          0,
          Math.min(paperRect.width - cardRect.width, moveEvent.clientX - paperRect.left - offsetX),
        );
        const y = Math.max(
          0,
          Math.min(paperRect.height - cardRect.height, moveEvent.clientY - paperRect.top - offsetY),
        );
        cardElement.style.left = `${x}px`;
        cardElement.style.top = `${y}px`;
      };
      const up = () => {
        const card = this.cards.find((item) => String(item.id) === cardElement.dataset.card);
        if (card) {
          card.x = (parseFloat(cardElement.style.left) / paperRect.width) * 100;
          card.y = (parseFloat(cardElement.style.top) / paperRect.height) * 100;
          this.onPersist();
        }
        cardElement.removeEventListener('pointermove', move);
        cardElement.removeEventListener('pointerup', up);
      };
      cardElement.addEventListener('pointermove', move);
      cardElement.addEventListener('pointerup', up);
    });
  }
}
