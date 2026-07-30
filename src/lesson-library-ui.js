import { $, $$, escapeHtml } from './dom.js';

/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-store.js').LessonStore} LessonStore
 *
 * @typedef {object} LessonLibraryOptions
 * @property {LessonStore} store
 * @property {() => void} ensureModalRoot
 * @property {(id: LessonIdentifier) => void} openLesson
 * @property {(id: LessonIdentifier) => void} deleteLesson
 */

/**
 * @param {string} topic
 * @returns {[string, string, string]}
 */
function topicStyle(topic = '') {
  /** @type {[string, string, string][]} */
  const styles = [
    ['#f4e4dc', '#a6573b', '#cf714e'],
    ['#e4ebf7', '#4a6594', '#5879ae'],
    ['#e4f0e7', '#4c7758', '#589066'],
    ['#eee6f3', '#735784', '#88639b'],
  ];
  let hash = 0;
  for (const character of topic) hash = (hash << 5) - hash + character.charCodeAt(0);
  return styles[Math.abs(hash) % styles.length];
}

/**
 * @param {Lesson} lesson
 * @returns {string}
 */
function durationLabel(lesson) {
  return Number.isFinite(Number(lesson.minutes)) && Number(lesson.minutes) > 0
    ? `${lesson.minutes} min · `
    : '';
}

export class LessonLibraryUI {
  /** @param {LessonLibraryOptions} options */
  constructor({ store, ensureModalRoot, openLesson, deleteLesson }) {
    this.store = store;
    this.ensureModalRoot = ensureModalRoot;
    this.openLesson = openLesson;
    this.deleteLesson = deleteLesson;
  }

