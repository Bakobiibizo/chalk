import { WebSocketServer } from 'ws';

import { createCodexStdioSession } from './codex-stdio-session-adapter.js';
import { CODEX_MAX_PAYLOAD_BYTES } from './codex-transport-configuration.js';

const CODEX_PATH = '/codex';
const CODEX_ERROR_CLOSE_CODE = 1011;
const CLOSE_REASON_LIMIT = 120;

/**
 * @typedef {import('./node-process-contracts.js').PipedSpawnPolicy} PipedSpawnPolicy
 * @typedef {import('vite').Plugin} Plugin
 * @typedef {import('vite').ViteDevServer | import('vite').PreviewServer} ViteServer
 */

/** @param {unknown} reason */
function boundedCloseReason(reason) {
  let result = '';
  let byteLength = 0;

  for (const character of String(reason)) {
    const characterByteLength = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterByteLength > CLOSE_REASON_LIMIT) break;
    result += character;
    byteLength += characterByteLength;
  }

  return result;
}

/**
 * @param {{
 *   spawnPolicy?: PipedSpawnPolicy,
 *   workingDirectory?: string,
 * }} [dependencies]
 * @returns {Plugin}
 */
export function createViteCodexAppService({ spawnPolicy, workingDirectory } = {}) {
  /** @param {ViteServer} server */
  const attachBridge = (server) => {
    const webSockets = new WebSocketServer({
      noServer: true,
      maxPayload: CODEX_MAX_PAYLOAD_BYTES,
    });
    if (!server.httpServer) {
      throw new Error('Codex app service requires a Vite HTTP server.');
    }

    server.httpServer.on('upgrade', (request, socket, head) => {
      if (request.url !== CODEX_PATH) return;

      webSockets.handleUpgrade(request, socket, head, (client) => {
        const session = createCodexStdioSession({
          spawnPolicy,
          workingDirectory,
          sendToClient: (message) => {
            if (client.readyState === client.OPEN) client.send(message);
          },
          closeClient: (reason) => {
            if (client.readyState === client.OPEN) {
              client.close(CODEX_ERROR_CLOSE_CODE, boundedCloseReason(reason));
            }
          },
        });

        client.on('message', (message) => session.send(message));
        client.on('close', () => session.stop());
        client.on('error', () => session.stop());
      });
    });
  };

  return {
    name: 'chalk-codex-app-service',
    configureServer: attachBridge,
    configurePreviewServer: attachBridge,
  };
}
