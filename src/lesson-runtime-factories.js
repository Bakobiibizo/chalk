/** @returns {Date} */
export function currentLessonTime() {
  return new Date();
}

/** @returns {number} */
export function createRuntimeLessonIdentifier() {
  return Date.now();
}
