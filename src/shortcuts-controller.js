/**
 * @typedef {import('./drawing-canvas.js').DrawingTool} DrawingTool
 * @typedef {import('./lesson-practice-controller.js').LessonPracticeController} LessonPracticeController
 *
 * @typedef {object} ShortcutActions
 * @property {() => boolean} isLessonOpen
 * @property {() => LessonPracticeController | null} getLessonPracticeController
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {(tool: DrawingTool) => void} setTool
 * @property {() => Promise<void> | void} toggleFocusMode
 * @property {() => boolean} isFocusMode
 * @property {() => Promise<void> | void} exitFocusMode
 * @property {() => boolean} isLessonModalOpen
 * @property {() => void} hideLessonModal
 * @property {(size: number) => void} setPenSize
 * @property {() => number} getPenSize
 * @property {() => boolean} deleteSelection
 * @property {() => boolean} isSketchActive
 *
 * @typedef {{
 *   actions: ShortcutActions,
 *   event: KeyboardEvent,
 *   key: string,
 *   practice: LessonPracticeController | null,
 * }} ShortcutContext
 *
 * @typedef {{
 *   name: string,
 *   match: (context: ShortcutContext) => boolean,
 *   context: (context: ShortcutContext) => boolean,
 *   execute: (context: ShortcutContext) => void,
 * }} ShortcutCommand
 */

const TOOL_BY_KEY = Object.freeze({
  p: 'pen',
  b: 'pen',
  1: 'pen',
  e: 'eraser',
  2: 'eraser',
  s: 'select',
  3: 'select',
});

/** @param {ShortcutContext} context */
function matchesDelete({ key }) {
  return key === 'delete';
}

/** @param {ShortcutContext} context */
function hasSelectionContext({ actions, practice }) {
  return Boolean(practice) || actions.isSketchActive();
}

/** @param {ShortcutContext} context */
function executeDeleteSelection({ actions, event, practice }) {
  const deleted = practice ? practice.deleteSelection() : actions.deleteSelection();
  if (deleted) event.preventDefault();
}

/** @param {ShortcutContext} context */
function matchesUndoRedo({ event, key }) {
  return (event.ctrlKey || event.metaKey) && key === 'z';
}

function hasHistoryContext() {
  return true;
}

/** @param {ShortcutContext} context */
function executeUndoRedo({ actions, event, practice }) {
  event.preventDefault();
  if (practice) practice.undo();
  else if (event.shiftKey) actions.redo();
  else actions.undo();
}

/** @param {string} key */
function isToolKey(key) {
  return Object.hasOwn(TOOL_BY_KEY, key);
}

/** @param {ShortcutContext} context */
function matchesTool({ key }) {
  return isToolKey(key);
}

function hasToolContext() {
  return true;
}

/** @param {ShortcutContext} context */
function executeTool({ actions, event, key, practice }) {
  if (!isToolKey(key)) return;
  const tool = TOOL_BY_KEY[/** @type {keyof typeof TOOL_BY_KEY} */ (key)];
  event.preventDefault();
  practice?.setTool(tool);
  actions.setTool(tool);
}

/** @param {ShortcutContext} context */
function matchesFocusToggle({ event, key }) {
  return key === 'f' && !event.repeat;
}

/** @param {ShortcutContext} context */
function hasSketchContext({ actions }) {
  return actions.isSketchActive();
}

/** @param {ShortcutContext} context */
function executeFocusToggle({ actions, event }) {
  event.preventDefault();
  void actions.toggleFocusMode();
}

/** @param {ShortcutContext} context */
function matchesEscape({ key }) {
  return key === 'escape';
}

/** @param {ShortcutContext} context */
function hasFocusModeContext({ actions }) {
  return actions.isFocusMode();
}

/** @param {ShortcutContext} context */
function executeFocusExit({ actions, event }) {
  event.preventDefault();
  void actions.exitFocusMode();
}

/** @param {ShortcutContext} context */
function hasLessonModalContext({ actions }) {
  return actions.isLessonModalOpen();
}

/** @param {ShortcutContext} context */
function executeLessonModalClose({ actions, event }) {
  event.preventDefault();
  actions.hideLessonModal();
}

/** @param {ShortcutContext} context */
function matchesPenSize({ key }) {
  return key === '[' || key === ']';
}

function hasPenSizeContext() {
  return true;
}

/** @param {ShortcutContext} context */
function executePenSize({ actions, event, key }) {
  event.preventDefault();
  actions.setPenSize(actions.getPenSize() + (key === '[' ? -1 : 1));
}

/** @type {readonly Readonly<ShortcutCommand>[]} */
export const SHORTCUT_COMMANDS = Object.freeze([
  Object.freeze({
    name: 'delete-selection',
    match: matchesDelete,
    context: hasSelectionContext,
    execute: executeDeleteSelection,
  }),
  Object.freeze({
    name: 'undo-redo',
    match: matchesUndoRedo,
    context: hasHistoryContext,
    execute: executeUndoRedo,
  }),
  Object.freeze({
    name: 'select-tool',
    match: matchesTool,
    context: hasToolContext,
    execute: executeTool,
  }),
  Object.freeze({
    name: 'toggle-focus',
    match: matchesFocusToggle,
    context: hasSketchContext,
    execute: executeFocusToggle,
  }),
  Object.freeze({
    name: 'exit-focus',
    match: matchesEscape,
    context: hasFocusModeContext,
    execute: executeFocusExit,
  }),
  Object.freeze({
    name: 'close-lesson-modal',
    match: matchesEscape,
    context: hasLessonModalContext,
    execute: executeLessonModalClose,
  }),
  Object.freeze({
    name: 'change-pen-size',
    match: matchesPenSize,
    context: hasPenSizeContext,
    execute: executePenSize,
  }),
]);

/** @param {EventTarget | null} target */
function isEditableTarget(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

export class ShortcutsController {
  /** @param {ShortcutActions} actions */
  constructor(actions) {
    this.actions = actions;
    this.handleKeydown = this.handleKeydown.bind(this);
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    window.addEventListener('keydown', this.handleKeydown, { capture: true });
    this.initialized = true;
  }

  bind() {
    this.initialize();
  }

  destroy() {
    if (!this.initialized) return;
    window.removeEventListener('keydown', this.handleKeydown, { capture: true });
    this.initialized = false;
  }

  /** @param {KeyboardEvent} event */
  handleKeydown(event) {
    if (isEditableTarget(event.target)) return;

    const practice = this.actions.isLessonOpen()
      ? this.actions.getLessonPracticeController()
      : null;

    const shortcutContext = {
      actions: this.actions,
      event,
      key: event.key.toLowerCase(),
      practice,
    };
    for (const command of SHORTCUT_COMMANDS) {
      if (!command.match(shortcutContext) || !command.context(shortcutContext)) continue;
      command.execute(shortcutContext);
      return;
    }
  }
}
