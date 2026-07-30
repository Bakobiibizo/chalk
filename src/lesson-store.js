import { downloadJson, logStorageDiagnostic, reportStorageFailure } from './storage.js';
import {
  LESSON_EXPORT_VERSION,
  parseLessonExportPayload,
  parseLessonInput,
  parseLessonJson,
  parseLessonsForExport,
  parsePersistedLessonPayload,
} from './lesson-payload-contract.js';
import { createRuntimeLessonIdentifier, currentLessonTime } from './lesson-runtime-factories.js';

/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./storage.js').JsonStorage} JsonStorage
 * @typedef {import('./storage.js').StorageDiagnostic} StorageDiagnostic
 * @typedef {import('./storage.js').StorageOperation} StorageOperation
 *
 * @typedef {object} LessonStoreOptions
 * @property {() => Date} [now]
 * @property {() => number} [createIdentifier]
 * @property {(diagnostic: StorageDiagnostic) => void} [onDiagnostic]
 */

const STORAGE_KEY = 'chalk-lessons';
const LESSON_STORAGE_BOUNDARY = 'lesson storage';

export class LessonStore {
  /**
   * @param {JsonStorage} [storage]
   * @param {LessonStoreOptions} [options]
   */
  constructor(
    storage = localStorage,
    {
      now = currentLessonTime,
      createIdentifier = createRuntimeLessonIdentifier,
      onDiagnostic = logStorageDiagnostic,
    } = {},
  ) {
    this.storage = storage;
    this.now = now;
    this.createIdentifier = createIdentifier;
    this.onDiagnostic = onDiagnostic;
    /** @type {{lessons: Lesson[]}} */
    this.state = { lessons: this.#load() };
  }

  /** @returns {Lesson[]} */
  #load() {
    /** @type {string | null} */
    let serialized;
    try {
      serialized = this.storage.getItem(STORAGE_KEY);
    } catch (error) {
      this.#reportStorageFailure('read', error);
      throw error;
    }
    if (serialized === null) return [];
    try {
      return parsePersistedLessonPayload(parseLessonJson(serialized, LESSON_STORAGE_BOUNDARY));
    } catch (error) {
      this.#reportStorageFailure('parse', error);
      throw error;
    }
  }

  /** @returns {Lesson[]} */
  get lessons() {
    return this.state.lessons;
  }

  /**
   * @param {LessonIdentifier} id
   * @returns {Lesson | null}
   */
  find(id) {
    return this.state.lessons.find((lesson) => lesson.id === id) ?? null;
  }

  /**
   * @param {LessonIdentifier} id
   * @returns {Lesson | null}
   */
  toggleCompleted(id) {
    const lesson = this.find(id);
    if (!lesson) return null;
    lesson.completed = !lesson.completed;
    this.save();
    return lesson;
  }

  /** @returns {true} */
  save() {
    const normalized = parsePersistedLessonPayload(this.state.lessons);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return true;
    } catch (error) {
      this.#reportStorageFailure('write', error);
      throw error;
    }
  }

  /**
   * @param {unknown} lesson
   * @returns {Lesson}
   */
  prepend(lesson) {
    const normalized = parseLessonInput(lesson);
    const lessons = parsePersistedLessonPayload([normalized, ...this.state.lessons]);
    this.state.lessons = lessons;
    this.save();
    return lessons[0];
  }

  /**
   * @param {LessonIdentifier} id
   * @returns {Lesson | null}
   */
  remove(id) {
    const lesson = this.state.lessons.find((item) => item.id === id);
    if (!lesson) return null;
    this.state.lessons = this.state.lessons.filter((item) => item.id !== id);
    this.save();
    return lesson;
  }

  /** @returns {void} */
  export() {
    const lessons = parseLessonsForExport(this.state.lessons);
    const exportedAt = this.now().toISOString();
    downloadJson(`chalk-lessons-${exportedAt.slice(0, 10)}.json`, {
      kind: 'chalk.lessons',
      version: LESSON_EXPORT_VERSION,
      exportedAt,
      lessons,
    });
  }

  /**
   * @param {unknown} payload
   * @returns {Lesson[]}
   */
  import(payload) {
    const lessons = parseLessonExportPayload(payload);
    const firstIdentifier = this.createIdentifier();
    const importedAt = this.now().toISOString();
    const imported = lessons.map((lesson, index) => ({
      ...lesson,
      id: firstIdentifier + index,
      importedAt,
    }));
    parsePersistedLessonPayload([...imported, ...this.state.lessons]);
    this.state.lessons = [...imported, ...this.state.lessons];
    this.save();
    return imported;
  }

  /**
   * @param {StorageOperation} operation
   * @param {unknown} error
   * @returns {Readonly<StorageDiagnostic>}
   */
  #reportStorageFailure(operation, error) {
    return reportStorageFailure({
      boundary: LESSON_STORAGE_BOUNDARY,
      operation,
      key: STORAGE_KEY,
      error,
      onDiagnostic: this.onDiagnostic,
    });
  }
}
