/**
 * @typedef {import('./coach-contracts.js').CoachSession} CoachSession
 * @typedef {{
 *   x: number,
 *   y: number,
 *   left: number,
 *   top: number,
 *   width: number,
 *   height: number,
 * }} WidgetDrag
 */

export class FloatingWidgetController {
  /**
   * @param {{
   *   element: HTMLElement,
   *   handle: HTMLElement,
   *   getOwner: () => CoachSession | null,
   *   saveOwner: () => void,
   * }} options
   */
  constructor({ element, handle, getOwner, saveOwner }) {
    this.element = element;
    this.handle = handle;
    this.getOwner = getOwner;
    this.saveOwner = saveOwner;
    /** @type {WidgetDrag | null} */
    this.dragging = null;
    this.restoring = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.resizeTimer = null;
    this.startMoving = this.startMoving.bind(this);
    this.moveWidget = this.moveWidget.bind(this);
    this.stopMoving = this.stopMoving.bind(this);
    handle.addEventListener('pointerdown', this.startMoving);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDocked() || this.restoring || this.dragging || !element.getClientRects().length)
        return;
      if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.persistRect(), 180);
    });
    this.resizeObserver.observe(element);
    this.restore();
  }

  persistRect() {
    if (this.isDocked()) return;
    const owner = this.getOwner();
    if (!owner || !this.element.isConnected || !this.element.getClientRects().length) return;
    const rect = this.element.getBoundingClientRect();
    if (rect.width < 240 || rect.height < 220) return;
    owner.chatWidget = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    this.saveOwner();
  }

  restore() {
    if (this.isDocked()) return;
    this.restoring = true;
    const saved = this.getOwner()?.chatWidget;
    /** @type {readonly ('left' | 'top' | 'right' | 'bottom' | 'width' | 'height')[]} */
    const positionProperties = ['left', 'top', 'right', 'bottom', 'width', 'height'];
    for (const property of positionProperties) {
      this.element.style[property] = '';
    }
    this.element.classList.toggle('widget-positioned', Boolean(saved));
    if (saved) {
      const width = Math.min(Math.max(280, saved.width), innerWidth - 16);
      const height = Math.min(Math.max(300, saved.height), innerHeight - 16);
      this.element.style.width = `${width}px`;
      this.element.style.height = `${height}px`;
      this.element.style.left = `${Math.max(8, Math.min(saved.left, innerWidth - width - 8))}px`;
      this.element.style.top = `${Math.max(8, Math.min(saved.top, innerHeight - height - 8))}px`;
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
    }
    requestAnimationFrame(() => {
      this.restoring = false;
    });
  }

  /** @param {PointerEvent} event */
  startMoving(event) {
    if (
      this.isDocked() ||
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest('button, input, textarea, a'))
    ) {
      return;
    }
    const rect = this.element.getBoundingClientRect();
    this.dragging = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    this.element.classList.add('widget-positioned');
    this.handle.classList.add('dragging');
    Object.assign(this.element.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    window.addEventListener('pointermove', this.moveWidget);
    window.addEventListener('pointerup', this.stopMoving);
    window.addEventListener('pointercancel', this.stopMoving);
    this.handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  moveWidget(event) {
    if (!this.dragging) return;
    const left = Math.max(
      8,
      Math.min(
        this.dragging.left + event.clientX - this.dragging.x,
        innerWidth - this.dragging.width - 8,
      ),
    );
    const top = Math.max(
      8,
      Math.min(
        this.dragging.top + event.clientY - this.dragging.y,
        innerHeight - this.dragging.height - 8,
      ),
    );
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  isDocked() {
    return this.element.classList.contains('coach-panel-docked');
  }

  /** @param {PointerEvent} event */
  stopMoving(event) {
    if (!this.dragging) return;
    this.dragging = null;
    this.handle.classList.remove('dragging');
    window.removeEventListener('pointermove', this.moveWidget);
    window.removeEventListener('pointerup', this.stopMoving);
    window.removeEventListener('pointercancel', this.stopMoving);
    try {
      this.handle.releasePointerCapture(event.pointerId);
    } catch {}
    this.persistRect();
  }

  destroy() {
    this.dragging = null;
    this.handle.classList.remove('dragging');
    this.handle.removeEventListener('pointerdown', this.startMoving);
    window.removeEventListener('pointermove', this.moveWidget);
    window.removeEventListener('pointerup', this.stopMoving);
    window.removeEventListener('pointercancel', this.stopMoving);
    this.resizeObserver.disconnect();
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
  }
}
