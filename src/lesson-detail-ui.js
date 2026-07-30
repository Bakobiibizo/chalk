import { renderLessonDetailTemplate } from './lesson-detail-template.js';

/**
 * @typedef {import('./lesson-detail-dom.js').LessonDetailTransientElements} LessonDetailTransientElements
 * @typedef {import('./lesson-detail-dom.js').LessonPracticeElements} LessonPracticeElements
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-progression-service.js').LessonProgression} LessonProgression
 *
 * @typedef {object} LessonDetailPersistentElements
 * @property {HTMLElement} workspace
 * @property {HTMLElement} sketchView
 * @property {HTMLElement} lessonsView
 * @property {HTMLElement} detail
 * @property {HTMLElement} content
 * @property {HTMLElement[]} pageButtons
 * @property {HTMLInputElement} pageTitle
 * @property {HTMLInputElement | HTMLTextAreaElement} coachPrompt
 *
 * @typedef {object} LessonDetailOptions
 * @property {LessonDetailPersistentElements} persistentElements
 * @property {(content: HTMLElement) => LessonDetailTransientElements} resolveTransientElements
 * @property {(id: LessonIdentifier) => Lesson | null} findLesson
 * @property {(id: LessonIdentifier) => Lesson | null} toggleLessonCompleted
 * @property {(lesson: Lesson) => LessonProgression} generateNextLesson
 * @property {(root: HTMLElement) => void} renderLatex
 * @property {(lesson: Lesson, elements: LessonPracticeElements) => void} setupPractice
 * @property {() => void} destroyPractice
 * @property {() => void} renderLessons
 * @property {() => void} renderLessonPicker
 * @property {() => void} openCoach
 * @property {() => void} saveDrawing
 * @property {(message: string) => void} showToast
 * @property {(id: LessonIdentifier | null) => void} setActiveLesson
 * @property {() => void} [activateLayout]
 */

export class LessonDetailUI {
  /** @param {LessonDetailOptions} options */
  constructor({
    persistentElements,
    resolveTransientElements,
    findLesson,
    toggleLessonCompleted,
    generateNextLesson,
    renderLatex,
    setupPractice,
    destroyPractice,
    renderLessons,
    renderLessonPicker,
    openCoach,
    saveDrawing,
    showToast,
    setActiveLesson,
    activateLayout = () => {},
  }) {
    this.persistentElements = persistentElements;
    this.resolveTransientElements = resolveTransientElements;
    this.findLesson = findLesson;
    this.toggleLessonCompleted = toggleLessonCompleted;
    this.generateNextLesson = generateNextLesson;
    this.renderLatex = renderLatex;
    this.setupPractice = setupPractice;
    this.destroyPractice = destroyPractice;
    this.renderLessons = renderLessons;
    this.renderLessonPicker = renderLessonPicker;
    this.openCoach = openCoach;
    this.saveDrawing = saveDrawing;
    this.showToast = showToast;
    this.setActiveLesson = setActiveLesson;
    this.activateLayout = activateLayout;
  }

  /** @param {LessonIdentifier} id */
  open(id) {
    const lesson = this.findLesson(id);
    if (!lesson) return;
    const { workspace, sketchView, lessonsView, detail, content, pageButtons } =
      this.persistentElements;

    this.setActiveLesson(id);
    this.destroyPractice();
    content.innerHTML = renderLessonDetailTemplate(lesson);
    const transientElements = this.resolveTransientElements(content);
    this.renderLatex(content);
    sketchView.classList.add('active');
    workspace.classList.add('lesson-integrated');
    lessonsView.classList.add('active', 'integrated-lesson-panel');
    this.activateLayout();
    pageButtons.forEach((button) =>
      button.classList.toggle('active', button.dataset.page === 'lessons'),
    );
    detail.classList.add('open');
    this.setupPractice(lesson, transientElements.practice);
    transientElements.completeButton.addEventListener('click', () => {
      this.toggleLessonCompleted(id);
      this.renderLessons();
      this.open(id);
    });
    transientElements.practiceButton.addEventListener('click', () => this.minimizeToSketch(lesson));
    transientElements.askCoachButton.addEventListener('click', () => this.askCoach(lesson));
    const nextGraphNodeButton = transientElements.nextGraphNodeButton;
    nextGraphNodeButton?.addEventListener('click', () =>
      this.generateNext(lesson, nextGraphNodeButton),
    );
  }

  /** @param {Lesson} lesson */
  minimizeToSketch(lesson) {
    const { pageTitle, detail, lessonsView, workspace } = this.persistentElements;
    pageTitle.value = `${lesson.title} — practice`;
    this.saveDrawing();
    detail.classList.remove('open');
    lessonsView.classList.remove('active', 'integrated-lesson-panel');
    workspace.classList.remove('lesson-integrated');
    this.setActiveLesson(null);
    this.showToast('Lesson minimized · keep working on the sketch page');
  }

  /** @param {Lesson} lesson */
  askCoach(lesson) {
    const { coachPrompt } = this.persistentElements;
    this.openCoach();
    coachPrompt.value = `Help me with the lesson: ${lesson.title}`;
    coachPrompt.focus();
  }

  /**
   * @param {Lesson} previousLesson
   * @param {HTMLButtonElement} button
   * @returns {Promise<void>}
   */
  async generateNext(previousLesson, button) {
    const generation = this.generateNextLesson(previousLesson);
    if (generation.status !== 'started') return;

    const { node } = generation;
    button.disabled = true;
    button.textContent = 'Generating next lesson…';
    try {
      const result = await generation.completion;
      this.renderLessons();
      this.renderLessonPicker();
      this.open(result.lesson.id);
    } catch (error) {
      this.showToast(
        `Could not generate next lesson: ${error instanceof Error ? error.message : String(error)}`,
      );
      button.disabled = false;
      button.textContent = `Generate next: ${node.title} →`;
    }
  }
}
