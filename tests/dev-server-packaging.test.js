import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import viteConfig from '../vite.config.js';
import packageJson from '../package.json' with { type: 'json' };

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('Vite ignores generated build and packaging artifacts while watching', () => {
  const ignored = viteConfig.server?.watch?.ignored;

  assert.ok(Array.isArray(ignored), 'server.watch.ignored must be an array');
  assert.deepEqual(new Set(ignored), new Set(['**/dist/**', '**/build/**', '**/release/**']));
});

test('development and preview servers use the same application services', () => {
  assert.ok(viteConfig.plugins.length > 0);
  for (const plugin of viteConfig.plugins) {
    assert.equal(
      typeof plugin.configureServer,
      'function',
      `${plugin.name} must configure the development server`,
    );
    assert.equal(
      typeof plugin.configurePreviewServer,
      'function',
      `${plugin.name} must configure the preview server`,
    );
  }
});

test('desktop packages are emitted separately from Vite build output', () => {
  const viteOutput = viteConfig.build?.outDir ?? 'dist';
  const packageOutput = packageJson.build?.directories?.output;

  assert.equal(packageOutput, 'release');
  assert.equal(path.resolve(projectRoot, viteOutput), path.join(projectRoot, 'dist'));
  assert.equal(path.resolve(projectRoot, packageOutput), path.join(projectRoot, 'release'));
  assert.notEqual(
    path.resolve(projectRoot, packageOutput),
    path.resolve(projectRoot, viteOutput),
    'electron-builder must not overwrite the Vite application bundle',
  );
});

test('desktop package includes the shared Codex stdio session adapter', () => {
  assert.ok(
    packageJson.build?.files?.includes('src/codex-stdio-session-adapter.js'),
    'Electron must package the shared Codex stdio adapter imported by its bridge',
  );
});
