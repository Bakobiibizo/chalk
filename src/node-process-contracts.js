/**
 * Shared contracts for spawning the piped Node child processes used by the
 * Grist and Codex adapters.
 *
 * @typedef {import('node:child_process').SpawnOptionsWithStdioTuple<
 *   'pipe',
 *   'pipe',
 *   'pipe'
 * >} PipedSpawnOptions
 *
 * @typedef {import('node:child_process').ChildProcessByStdio<
 *   import('node:stream').Writable,
 *   import('node:stream').Readable,
 *   import('node:stream').Readable
 * >} PipedChildProcess
 *
 * @typedef {{
 *   command: string,
 *   arguments: readonly string[],
 *   options: PipedSpawnOptions,
 * }} PipedSpawnRequest
 *
 * @typedef {(request: PipedSpawnRequest) => PipedChildProcess} PipedSpawnPolicy
 */

export {};
