/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-store.js').LessonStore} LessonStore
 *
 * @typedef {object} ActiveLessonSelection
 * @property {(id: LessonIdentifier | null) => void} select
 * @property {() => void} clear
 * @property {() => Lesson | null} getActiveLesson
 */

/**
 * @param {{lessonStore: LessonStore}} options
 * @returns {ActiveLessonSelection}
 */
export function createActiveLessonSelection({ lessonStore }) {
  /** @type {LessonIdentifier | null} */
  let activeLessonId = null;

  return {
    select(id) {
      activeLessonId = id;
    },
    clear() {
      activeLessonId = null;
    },
    getActiveLesson() {
      if (activeLessonId === null) return null;
      return lessonStore.lessons.find((lesson) => lesson.id === activeLessonId) ?? null;
    },
  };
}
