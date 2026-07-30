/** @returns {Date} */
export function currentCoachTime() {
  return new Date();
}

/** @returns {number} */
export function createRuntimeCoachIdentifier() {
  return Date.now() + Math.floor(Math.random() * 100_000);
}
