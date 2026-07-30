import { escapeHtml } from './dom.js';

/**
 * @typedef {import('./project-payload-contract.js').Project} Project
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} ProjectIdentifier
 * @typedef {import('./project-payload-contract.js').ProjectPage} ProjectPage
 * @typedef {import('./project-store.js').ProjectStore} ProjectStore
 *
 * @typedef {object} PageTabsOptions
 * @property {ProjectStore} projectStore
 * @property {HTMLElement | null} tabs
 * @property {() => boolean} isBlocked
 * @property {(message: string) => void} showToast
 * @property {() => void} beforeChange
 * @property {() => void} onPageChanged
 * @property {() => void} onProjectsChanged
 */

export class PageTabsUI {
  /** @param {PageTabsOptions} options */
  constructor(options) {
    this.projectStore = options.projectStore;
    this.tabs = options.tabs;
    this.isBlocked = options.isBlocked;
    this.showToast = options.showToast;
    this.beforeChange = options.beforeChange;
    this.onPageChanged = options.onPageChanged;
    this.onProjectsChanged = options.onProjectsChanged;
  }

  render() {
    const project = this.projectStore.activeSession();
    const tabs = this.tabs;
    if (!project || !tabs) return;

    tabs.innerHTML =
      project.pages.map((page) => this.pageTabMarkup(project, page)).join('') +
      '<button class="add-page-tab" data-add-project-page title="Add page" aria-label="Add page">+</button>';

    /** @type {NodeListOf<HTMLElement>} */ (tabs.querySelectorAll('[data-project-page]')).forEach(
      (tab) => {
        tab.onclick = (event) => {
          const target = /** @type {Element} */ (event.target);
          if (!target.closest('.page-tab-close')) {
            this.switchPage(Number(tab.dataset.projectPage));
          }
        };
        tab.ondblclick = () => this.renamePage(Number(tab.dataset.projectPage));
      },
    );

    /** @type {NodeListOf<HTMLElement>} */ (tabs.querySelectorAll('.page-tab-close')).forEach(
      (button) =>
        (button.onclick = (event) => {
          event.stopPropagation();
          const tab = /** @type {HTMLElement} */ (button.closest('.page-tab'));
          this.removePage(Number(tab.dataset.projectPage));
        }),
    );
    const addButton = /** @type {HTMLElement} */ (tabs.querySelector('[data-add-project-page]'));
    addButton.onclick = () => this.addPage();

    requestAnimationFrame(() =>
      tabs
        .querySelector('.page-tab.active')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' }),
    );
  }

  /**
   * @param {Project} project
   * @param {ProjectPage} page
   * @returns {string}
   */
  pageTabMarkup(project, page) {
    const activeClass = page.id === project.activePageId ? ' active' : '';
    const closeButton =
      project.pages.length > 1
        ? '<span class="page-tab-close" aria-label="Close page">×</span>'
        : '';

    return [
      `<button class="page-tab${activeClass}"`,
      ` data-project-page="${page.id}"`,
      ' title="Double-click to rename">',
      `<span class="page-tab-label">${escapeHtml(page.title)}</span>`,
      closeButton,
      '</button>',
    ].join('');
  }

  /** @returns {boolean} */
  blocked() {
    if (!this.isBlocked()) return false;
    this.showToast('Wait for Codex to finish before changing pages.');
    return true;
  }

  /** @returns {void} */
  addPage() {
    if (this.blocked()) return;

    this.beforeChange();
    const page = this.projectStore.addPage();
    if (!page) return;

    this.onPageChanged();
    this.showToast(`${page.title} added · chat kept with project`);
  }

  /** @param {ProjectIdentifier} id */
  switchPage(id) {
    const project = this.projectStore.activeSession();
    if (!project || id === project.activePageId || this.blocked()) return;

    this.beforeChange();
    if (!this.projectStore.activatePage(id)) return;

    this.onPageChanged();
  }

  /** @param {ProjectIdentifier} id */
  renamePage(id) {
    const project = this.projectStore.activeSession();
    const page = project?.pages.find((item) => item.id === id);
    if (!page) return;

    const renamedPage = this.projectStore.renamePage(id, prompt('Page name', page.title));
    if (!renamedPage) return;

    this.render();
    this.onProjectsChanged();
  }

  /** @param {ProjectIdentifier} id */
  removePage(id) {
    const project = this.projectStore.activeSession();
    if (!project || project.pages.length === 1) return;

    const page = project.pages.find((item) => item.id === id);
    if (!page || !confirm(`Delete “${page.title}”? This cannot be undone.`)) return;

    if (!this.projectStore.deletePage(id)) return;

    this.onPageChanged();
    this.onProjectsChanged();
  }
}
