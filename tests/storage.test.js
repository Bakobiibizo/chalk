import assert from 'node:assert/strict';
import test from 'node:test';

import { loadJson, saveJson } from '../src/storage.js';

test('shared JSON storage reports malformed data and propagates the parse error', () => {
  const parseDiagnostics = [];
  const fallback = [];
  assert.throws(
    () =>
      loadJson('settings', fallback, {
        storage: {
          getItem() {
            return '{invalid';
          },
        },
        onDiagnostic: (diagnostic) => parseDiagnostics.push(diagnostic),
      }),
    SyntaxError,
  );

  assert.equal(parseDiagnostics.length, 1);
  assert.equal(parseDiagnostics[0].code, 'STORAGE_PARSE_FAILED');
  assert.equal(parseDiagnostics[0].boundary, 'shared storage');
  assert.equal(parseDiagnostics[0].operation, 'parse');
  assert.equal(parseDiagnostics[0].key, 'settings');
  assert.ok(parseDiagnostics[0].error instanceof SyntaxError);
});

test('shared JSON storage reports read and write failures explicitly', () => {
  const readError = new Error('storage access denied');
  const diagnostics = [];
  const fallback = { enabled: false };
  const storage = {
    getItem() {
      throw readError;
    },
    setItem() {
      throw readError;
    },
  };

  assert.throws(
    () =>
      loadJson('settings', fallback, {
        storage,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    readError,
  );
  assert.throws(
    () =>
      saveJson(
        'settings',
        { enabled: true },
        {
          storage,
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    readError,
  );
  assert.deepEqual(
    diagnostics.map(({ code, operation, error }) => ({ code, operation, error })),
    [
      { code: 'STORAGE_READ_FAILED', operation: 'read', error: readError },
      { code: 'STORAGE_WRITE_FAILED', operation: 'write', error: readError },
    ],
  );
});

test('shared JSON storage treats missing values as normal and persists valid values', () => {
  const diagnostics = [];
  let stored = null;
  const storage = {
    getItem() {
      return stored;
    },
    setItem(_key, value) {
      stored = value;
    },
  };
  const fallback = { theme: 'paper' };

  assert.equal(
    loadJson('settings', fallback, {
      storage,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    fallback,
  );
  assert.equal(
    saveJson(
      'settings',
      { theme: 'night' },
      {
        storage,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    ),
    true,
  );
  assert.deepEqual(
    loadJson('settings', fallback, {
      storage,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    { theme: 'night' },
  );
  assert.deepEqual(diagnostics, []);
});