  render() {
    const lessons = this.store.lessons;
    const completed = lessons.filter((lesson) => lesson.completed).length;
    /** @type {HTMLElement} */ ($('#lesson-count')).textContent = String(lessons.length);
    /** @type {HTMLElement} */ ($('#completed-count')).textContent = String(completed);
    /** @type {HTMLElement} */ ($('#progress-number')).textContent =
      `${completed} of ${lessons.length} lessons`;
    /** @type {HTMLElement} */ ($('#progress-fill')).style.width =
      `${lessons.length ? (completed / lessons.length) * 100 : 0}%`;
    /** @type {HTMLElement[]} */ ($$('.progress-days span')).forEach((day, index) =>
      day.classList.toggle('done', index < Math.min(completed, 7)),
    );
    /** @type {HTMLElement} */ ($('#lesson-empty')).classList.toggle('show', lessons.length === 0);
    /** @type {HTMLElement} */ ($('.lesson-section-head')).style.display = lessons.length
      ? ''
      : 'none';

    const topics = [...new Set(lessons.map((lesson) => lesson.topic))];
    /** @type {HTMLElement} */ ($('#topic-list')).innerHTML = topics
      .map((topic) => {
        const count = lessons.filter((lesson) => lesson.topic === topic).length;
        const [, , color] = topicStyle(topic);
        return `<button style="--topic-color:${color}">${escapeHtml(topic)}<b>${count}</b></button>`;
      })
      .join('');

    /** @type {HTMLElement} */ ($('#lesson-grid')).innerHTML = lessons
      .map((lesson) => {
        const [background, text] = topicStyle(lesson.topic);
        const duration = durationLabel(lesson);
        return `<article class="lesson-card" data-lesson="${lesson.id}">
        <div class="lesson-card-top"><span class="lesson-topic" style="--topic-bg:${background};--topic-text:${text}">${escapeHtml(lesson.topic)}</span><button class="delete-lesson" title="Delete lesson">×</button></div>
        <h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.summary)}</p>
        <div class="lesson-card-footer"><span>${duration}${escapeHtml(lesson.level)}</span><div class="mini-progress"><i style="width:${lesson.completed ? 100 : 18}%"></i></div></div>
      </article>`;
      })
      .join('');
    /** @type {HTMLElement[]} */ ($$('.lesson-card')).forEach((card) =>
      card.addEventListener('click', () => this.openLesson(Number(card.dataset.lesson))),
    );
    /** @type {HTMLElement[]} */ ($$('.delete-lesson')).forEach((button) =>
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const card = /** @type {HTMLElement} */ (button.closest('.lesson-card'));
        this.deleteLesson(Number(card.dataset.lesson));
      }),
    );
  }

  renderPicker() {
    let picker = /** @type {HTMLElement | null} */ ($('#lesson-picker'));
    if (!picker) {
      picker = document.createElement('section');
      picker.id = 'lesson-picker';
      picker.className = 'lesson-picker';
      $('#lesson-form')?.before(picker);
    }
    if (!picker) return;
    if (!this.store.lessons.length) {
      picker.innerHTML =
        '<div class="lesson-picker-empty">No lessons yet. Create one below and it will open on top of your sketch page.</div>';
      return;
    }
    picker.innerHTML = `<div class="lesson-picker-head"><span>LESSON LIBRARY</span><small>Select one without leaving your sketch.</small></div>${this.store.lessons
      .map((lesson) => {
        const graphLabel = lesson.lessonGraph?.nodes?.length
          ? ` · ${lesson.lessonGraph.nodes.length} node plan`
          : '';
        const duration = durationLabel(lesson);
        return `<div class="lesson-picker-row"><button type="button" data-pick-lesson="${lesson.id}"><b>${escapeHtml(lesson.title)}</b><small>${escapeHtml(lesson.topic)} · ${duration}${escapeHtml(lesson.level)}${graphLabel}</small></button><button type="button" class="lesson-picker-delete" data-delete-picker-lesson="${lesson.id}" aria-label="Delete lesson">×</button></div>`;
      })
      .join('')}`;
    /** @type {HTMLElement[]} */ ($$('[data-pick-lesson]')).forEach((button) =>
      button.addEventListener('click', () => {
        this.hideModal();
        this.openLesson(Number(button.dataset.pickLesson));
      }),
    );
    /** @type {HTMLElement[]} */ ($$('[data-delete-picker-lesson]')).forEach((button) =>
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.deleteLesson(Number(button.dataset.deletePickerLesson));
      }),
    );
  }

  showModal() {
    const modal = /** @type {HTMLElement | null} */ ($('#lesson-modal'));
    if (!modal) return;
    modal.classList.add('open');
    Object.assign(modal.style, {
      display: 'flex',
      position: 'fixed',
      inset: '0',
      zIndex: '240',
      pointerEvents: 'auto',
    });
  }

  hideModal() {
    const modal = /** @type {HTMLElement | null} */ ($('#lesson-modal'));
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = '';
    modal.style.position = '';
    modal.style.inset = '';
    modal.style.zIndex = '';
    modal.style.pointerEvents = '';
  }

  /**
   * @param {string} message
   * @param {string} [detail]
   * @returns {boolean}
   */
  showError(message, detail = '') {
    const errorBox = /** @type {HTMLElement | null} */ ($('#lesson-modal-error'));
    if (!errorBox) return false;
    errorBox.innerHTML = `<strong>${escapeHtml(message)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}`;
    errorBox.classList.add('show');
    return true;
  }

  clearError() {
    const errorBox = $('#lesson-modal-error');
    if (!errorBox) return;
    errorBox.textContent = '';
    errorBox.classList.remove('show');
  }

  open() {
    this.ensureModalRoot();
    this.clearError();
    $('#sketch-view')?.classList.add('active');
    this.showModal();
    try {
      this.renderPicker();
    } catch (error) {
      console.error('Could not render lesson picker', error);
    }
    /** @type {HTMLElement} */ ($('#lesson-form')).style.display = '';
    /** @type {HTMLElement} */ ($('#lesson-generating')).classList.remove('show');
    /** @type {HTMLElement[]} */ ($$('[data-page]')).forEach((button) =>
      button.classList.toggle('active', button.dataset.page === 'lessons'),
    );
    setTimeout(
      () =>
        this.store.lessons.length
          ? /** @type {HTMLElement | null} */ ($('#lesson-picker button'))?.focus()
          : /** @type {HTMLElement} */ ($('#lesson-goal')).focus(),
      100,
    );
  }
}
