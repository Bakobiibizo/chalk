import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createCodexStdioSession } from '../src/codex-stdio-session-adapter.js';

function nodeSpawnPolicy(script, requests = []) {
  return (request) => {
    requests.push(request);
    return spawn(process.execPath, ['-e', script], request.options);
  };
}

test('Codex stdio session forwards newline-delimited JSON in both directions', async () => {
  const requests = [];
  const clientMessages = [];
  let resolveMessages;
  const messagesReceived = new Promise((resolve) => {
    resolveMessages = resolve;
  });
  const session = createCodexStdioSession({
    workingDirectory: process.cwd(),
    spawnPolicy: nodeSpawnPolicy(
      `
        const readline = require('node:readline');
        const input = readline.createInterface({ input: process.stdin });
        input.on('line', (line) => {
          process.stdout.write(JSON.stringify({ received: JSON.parse(line) }) + '\\n');
        });
      `,
      requests,
    ),
    sendToClient: (message) => {
      clientMessages.push(message);
      if (clientMessages.length === 2) resolveMessages();
    },
    closeClient: (reason) => {
      assert.fail(`Client closed unexpectedly: ${reason}`);
    },
  });

  assert.equal(session.send('{"id":1,"method":"thread/start"}'), true);
  assert.equal(session.send(Buffer.from('{"id":2,"method":"turn/start"}')), true);
  await messagesReceived;

  assert.deepEqual(
    clientMessages.map((message) => JSON.parse(message)),
    [
      { received: { id: 1, method: 'thread/start' } },
      { received: { id: 2, method: 'turn/start' } },
    ],
  );
  assert.deepEqual(requests, [
    {
      command: 'codex',
      arguments: ['app-server', '--listen', 'stdio://'],
      options: {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      },
    },
  ]);
  assert.ok(Object.isFrozen(requests[0]));
  assert.ok(Object.isFrozen(requests[0].arguments));
  assert.ok(Object.isFrozen(requests[0].options));
  session.stop();
});

test('Codex stdio session reports an asynchronous child process error', async () => {
  let resolveClose;
  const clientClosed = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const session = createCodexStdioSession({
    spawnPolicy: (request) =>
      spawn('chalk-codex-command-that-does-not-exist', request.arguments, request.options),
    sendToClient: () => {},
    closeClient: resolveClose,
  });

  assert.match(
    await clientClosed,
    /Could not start Codex: spawn chalk-codex-command-that-does-not-exist ENOENT/,
  );
  assert.equal(session.isStopped(), true);
});

test('Codex stdio session reports captured stderr when its child exits', async () => {
  let resolveClose;
  const clientClosed = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const session = createCodexStdioSession({
    spawnPolicy: nodeSpawnPolicy(`
      process.stderr.write('Codex rejected the request');
      process.exitCode = 7;
    `),
    sendToClient: () => {},
    closeClient: resolveClose,
  });

  assert.equal(await clientClosed, 'Codex rejected the request');
  assert.equal(session.isStopped(), true);
});

test('Codex stdio session closes the client instead of writing to unwritable stdin', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = Object.assign(new EventEmitter(), {
    writable: false,
    writeCount: 0,
    write() {
      this.writeCount += 1;
      return true;
    },
  });
  child.killed = false;
  child.killCount = 0;
  child.kill = () => {
    child.killed = true;
    child.killCount += 1;
    return true;
  };
  const closeReasons = [];
  const session = createCodexStdioSession({
    spawnPolicy: () => child,
    sendToClient: () => {},
    closeClient: (reason) => closeReasons.push(reason),
  });

  assert.equal(session.send('{"id":1}'), false);
  assert.deepEqual(closeReasons, ['Codex app service input is not writable.']);
  assert.equal(child.stdin.writeCount, 0);
  assert.equal(child.killCount, 1);
  assert.equal(session.isStopped(), true);
});

test('Codex stdio session stop is idempotent and terminates its owned child once', async () => {
  let child;
  let killCount = 0;
  const session = createCodexStdioSession({
    spawnPolicy: (request) => {
      child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], request.options);
      const kill = child.kill.bind(child);
      child.kill = (...arguments_) => {
        killCount += 1;
        return kill(...arguments_);
      };
      return child;
    },
    sendToClient: () => {},
    closeClient: (reason) => {
      assert.fail(`Client closed unexpectedly: ${reason}`);
    },
  });
  const childExited = once(child, 'exit');

  assert.equal(session.stop(), true);
  assert.equal(session.stop(), false);
  await childExited;

  assert.equal(killCount, 1);
  assert.equal(session.isStopped(), true);
  assert.equal(session.send('{"id":1}'), false);
});
