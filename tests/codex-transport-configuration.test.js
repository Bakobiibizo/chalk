import assert from 'node:assert/strict';
import test from 'node:test';

import { CODEX_MAX_PAYLOAD_BYTES } from '../src/codex-transport-configuration.js';

test('Codex image transport allows 100 MiB messages in development and desktop bridges', () => {
  assert.equal(CODEX_MAX_PAYLOAD_BYTES, 100 * 1024 * 1024);
});
