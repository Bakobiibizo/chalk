import { randomBytes } from 'node:crypto';
import http from 'node:http';

import { WebSocketServer } from 'ws';

import { createCodexStdioSession } from '../src/codex-stdio-session-adapter.js';
import { CODEX_MAX_PAYLOAD_BYTES } from '../src/codex-transport-configuration.js';

const CODEX_PATH = '/codex';
const LOOPBACK_HOST = '127.0.0.1';
const CODEX_ERROR_CLOSE_CODE = 1011;
const BRIDGE_CLOSE_CODE = 1001;
const CLOSE_REASON_LIMIT = 120;

/**
 * @typedef {import('../src/node-process-contracts.js').PipedSpawnPolicy} PipedSpawnPolicy
 * @typedef {import('../src/codex-stdio-session-adapter.js').CodexStdioSession} CodexStdioSession
 * @typedef {import('ws').WebSocket} WebSocket
 *
 * @typedef {{
 *   port: number,
 *   token: string,
 *   close: () => boolean,
 * }} ElectronCodexBridge
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

/** @returns {string} */
function defaultTokenProvider() {
  return randomBytes(32).toString('hex');
}

/**
 * @param {{
 *   spawnPolicy?: PipedSpawnPolicy,
 *   resolveExecutable?: () => string,
 *   workingDirectory?: string,
 *   tokenProvider?: () => string,
 * }} [dependencies]
 * @returns {Promise<ElectronCodexBridge>}
 */
export function startElectronCodexBridge({
  spawnPolicy,
  resolveExecutable,
  workingDirectory,
  tokenProvider = defaultTokenProvider,
} = {}) {
  if (typeof spawnPolicy !== 'function') {
    throw new TypeError('Electron Codex bridge requires a spawn policy.');
  }
  if (typeof resolveExecutable !== 'function') {
    throw new TypeError('Electron Codex bridge requires an executable resolver.');
  }
  if (typeof workingDirectory !== 'string') {
    throw new TypeError('Electron Codex bridge requires a working directory.');
  }
  if (typeof tokenProvider !== 'function') {
    throw new TypeError('Electron Codex bridge requires a token provider.');
  }

  const token = tokenProvider();
  if (typeof token !== 'string' || !token) {
    throw new TypeError('Electron Codex bridge token provider returned an invalid token.');
  }

  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: CODEX_MAX_PAYLOAD_BYTES,
  });
  const server = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  /** @type {Map<WebSocket, CodexStdioSession>} */
  const sessions = new Map();
  let closed = false;

  /**
   * @param {WebSocket} client
   * @param {CodexStdioSession} session
   */
  const stopSession = (client, session) => {
    session.stop();
    sessions.delete(client);
  };

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', `http://${LOOPBACK_HOST}`);
    if (requestUrl.pathname !== CODEX_PATH || requestUrl.searchParams.get('token') !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    webSockets.handleUpgrade(request, socket, head, (client) => {
      webSockets.emit('connection', client, request);
    });
  });

  webSockets.on('connection', (client) => {
    const session = createCodexStdioSession({
      spawnPolicy,
      command: resolveExecutable(),
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

    if (!session.isStopped()) sessions.set(client, session);
    client.on('message', (message) => session.send(message));
    client.once('close', () => stopSession(client, session));
    client.once('error', () => stopSession(client, session));
  });

  const close = () => {
    if (closed) return false;
    closed = true;

    for (const [client, session] of sessions) {
      session.stop();
      if (client.readyState === client.OPEN) {
        client.close(BRIDGE_CLOSE_CODE, 'Chalk window closed');
      }
    }
    sessions.clear();
    webSockets.close();
    server.close();
    return true;
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        close();
        reject(new Error('Electron Codex bridge did not receive a loopback TCP port.'));
        return;
      }

      resolve(
        Object.freeze({
          port: address.port,
          token,
          close,
        }),
      );
    });
  });
}
