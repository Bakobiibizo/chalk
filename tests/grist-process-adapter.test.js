import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  createGristProcessAdapter,
  GRIST_TIMEOUT_MILLISECONDS,
} from '../src/grist-process-adapter.js';

function nodeSpawnPolicy(script, requests = []) {
  return (request) => {
    requests.push(request);
    return spawn(process.execPath, ['-e', script], request.options);
  };
}

test('Grist process adapter writes model output and parses the JSON result', async () => {
  const requests = [];
  const adapter = createGristProcessAdapter({
    spawnPolicy: nodeSpawnPolicy(
      `
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          input += chunk;
        });
        process.stdin.on('end', () => {
          process.stdout.write(JSON.stringify({ parser: 'grist', input }));
        });
      `,
      requests,
    ),
  });

  const result = await adapter.parseModelJson('model response');

  assert.deepEqual(result, { parser: 'grist', input: 'model response' });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    command: 'grist',
    arguments: ['parse', 'model-output', '-', '--json-value'],
    options: { stdio: ['pipe', 'pipe', 'pipe'] },
  });
  assert.ok(Object.isFrozen(requests[0]));
  assert.ok(Object.isFrozen(requests[0].arguments));
  assert.ok(Object.isFrozen(requests[0].options));
});

test('Grist process adapter maps a child spawn error', async () => {
  const adapter = createGristProcessAdapter({
    spawnPolicy: (request) =>
      spawn('chalk-grist-command-that-does-not-exist', request.arguments, request.options),
  });

  await assert.rejects(
    adapter.parseModelJson('model response'),
    /Could not start grist: spawn chalk-grist-command-that-does-not-exist ENOENT/,
  );
});

test('Grist process adapter reports captured stderr for a nonzero exit', async () => {
  const adapter = createGristProcessAdapter({
    spawnPolicy: nodeSpawnPolicy(`
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stderr.write('Grist rejected the model output');
        process.exitCode = 7;
      });
    `),
  });

  await assert.rejects(adapter.parseModelJson('model response'), /Grist rejected the model output/);
});

test('Grist process adapter maps an invalid successful JSON result', async () => {
  const adapter = createGristProcessAdapter({
    spawnPolicy: nodeSpawnPolicy(`
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stdout.write('not json');
      });
    `),
  });

  await assert.rejects(
    adapter.parseModelJson('model response'),
    /Grist returned invalid JSON: Unexpected token/,
  );
});

test('Grist process adapter defaults to ten minutes and propagates its timeout', async () => {
  assert.equal(GRIST_TIMEOUT_MILLISECONDS, 10 * 60 * 1_000);
  const adapter = createGristProcessAdapter({
    timeoutMilliseconds: 10,
    spawnPolicy: nodeSpawnPolicy(`
      process.stdin.resume();
      setInterval(() => {}, 1000);
    `),
  });

  await assert.rejects(adapter.parseModelJson('model response'), /Grist JSON parser timed out/);
});
