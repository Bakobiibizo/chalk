/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 *
 * @param {{
 *   prompt: string,
 *   sketch: {pageTitle: {value: string}},
 *   activeLesson: Lesson | null,
 *   pageImageDataURL: string,
 * }} options
 * @returns {{image: string, request: string}}
 */
export function buildCoachRequest({ prompt, sketch, activeLesson, pageImageDataURL }) {
  const lessonContext = activeLesson
    ? `
Active lesson content:
Title: ${activeLesson.title}
Topic: ${activeLesson.topic}
Explanation: ${activeLesson.explanation}
Example: ${activeLesson.example}
Practice: ${activeLesson.practice}
Hint: ${activeLesson.hint}`
    : '';

  return {
    image: pageImageDataURL,
    request: `The learner shared their handwritten page titled "${sketch.pageTitle.value}".${lessonContext}
Learner request: ${prompt}
Respond as a patient tutor. Be concise, use the visible work and lesson content as evidence, and prefer a useful next step over giving away the answer.`,
  };
}
