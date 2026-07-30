import { readFile } from 'node:fs/promises';

import { parseAst } from 'vite';

/**
 * Return only executable static imports. JSDoc type imports are intentionally excluded because
 * they do not create a runtime dependency or move responsibility across a module boundary.
 *
 * @param {URL} moduleUrl
 * @returns {Promise<Set<string>>}
 */
export async function readRuntimeModuleDependencies(moduleUrl) {
  const source = await readFile(moduleUrl, 'utf8');
  const program = parseAst(source, { sourceType: 'module' });
  const dependencies = new Set();

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    dependencies.add(statement.source.value);
  }

  return dependencies;
}
