/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {Element | null}
 */
export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Resolve a DOM dependency that is required by a controller or composition.
 *
 * @template {Element} ElementType
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {ElementType}
 */
export function requireElement(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required DOM element not found: ${selector}`);
  return /** @type {ElementType} */ (element);
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement[]}
 */
export const $$ = (selector, root = document) =>
  /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}
