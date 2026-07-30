import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  createCodexExecutableResolver,
  enumerateVersionedInstallationDirectories,
} from '../electron/codex-executable-resolver.js';

const homeDirectory = '/home/chalk';
const appDataDirectory = '/users/chalk/appdata/roaming';
const nvmRoot = path.posix.join(homeDirectory, '.nvm', 'versions', 'node');
const fnmRoot = path.posix.join(homeDirectory, '.fnm', 'node-versions');

function directoryEntry(name, isDirectory = true) {
  return {
    name,
    isDirectory: () => isDirectory,
  };
}

function createResolver({
  platform = 'linux',
  pathEnvironment = '/path/first:/path/second',
  existingPaths = [],
  directoryEntries = new Map([
    [nvmRoot, [directoryEntry('v20.19.0'), directoryEntry('metadata.json', false)]],
    [fnmRoot, [directoryEntry('v22.17.0')]],
  ]),
} = {}) {
  const existingPathSet = new Set(existingPaths);
  return createCodexExecutableResolver({
    platform,
    pathDelimiter: ':',
    joinPath: path.posix.join,
    readDirectory: (directory) => {
      const entries = directoryEntries.get(directory);
      if (!entries) {
        const error = new Error(`Directory does not exist: ${directory}`);
        error.code = 'ENOENT';
        throw error;
      }
      return entries;
    },
    pathExists: (candidate) => existingPathSet.has(candidate),
    getHomeDirectory: () => homeDirectory,
    getEnvironmentVariable: (name) => {
      if (name === 'PATH') return pathEnvironment;
      if (name === 'APPDATA') return appDataDirectory;
      return undefined;
    },
  });
}

test('versioned installation enumeration preserves directory order and appends its suffix', () => {
  const directories = enumerateVersionedInstallationDirectories({
    rootDirectory: '/versions',
    suffixSegments: ['installation', 'bin'],
    readDirectory: () => [
      directoryEntry('v22.17.0'),
      directoryEntry('metadata.json', false),
      directoryEntry('v20.19.0'),
    ],
    joinPath: path.posix.join,
  });

  assert.deepEqual(directories, [
    '/versions/v22.17.0/installation/bin',
    '/versions/v20.19.0/installation/bin',
  ]);
});

test('versioned installation enumeration treats unreadable roots as absent', () => {
  const directories = enumerateVersionedInstallationDirectories({
    rootDirectory: '/missing',
    suffixSegments: ['bin'],
    readDirectory: () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
    joinPath: path.posix.join,
  });

  assert.deepEqual(directories, []);
});

test('versioned installation enumeration propagates unexpected read failures', () => {
  const readError = new Error('permission denied');
  assert.throws(
    () =>
      enumerateVersionedInstallationDirectories({
        rootDirectory: '/unreadable',
        suffixSegments: ['bin'],
        readDirectory: () => {
          throw readError;
        },
        joinPath: path.posix.join,
      }),
    readError,
  );
});

test('resolver searches PATH before supported user and system installation layouts', () => {
  const supportedDirectories = [
    '/path/first',
    '/path/second',
    path.posix.join(homeDirectory, '.local', 'bin'),
    path.posix.join(homeDirectory, '.local', 'share', 'pnpm'),
    path.posix.join(homeDirectory, '.npm-global', 'bin'),
    path.posix.join(homeDirectory, 'Library', 'pnpm'),
    path.posix.join(homeDirectory, '.volta', 'bin'),
    path.posix.join(homeDirectory, '.asdf', 'shims'),
    path.posix.join(homeDirectory, '.bun', 'bin'),
    path.posix.join(nvmRoot, 'v20.19.0', 'bin'),
    path.posix.join(fnmRoot, 'v22.17.0', 'installation', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.posix.join(appDataDirectory, 'npm'),
  ];

  for (const directory of supportedDirectories) {
    const expectedExecutable = path.posix.join(directory, 'codex');
    const resolveCodexExecutable = createResolver({ existingPaths: [expectedExecutable] });
    assert.equal(resolveCodexExecutable(), expectedExecutable, directory);
  }
});

test('resolver uses the first PATH match and checks Windows executable names in order', () => {
  const firstCommand = path.posix.join('/path/first', 'codex.cmd');
  const firstExecutable = path.posix.join('/path/first', 'codex.exe');
  const secondExecutable = path.posix.join('/path/second', 'codex.exe');
  const resolveCodexExecutable = createResolver({
    platform: 'win32',
    existingPaths: [firstCommand, firstExecutable, secondExecutable],
  });

  assert.equal(resolveCodexExecutable(), firstExecutable);
});

test('resolver throws when no Codex installation exists', () => {
  const resolveCodexExecutable = createResolver();

  assert.throws(
    () => resolveCodexExecutable(),
    /Could not locate the Codex executable in any configured search directory/,
  );
});
