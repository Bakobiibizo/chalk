import { escapeHtml } from './dom.js';
/**
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} ProjectIdentifier
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 *
 * @typedef {object} ProjectsPanelOptions
 * @property {ProjectStore} projectStore
 * @property {HTMLElement} openButton
 * @property {HTMLElement} closeButton
 * @property {HTMLElement} scrim
 * @property {HTMLElement} newButton
 * @property {HTMLElement | null} list
 * @property {HTMLElement} panel
 * @property {() => boolean} isBlocked
 * @property {(message: string) => void} showToast
 * @property {() => void} beforeChange
 * @property {(options?: {focusTitle?: boolean}) => void} onProjectChanged
 */

export class ProjectsPanelUI {
  /** @param {ProjectsPanelOptions} options */
  constructor(options) {
    this.projectStore = options.projectStore;
    this.openButton = options.openButton;
    this.closeButton = options.closeButton;
    this.scrim = options.scrim;
    this.newButton = options.newButton;
    this.list = options.list;
    this.panel = options.panel;
    this.isBlocked = options.isBlocked;
    this.showToast = options.showToast;
    this.beforeChange = options.beforeChange;
    this.onProjectChanged = options.onProjectChanged;
    this.initialized = false;
    this.handleOpen = () => this.open();
    this.handleClose = () => this.close();
    this.handleCreateProject = () => this.createProject();
  }
  initialize() {
    if (this.initialized) return;
    this.openButton.addEventListener('click', this.handleOpen);
    this.closeButton.addEventListener('click', this.handleClose);
    this.scrim.addEventListener('click', this.handleClose);
    this.newButton.addEventListener('click', this.handleCreateProject);
    this.initialized = true;
  }
  destroy() {
    if (!this.initialized) return;
    this.openButton.removeEventListener('click', this.handleOpen);
    this.closeButton.removeEventListener('click', this.handleClose);
    this.scrim.removeEventListener('click', this.handleClose);
    this.newButton.removeEventListener('click', this.handleCreateProject);
    this.initialized = false;
  }
  render() {
    if (!this.list) return;
    const state = this.projectStore.state;
    this.list.innerHTML = [...state.sessions]
      .sort(
        (first, second) =>
          new Date(second.updatedAt ?? '').getTime() - new Date(first.updatedAt ?? '').getTime(),
      )
      .map((session) => {
        const date = new Date(session.updatedAt ?? '');
        const dateLabel =
          date.toDateString() === new Date().toDateString()
            ? `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const marks = session.pages.reduce(
          (total, page) => total + (page.strokes?.length || 0) + (page.cards?.length || 0),
          0,
        );
        return `<div class="session-row ${session.id === state.activeId ? 'active' : ''}" data-session="${session.id}" role="button" tabindex="0"><span class="session-thumb">${marks ? '∿' : '·'}</span><div><b>${escapeHtml(session.title || 'Untitled project')}</b><small>${dateLabel} · ${session.pages.length} ${session.pages.length === 1 ? 'page' : 'pages'} · ${marks} ${marks === 1 ? 'mark' : 'marks'}</small></div><button class="session-delete" aria-label="Delete project">×</button></div>`;
      })
      .join('');
    /** @type {NodeListOf<HTMLElement>} */ (this.list.querySelectorAll('.session-row')).forEach(
      (row) => {
        row.onclick = () => this.switchProject(Number(row.dataset.session));
        row.onkeydown = (event) => {
          if (event.key === 'Enter') this.switchProject(Number(row.dataset.session));
        };
      },
    );
    /** @type {NodeListOf<HTMLElement>} */ (this.list.querySelectorAll('.session-delete')).forEach(
      (button) =>
        (button.onclick = (event) => {
          event.stopPropagation();
          const row = /** @type {HTMLElement} */ (button.closest('.session-row'));
          this.deleteProject(Number(row.dataset.session));
        }),
    );
  }
  open() {
    this.render();
    this.panel.classList.add('open');
    this.scrim.classList.add('show');
  }
  close() {
    this.panel.classList.remove('open');
    this.scrim.classList.remove('show');
  }
  /** @returns {boolean} */
  blocked() {
    if (!this.isBlocked()) return false;
    this.showToast('Wait for Codex to finish before switching projects.');
    return true;
  }
  /** @returns {void} */
  createProject() {
    if (this.blocked()) return;
    this.beforeChange();
    this.projectStore.createProject();
    this.onProjectChanged({ focusTitle: true });
    this.render();
    this.close();
  }
  /** @param {ProjectIdentifier} id */
  switchProject(id) {
    if (id === this.projectStore.state.activeId) {
      this.close();
      return;
    }
    if (this.blocked()) return;
    this.beforeChange();
    if (!this.projectStore.activateProject(id)) return;
    this.onProjectChanged();
    this.render();
    this.close();
  }
  /** @param {ProjectIdentifier} id */
  deleteProject(id) {
    const state = this.projectStore.state;
    if (state.sessions.length === 1) {
      this.showToast('Keep at least one project.');
      return;
    }
    const session = state.sessions.find((item) => item.id === id);
    if (
      !session ||
      !confirm(`Delete project “${session.title}” and all of its pages? This cannot be undone.`)
    )
      return;
    const transition = this.projectStore.deleteProject(id);
    if (!transition) return;
    if (transition.activeProjectChanged) this.onProjectChanged();
    this.render();
  }
}
