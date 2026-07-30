import { readdir, readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const entryStylesheetUrl = new URL('../src/style.css', import.meta.url);
const stylesDirectoryUrl = new URL('../src/styles/', import.meta.url);

function normalizeSelector(selector) {
  return selector.trim().replace(/\s+/g, ' ');
}

function selectorList(selectorText) {
  return selectorText.split(',').map(normalizeSelector);
}

function collectStyleRules(cssRules, path, mediaQueries, rules) {
  for (const cssRule of cssRules) {
    if (cssRule.selectorText && cssRule.style) {
      rules.push({
        path,
        selectors: selectorList(cssRule.selectorText),
        mediaQueries,
        style: cssRule.style,
      });
    }

    if (!cssRule.cssRules) continue;

    const mediaText = cssRule.media?.mediaText;
    collectStyleRules(
      cssRule.cssRules,
      path,
      mediaText ? [...mediaQueries, mediaText] : mediaQueries,
      rules,
    );
  }
}

function parseStylesheet(source, url) {
  const dom = new JSDOM('<!doctype html><html><head><style></style></head></html>', {
    url,
  });
  const styleElement = dom.window.document.querySelector('style');
  styleElement.textContent = source;
  return { dom, sheet: styleElement.sheet };
}

export async function loadStylesheetCatalog() {
  const entrySource = await readFile(entryStylesheetUrl, 'utf8');
  const parsedEntry = parseStylesheet(entrySource, entryStylesheetUrl.href);
  const imports = [...parsedEntry.sheet.cssRules]
    .filter((cssRule) => typeof cssRule.href === 'string')
    .map((cssRule) => cssRule.href.replace('./styles/', ''));
  parsedEntry.dom.window.close();

  const directoryPaths = (await readdir(stylesDirectoryUrl))
    .filter((path) => path.endsWith('.css'))
    .sort();
  const stylesheetSources = new Map();
  const rules = [];

  for (const path of imports) {
    const stylesheetUrl = new URL(path, stylesDirectoryUrl);
    const source = await readFile(stylesheetUrl, 'utf8');
    const parsedStylesheet = parseStylesheet(source, stylesheetUrl.href);
    stylesheetSources.set(path, source);
    collectStyleRules(parsedStylesheet.sheet.cssRules, path, [], rules);
    parsedStylesheet.dom.window.close();
  }

  return {
    imports,
    directoryPaths,

    ownersOf(selector) {
      const normalizedSelector = normalizeSelector(selector);
      return [
        ...new Set(
          rules
            .filter((rule) => rule.selectors.includes(normalizedSelector))
            .map((rule) => rule.path),
        ),
      ].sort();
    },

    rulesFor(path, selector) {
      const normalizedSelector = normalizeSelector(selector);
      return rules.filter(
        (rule) => rule.path === path && rule.selectors.includes(normalizedSelector),
      );
    },

    async createDocument(markup, { theme } = {}) {
      const themeAttribute = theme ? ` data-theme="${theme}"` : '';
      const dom = new JSDOM(
        `<!doctype html><html${themeAttribute}><head></head><body>${markup}</body></html>`,
        {
          pretendToBeVisual: true,
          url: 'http://chalk.test/',
        },
      );

      for (const path of imports) {
        const styleElement = dom.window.document.createElement('style');
        styleElement.dataset.stylesheetPath = path;
        styleElement.textContent = stylesheetSources.get(path);
        dom.window.document.head.append(styleElement);
      }

      return dom;
    },
  };
}
