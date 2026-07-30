import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';

import { createViteCodexAppService } from '../src/vite-codex-app-service.js';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function nodeSpawnPolicy(script, requests, children) {
  return (request) => {
    requests.push(request);
    const child = spawn(process.execPath, ['-e', script], request.options);
    children.push(child);
    return child;
  };
}

async function verifyBridgeHook(hookName) {
  const requests = [];
  const children = [];
  const plugin = createViteCodexAppService({
    workingDirectory: process.cwd(),
    spawnPolicy: nodeSpawnPolicy(
      `
        const readline = require('node:readline');
        const input = readline.createInterface({ input: process.stdin });
        input.on('line', (line) => process.stdout.write(line + '\\n'));
      `,
      requests,
      children,
    ),
  });
  const server = http.createServer();
  plugin[hookName]({ httpServer: server });
  const port = await listen(server);
  const client = new WebSocket(`ws://127.0.0.1:${port}/codex`);

  await once(client, 'open');
  const response = once(client, 'message');
  client.send('{"id":129,"method":"thread/start"}');
  const [message] = await response;

  assert.equal(message.toString(), '{"id":129,"method":"thread/start"}');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    command: 'codex',
    arguments: ['app-server', '--listen', 'stdio://'],
    options: {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    },
  });

  const childExit = once(children[0], 'exit');
  const clientClose = once(client, 'close');
  client.close();
  await clientClose;
  const [, signal] = await childExit;

  assert.ok(signal, 'closing the WebSocket must terminate its owned Codex process');
  await closeServer(server);
}

test('Vite Codex bridge uses one stdio session in development', async () => {
  await verifyBridgeHook('configureServer');
});

test('Vite Codex bridge uses one stdio session in preview', async () => {
  await verifyBridgeHook('configurePreviewServer');
});

test('Vite Codex bridge bounds adapter failures for WebSocket close reasons', async () => {
  const plugin = createViteCodexAppService({
    spawnPolicy: nodeSpawnPolicy(
      `
        process.stderr.write('🙂'.repeat(500));
        process.exitCode = 9;
      `,
      [],
      [],
    ),
  });
  const server = http.createServer();
  plugin.configureServer({ httpServer: server });
  const port = await listen(server);
  const client = new WebSocket(`ws://127.0.0.1:${port}/codex`);
  const clientClose = once(client, 'close');

  await once(client, 'open');
  const [code, reason] = await clientClose;

  assert.equal(code, 1011);
  assert.equal(reason.toString(), '🙂'.repeat(30));
  assert.equal(reason.byteLength, 120);
  await closeServer(server);
});
