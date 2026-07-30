import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { WebSocket } from 'ws';

import { startElectronCodexBridge } from '../electron/codex-bridge.js';

const token = 'authenticated-electron-test-token';

function nodeSpawnPolicy(script, requests, children) {
  return (request) => {
    requests.push(request);
    const child = spawn(process.execPath, ['-e', script], request.options);
    children.push(child);
    return child;
  };
}

function requestUnauthorizedUpgrade(port, requestPath) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}${requestPath}`);
    client.once('unexpected-response', (_request, response) => {
      const statusCode = response.statusCode;
      response.resume();
      response.socket.destroy();
      resolve(statusCode);
    });
    client.once('open', () => reject(new Error('Unauthorized bridge request was upgraded.')));
    client.once('error', reject);
  });
}

async function connect(bridge) {
  const client = new WebSocket(
    `ws://127.0.0.1:${bridge.port}/codex?token=${encodeURIComponent(bridge.token)}`,
  );
  await once(client, 'open');
  return client;
}

test('Electron Codex bridge authenticates upgrades and preserves the stdio payload contract', async (context) => {
  const requests = [];
  const children = [];
  let resolutionCount = 0;
  const bridge = await startElectronCodexBridge({
    spawnPolicy: nodeSpawnPolicy(
      `
        const readline = require('node:readline');
        const input = readline.createInterface({ input: process.stdin });
        input.on('line', (line) => {
          process.stdout.write(JSON.stringify({
            request: JSON.parse(line),
            workingDirectory: process.cwd()
          }) + '\\n');
        });
      `,
      requests,
      children,
    ),
    resolveExecutable: () => {
      resolutionCount += 1;
      return '/resolved/codex';
    },
    workingDirectory: process.cwd(),
    tokenProvider: () => token,
  });
  context.after(() => bridge.close());

  assert.equal(await requestUnauthorizedUpgrade(bridge.port, '/codex?token=wrong'), 401);
  assert.equal(await requestUnauthorizedUpgrade(bridge.port, `/wrong?token=${token}`), 401);
  assert.equal(requests.length, 0, 'unauthenticated requests must not start Codex');

  const client = await connect(bridge);
  const response = once(client, 'message');
  client.send(Buffer.from('{"id":131,"method":"thread/start"}'));
  const [message] = await response;

  assert.deepEqual(JSON.parse(message.toString()), {
    request: { id: 131, method: 'thread/start' },
    workingDirectory: process.cwd(),
  });
  assert.equal(resolutionCount, 1);
  assert.deepEqual(requests, [
    {
      command: '/resolved/codex',
      arguments: ['app-server', '--listen', 'stdio://'],
      options: {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      },
    },
  ]);

  const childExit = once(children[0], 'exit');
  client.close();
  await once(client, 'close');
  await childExit;
});

test('Electron Codex bridge owns one stdio session per authenticated client', async (context) => {
  const children = [];
  const bridge = await startElectronCodexBridge({
    spawnPolicy: nodeSpawnPolicy(
      `
        const readline = require('node:readline');
        const input = readline.createInterface({ input: process.stdin });
        input.on('line', (line) => process.stdout.write(line + '\\n'));
      `,
      [],
      children,
    ),
    resolveExecutable: () => '/resolved/codex',
    workingDirectory: process.cwd(),
    tokenProvider: () => token,
  });
  context.after(() => bridge.close());
  const firstClient = await connect(bridge);
  const secondClient = await connect(bridge);

  assert.equal(children.length, 2);
  const firstChildExit = once(children[0], 'exit');
  firstClient.close();
  await once(firstClient, 'close');
  await firstChildExit;

  assert.equal(children[1].exitCode, null, 'closing one client must not stop another session');
  const response = once(secondClient, 'message');
  secondClient.send('{"id":132,"method":"turn/start"}');
  const [message] = await response;
  assert.equal(message.toString(), '{"id":132,"method":"turn/start"}');

  const secondChildExit = once(children[1], 'exit');
  const secondClientClose = once(secondClient, 'close');
  bridge.close();
  await secondChildExit;
  await secondClientClose;
});

test('Electron Codex bridge closes its client with a bounded adapter error', async (context) => {
  const bridge = await startElectronCodexBridge({
    spawnPolicy: nodeSpawnPolicy(
      `
        process.stderr.write('🙂'.repeat(500));
        process.exitCode = 9;
      `,
      [],
      [],
    ),
    resolveExecutable: () => '/resolved/codex',
    workingDirectory: process.cwd(),
    tokenProvider: () => token,
  });
  context.after(() => bridge.close());
  const client = await connect(bridge);
  const [code, reason] = await once(client, 'close');

  assert.equal(code, 1011);
  assert.equal(reason.toString(), '🙂'.repeat(30));
  assert.equal(reason.byteLength, 120);
});
