const GRIST_COMMAND = 'grist';
const GRIST_ARGUMENTS = Object.freeze(['parse', 'model-output', '-', '--json-value']);
const GRIST_STDIO = Object.freeze(['pipe', 'pipe', 'pipe']);

export const GRIST_TIMEOUT_MILLISECONDS = 10 * 60 * 1_000;
const STDERR_CAPTURE_LIMIT = 2_000;

/**
 * @typedef {import('./node-process-contracts.js').PipedSpawnOptions} PipedSpawnOptions
 * @typedef {import('./node-process-contracts.js').PipedSpawnRequest} PipedSpawnRequest
 * @typedef {import('./node-process-contracts.js').PipedSpawnPolicy} PipedSpawnPolicy
 */

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @returns {PipedSpawnRequest} */
function createSpawnRequest() {
  return Object.freeze({
    command: GRIST_COMMAND,
    arguments: GRIST_ARGUMENTS,
    options: Object.freeze(
      /** @type {PipedSpawnOptions} */ ({
        stdio: /** @type {['pipe', 'pipe', 'pipe']} */ ([...GRIST_STDIO]),
      }),
    ),
  });
}

/**
 * @param {{
 *   spawnPolicy?: PipedSpawnPolicy,
 *   timeoutMilliseconds?: number,
 * }} [dependencies]
 */
export function createGristProcessAdapter({
  spawnPolicy,
  timeoutMilliseconds = GRIST_TIMEOUT_MILLISECONDS,
} = {}) {
  if (typeof spawnPolicy !== 'function') {
    throw new TypeError('Grist process adapter requires a spawn policy.');
  }
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new TypeError('Grist process adapter requires a positive timeout.');
  }

  /** @param {string} text */
  const parseModelJson = (text) =>
    /** @type {Promise<unknown>} */ (
      new Promise((resolve, reject) => {
        /** @type {import('./node-process-contracts.js').PipedChildProcess} */
        let child;
        try {
          child = spawnPolicy(createSpawnRequest());
        } catch (error) {
          reject(new Error(`Could not start grist: ${errorMessage(error)}`));
          return;
        }

        let stdout = '';
        let stderr = '';
        let settled = false;

        /** @param {() => void} complete */
        const settle = (complete) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          complete();
        };

        const timeout = setTimeout(() => {
          if (!child.killed) child.kill();
          settle(() => reject(new Error('Grist JSON parser timed out.')));
        }, timeoutMilliseconds);

        child.stdout.on('data', (/** @type {Buffer | string} */ chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (/** @type {Buffer | string} */ chunk) => {
          stderr = `${stderr}${chunk}`.slice(-STDERR_CAPTURE_LIMIT);
        });
        child.on('error', (error) => {
          settle(() => reject(new Error(`Could not start grist: ${errorMessage(error)}`)));
        });
        child.on('exit', (code) => {
          settle(() => {
            if (code !== 0) {
              reject(new Error(stderr.trim() || `Grist exited with code ${code}`));
              return;
            }

            try {
              resolve(JSON.parse(stdout));
            } catch (error) {
              reject(new Error(`Grist returned invalid JSON: ${errorMessage(error)}`));
            }
          });
        });

        child.stdin.end(String(text || ''));
      })
    );

  return Object.freeze({ parseModelJson });
}
