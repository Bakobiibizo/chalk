import { lessonPrompt, parseLessonResponse } from './lesson-ai.js';
import { createRuntimeLessonIdentifier, currentLessonTime } from './lesson-runtime-factories.js';

/**
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-store.js').LessonStore} LessonStore
 *
 * @typedef {object} ModelJsonDesktopBridge
 * @property {(raw: string) => Promise<unknown>} [parseModelJson]
 *
 * @typedef {object} LessonGenerationElements
 * @property {HTMLFormElement} form
 * @property {HTMLInputElement | HTMLTextAreaElement} goal
 * @property {HTMLSelectElement} level
 * @property {HTMLElement} generating
 *
 * @typedef {object} LessonGenerationOptions
 * @property {LessonGenerationElements} lessons
 * @property {ModelJsonDesktopBridge | null | undefined} desktopBridge
 * @property {{run: (prompt: string, threadId: string | null) => Promise<string>}} coachService
 * @property {LessonStore} lessonStore
 * @property {() => void} clearError
 * @property {(message: string, detail?: string) => void} showError
 * @property {() => void} renderLessons
 * @property {() => void} renderLessonPicker
 * @property {() => void} hideLessonModal
 * @property {(id: LessonIdentifier) => void} openLesson
 * @property {typeof fetch} [fetchModelJson]
 * @property {() => LessonIdentifier} [createLessonId]
 * @property {() => string} [createTimestamp]
 *
 * @typedef {object} LessonGenerationComposition
 * @property {(raw: string) => Promise<unknown>} parseModelJson
 * @property {() => void} initialize
 * @property {() => void} destroy
 */

/**
 * @param {{
 *   desktopBridge: ModelJsonDesktopBridge | null | undefined,
 *   fetchModelJson?: typeof fetch,
 * }} options
 * @returns {(raw: string) => Promise<unknown>}
 */
export function createGristModelJsonParser({
  desktopBridge,
  fetchModelJson = (...arguments_) => fetch(...arguments_),
}) {
  return async function parseModelJson(raw) {
    if (desktopBridge?.parseModelJson) return desktopBridge.parseModelJson(raw);

    const response = await fetchModelJson('/grist/parse-model-json', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: String(raw || ''),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Grist JSON parser failed.');
    }
    return response.json();
  };
}

/**
 * @param {LessonGenerationOptions} options
 * @returns {LessonGenerationComposition}
 */
export function composeLessonGeneration({
  lessons,
  desktopBridge,
  coachService,
  lessonStore,
  clearError,
  showError,
  renderLessons,
  renderLessonPicker,
  hideLessonModal,
  openLesson,
  fetchModelJson,
  createLessonId = createRuntimeLessonIdentifier,
  createTimestamp = () => currentLessonTime().toISOString(),
}) {
  const parseModelJson = createGristModelJsonParser({ desktopBridge, fetchModelJson });
  let initialized = false;

  /** @param {SubmitEvent} event */
  const submitLessonGeneration = async (event) => {
    event.preventDefault();
    const goal = lessons.goal.value.trim();
    const level = lessons.level.value;
    clearError();
    lessons.form.style.display = 'none';
    lessons.generating.classList.add('show');
    try {
      const response = await coachService.run(lessonPrompt(goal, level), null);
      const content = await parseLessonResponse(response, parseModelJson);
      lessonStore.prepend({
        ...content,
        id: createLessonId(),
        level,
        completed: false,
        createdAt: createTimestamp(),
      });
      renderLessons();
      renderLessonPicker();
      hideLessonModal();
      lessons.goal.value = '';
      openLesson(lessonStore.lessons[0].id);
    } catch (error) {
      lessons.generating.classList.remove('show');
      lessons.form.style.display = '';
      showError(
        'Lesson generation failed',
        `${error instanceof Error ? error.message : String(error)} If this was a large plan, try splitting it into a few smaller lessons.`,
      );
    }
  };

  return {
    parseModelJson,

    initialize() {
      if (initialized) return;
      initialized = true;
      lessons.form.addEventListener('submit', submitLessonGeneration);
    },

    destroy() {
      if (!initialized) return;
      initialized = false;
      lessons.form.removeEventListener('submit', submitLessonGeneration);
    },
  };
}
