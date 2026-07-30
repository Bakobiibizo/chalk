const CODEX_COMMAND_NAME = 'codex';

const WINDOWS_EXECUTABLE_NAMES = Object.freeze([
  'codex.exe',
  'codex.cmd',
  'codex.bat',
  CODEX_COMMAND_NAME,
]);
const POSIX_EXECUTABLE_NAMES = Object.freeze([CODEX_COMMAND_NAME]);

/**
 * @typedef {(directory: string) => import('node:fs').Dirent[]} ReadDirectory
 * @typedef {(...segments: string[]) => string} JoinPath
 *
 * @typedef {{
 *   rootDirectory: string,
 *   suffixSegments: readonly string[],
 *   readDirectory: ReadDirectory,
 *   joinPath: JoinPath,
 * }} VersionedInstallationDependencies
 *
 * @typedef {{
 *   platform: NodeJS.Platform,
 *   pathDelimiter: string,
 *   joinPath: JoinPath,
 *   readDirectory: ReadDirectory,
 *   pathExists: (path: string) => boolean,
 *   getHomeDirectory: () => string,
 *   getEnvironmentVariable: (name: string) => string | undefined,
 * }} CodexExecutableResolverDependencies
 */

/**
 * @param {VersionedInstallationDependencies} dependencies
 * @returns {string[]}
 */
export function enumerateVersionedInstallationDirectories({
  rootDirectory,
  suffixSegments,
  readDirectory,
  joinPath,
}) {
  try {
    return readDirectory(rootDirectory)
      .filter((entry) => entry.isDirectory())
      .map((entry) => joinPath(rootDirectory, entry.name, ...suffixSegments));
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * @param {CodexExecutableResolverDependencies} dependencies
 * @returns {() => string}
 */
export function createCodexExecutableResolver({
  platform,
  pathDelimiter,
  joinPath,
  readDirectory,
  pathExists,
  getHomeDirectory,
  getEnvironmentVariable,
}) {
  if (typeof platform !== 'string') {
    throw new TypeError('Codex executable resolver requires a platform.');
  }
  if (typeof pathDelimiter !== 'string' || !pathDelimiter) {
    throw new TypeError('Codex executable resolver requires a path delimiter.');
  }
  if (typeof joinPath !== 'function') {
    throw new TypeError('Codex executable resolver requires a path join policy.');
  }
  if (typeof readDirectory !== 'function') {
    throw new TypeError('Codex executable resolver requires a directory read policy.');
  }
  if (typeof pathExists !== 'function') {
    throw new TypeError('Codex executable resolver requires a path existence policy.');
  }
  if (typeof getHomeDirectory !== 'function') {
    throw new TypeError('Codex executable resolver requires a home directory provider.');
  }
  if (typeof getEnvironmentVariable !== 'function') {
    throw new TypeError('Codex executable resolver requires an environment provider.');
  }

  const executableNames = platform === 'win32' ? WINDOWS_EXECUTABLE_NAMES : POSIX_EXECUTABLE_NAMES;

  return function resolveCodexExecutable() {
    const homeDirectory = getHomeDirectory();
    const appDataDirectory = getEnvironmentVariable('APPDATA');
    /**
     * @param {string} rootDirectory
     * @param {readonly string[]} suffixSegments
     */
    const versionedDirectories = (rootDirectory, suffixSegments) =>
      enumerateVersionedInstallationDirectories({
        rootDirectory,
        suffixSegments,
        readDirectory,
        joinPath,
      });
    const searchDirectories = [
      ...String(getEnvironmentVariable('PATH') || '').split(pathDelimiter),
      joinPath(homeDirectory, '.local', 'bin'),
      joinPath(homeDirectory, '.local', 'share', 'pnpm'),
      joinPath(homeDirectory, '.npm-global', 'bin'),
      joinPath(homeDirectory, 'Library', 'pnpm'),
      joinPath(homeDirectory, '.volta', 'bin'),
      joinPath(homeDirectory, '.asdf', 'shims'),
      joinPath(homeDirectory, '.bun', 'bin'),
      ...versionedDirectories(joinPath(homeDirectory, '.nvm', 'versions', 'node'), ['bin']),
      ...versionedDirectories(joinPath(homeDirectory, '.fnm', 'node-versions'), [
        'installation',
        'bin',
      ]),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      appDataDirectory ? joinPath(appDataDirectory, 'npm') : '',
    ].filter(Boolean);

    for (const directory of new Set(searchDirectories)) {
      for (const executableName of executableNames) {
        const candidate = joinPath(directory, executableName);
        if (pathExists(candidate)) return candidate;
      }
    }

    throw new Error('Could not locate the Codex executable in any configured search directory.');
  };
}
