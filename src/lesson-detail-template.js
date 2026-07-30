import { nextGraphNode } from './lesson-ai.js';

/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonGraph} LessonGraph
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {LessonGraph | null | undefined} graph
 * @returns {string}
 */
function renderLessonGraph(graph) {
  if (!graph) return '';

  const edgeText = graph.edges?.length
    ? graph.edges.map((edge) => `${edge.from} → ${edge.to}`).join(' · ')
    : 'No dependencies yet';
  const nextNode = nextGraphNode(graph);
  const nodes = graph.nodes
    .map(
      (node) =>
        `<li class="${node.status === 'active' ? 'active' : ''}"><b>${escapeHtml(node.title)}</b><small>${escapeHtml(node.obligation)}</small></li>`,
    )
    .join('');
  const progression = nextNode
    ? `<button class="generate-next-lesson" data-next-graph-node="${escapeHtml(nextNode.id)}">Generate next: ${escapeHtml(nextNode.title)} →</button>`
    : '<small class="lesson-graph-edges">End of lesson graph.</small>';

  return `<section class="lesson-graph-block"><div><span class="eyebrow">LESSON GRAPH</span><h2>${escapeHtml(graph.title)}</h2><p>${escapeHtml(graph.contract)}</p></div><ol>${nodes}</ol><small class="lesson-graph-edges">Dependencies: ${escapeHtml(edgeText)}</small>${progression}</section>`;
}

/** @returns {string} */
function renderPracticePane() {
  return `<section class="lesson-practice-pane">
        <aside class="lesson-practice-tools" aria-label="Practice drawing tools">
          <div class="lesson-practice-tool-group">
            <button class="active" data-practice-tool="pen" title="Pen" aria-label="Pen"><svg viewBox="0 0 24 24"><path d="m5 19 2.5-6.5L17 3l4 4-9.5 9.5L5 19Z"/><path d="m14.5 5.5 4 4"/></svg></button>
            <button data-practice-tool="eraser" title="Eraser" aria-label="Eraser"><svg viewBox="0 0 24 24"><path d="m4.5 14.5 8.8-10a2 2 0 0 1 2.9-.1l3.3 3.1a2 2 0 0 1 .1 2.9L11.9 19H8l-3.4-2a1.8 1.8 0 0 1-.1-2.5Z"/><path d="M12 19h8"/></svg></button>
            <button data-practice-tool="select" title="Select and move (S)" aria-label="Select and move"><svg viewBox="0 0 24 24"><path d="M5 3h4M3 5v4M19 3h-4M21 5v4M5 21h4M3 19v-4M19 21h-4M21 19v-4"/><path d="m9 8 7 4-4 1-2 4-1-9Z"/></svg></button>
          </div>
          <div class="lesson-practice-tool-group lower">
            <button data-practice-undo title="Undo" aria-label="Undo"><svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/></svg></button>
            <button data-practice-clear title="Clear practice page" aria-label="Clear practice page"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
          </div>
        </aside>
        <section class="lesson-practice-main">
          <header class="lesson-practice-head"><div><span>PRACTICE SHEET</span><h2>Work it out here.</h2></div></header>
          <div class="lesson-practice-paper"><canvas class="lesson-practice-canvas" aria-label="Lesson practice canvas"></canvas><div class="lesson-selection-box"></div><div class="lesson-practice-empty"><span>Start with the first step.</span><small>Wacom pressure works on this page.</small></div></div>
          <footer class="lesson-practice-status"><span>Saved with this lesson</span><span class="practice-input-status">Ready for pen</span></footer>
        </section>
      </section>`;
}

/**
 * @param {Lesson} lesson
 * @returns {string}
 */
function renderReadingPane(lesson) {
  const duration =
    Number.isFinite(Number(lesson.minutes)) && Number(lesson.minutes) > 0
      ? `${escapeHtml(lesson.minutes)} minutes · `
      : '';

  return `<aside class="lesson-reading-pane"><article>
        <span class="eyebrow">${escapeHtml(lesson.topic.toUpperCase())}</span><h1>${escapeHtml(lesson.title)}</h1>
        <div class="lesson-meta">${duration}${escapeHtml(lesson.level)} · Created with Codex</div>
        ${renderLessonGraph(lesson.lessonGraph)}
        <section class="lesson-block"><h2>Understand the idea</h2><p>${escapeHtml(lesson.explanation)}</p></section>
        <section class="lesson-block"><h2>Walk through an example</h2><div class="example-box">${escapeHtml(lesson.example)}</div></section>
        <section class="lesson-block"><h2>Try it on the page</h2><div class="practice-box">${escapeHtml(lesson.practice)}</div><p><strong>Hint:</strong> ${escapeHtml(lesson.hint)}</p><button class="complete-lesson ${lesson.completed ? 'done' : ''}" data-complete="${escapeHtml(lesson.id)}">${lesson.completed ? '✓ Lesson completed' : 'Mark lesson complete'}</button><button class="open-full-sketch" data-practice="${escapeHtml(lesson.id)}">Full sketch page →</button><button class="open-full-sketch" data-ask-lesson="${escapeHtml(lesson.id)}">Ask Codex →</button></section>
      </article></aside>`;
}

/**
 * @param {Lesson} lesson
 * @returns {string}
 */
export function renderLessonDetailTemplate(lesson) {
  return `<div class="lesson-workspace">
      ${renderPracticePane()}
      ${renderReadingPane(lesson)}
    </div>`;
}
