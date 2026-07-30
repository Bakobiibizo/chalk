import readline from 'node:readline';

const CODEX_COMMAND = 'codex';
const CODEX_ARGUMENTS = Object.freeze(['app-server', '--listen', 'stdio://']);
const CODEX_STDIO = Object.freeze(['pipe', 'pipe', 'pipe']);
const STDERR_CAPTURE_LIMIT = 3_000;

/**
 * @typedef {import('./node-process-contracts.js').PipedChildProcess} PipedChildProcess
 * @typedef {import('./node-process-contracts.js').PipedSpawnOptions} PipedSpawnOptions
 * @typedef {import('./node-process-contracts.js').PipedSpawnRequest} PipedSpawnRequest
 * @typedef {import('./node-process-contracts.js').PipedSpawnPolicy} PipedSpawnPolicy
 *
 * @typedef {{
 *   toString: () => string,
 * }} CodexClientMessage
 *
 * @typedef {{
 *   send: (message: CodexClientMessage) => boolean,
 *   stop: () => boolean,
 *   isStopped: () => boolean,
 * }} CodexStdioSession
 */

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} command
 * @param {string | undefined} workingDirectory
 * @returns {PipedSpawnRequest}
 */
function createSpawnRequest(command, workingDirectory) {
  /** @type {PipedSpawnOptions} */
  const options = {
    stdio: /** @type {['pipe', 'pipe', 'pipe']} */ ([...CODEX_STDIO]),
  };
  if (workingDirectory !== undefined) options.cwd = workingDirectory;

  return Object.freeze({
    command,
    arguments: CODEX_ARGUMENTS,
    options: Object.freeze(options),
  });
}

/**
 * @param {{
 *   spawnPolicy?: PipedSpawnPolicy,
 *   command?: string,
 *   workingDirectory?: string,
 *   sendToClient?: (message: string) => void,
 *   closeClient?: (reason: string) => void,
 * }} [dependencies]
 * @returns {CodexStdioSession}
 */
export function createCodexStdioSession({
  spawnPolicy,
  command = CODEX_COMMAND,
  workingDirectory,
  sendToClient,
  closeClient,
} = {}) {
  if (typeof spawnPolicy !== 'function') {
    throw new TypeError('Codex stdio session requires a spawn policy.');
  }
  if (typeof command !== 'string' || !command.trim()) {
    throw new TypeError('Codex stdio session requires a non-empty command.');
  }
  if (workingDirectory !== undefined && typeof workingDirectory !== 'string') {
    throw new TypeError('Codex stdio session working directory must be a string.');
  }
  if (typeof sendToClient !== 'function') {
    throw new TypeError('Codex stdio session requires a client message callback.');
  }
  if (typeof closeClient !== 'function') {
    throw new TypeError('Codex stdio session requires a client close callback.');
  }

  /** @type {PipedChildProcess | null} */
  let child = null;
  /** @type {import('node:readline').Interface | null} */
  let output = null;
  let stderr = '';
  let stopped = false;
  let childExited = false;
  let clientClosed = false;

  const stop = () => {
    if (stopped) return false;
    stopped = true;
    output?.close();
    if (child && !childExited && !child.killed) child.kill();
    return true;
  };

  /** @param {string} reason */
  const closeClientAndStop = (reason) => {
    if (stopped || clientClosed) return;
    clientClosed = true;
    try {
      closeClient(reason);
    } finally {
      stop();
    }
  };

  /** @param {CodexClientMessage} message */
  const send = (message) => {
    if (stopped) return false;
    if (!child?.stdin?.writable) {
      closeClientAndStop('Codex app service input is not writable.');
      return false;
    }

    try {
      return child.stdin.write(`${message.toString()}\n`);
    } catch (error) {
      closeClientAndStop(`Could not write to Codex: ${errorMessage(error)}`);
      return false;
    }
  };

  const session = Object.freeze({
    send,
    stop,
    isStopped: () => stopped,
  });

  try {
    child = spawnPolicy(createSpawnRequest(command, workingDirectory));
  } catch (error) {
    closeClientAndStop(`Could not start Codex: ${errorMessage(error)}`);
    return session;
  }

  output = readline.createInterface({ input: child.stdout });
  output.on('line', (line) => {
    if (!stopped) sendToClient(line);
  });
  child.stderr.on('data', (/** @type {Buffer | string} */ chunk) => {
    stderr = `${stderr}${chunk}`.slice(-STDERR_CAPTURE_LIMIT);
  });
  child.stdin.on('error', (error) => {
    closeClientAndStop(`Could not write to Codex: ${errorMessage(error)}`);
  });
  child.on('error', (error) => {
    closeClientAndStop(`Could not start Codex: ${errorMessage(error)}`);
  });
  child.on('exit', (code) => {
    childExited = true;
    if (stopped) return;
    const reason = stderr.trim() || `Codex app service exited with code ${code}`;
    closeClientAndStop(reason);
  });

  return session;
}
