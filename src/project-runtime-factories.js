export const PROJECT_IDENTIFIER_KIND = Object.freeze({
  PAGE: 'page',
  PROJECT: 'project',
  IMPORTED_PROJECT: 'imported-project',
});

/** @typedef {typeof PROJECT_IDENTIFIER_KIND[keyof typeof PROJECT_IDENTIFIER_KIND]} ProjectIdentifierKind */

const IDENTIFIER_RANDOM_RANGES = Object.freeze({
  [PROJECT_IDENTIFIER_KIND.PAGE]: 10_000,
  [PROJECT_IDENTIFIER_KIND.PROJECT]: 1_000,
  [PROJECT_IDENTIFIER_KIND.IMPORTED_PROJECT]: 10_000,
});

/** @returns {Date} */
export function currentProjectTime() {
  return new Date();
}

/**
 * @param {ProjectIdentifierKind} kind
 * @returns {number}
 */
export function createRuntimeProjectIdentifier(kind) {
  const randomRange = IDENTIFIER_RANDOM_RANGES[kind];
  if (!randomRange) {
    throw new TypeError(`Unknown project identifier kind: ${kind}`);
  }
  return Date.now() + Math.floor(Math.random() * randomRange);
}
