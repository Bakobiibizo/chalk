import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateExpression } from '../src/math-parser.js';

test('scientific calculator evaluates constants, logarithms, roots, and powers', () => {
  assert.equal(calculateExpression('log(1000)'), '3');
  assert.equal(calculateExpression('ln(e)'), '1');
  assert.equal(calculateExpression('sqrt(16) + 2^3'), '12');
  assert.equal(calculateExpression('cos(pi)'), '-1');
});

test('scientific calculator applies degree mode to trigonometric functions', () => {
  assert.equal(calculateExpression('sin(30)', { angleMode: 'DEG' }), '0.5');
  assert.equal(calculateExpression('tan(45)', { angleMode: 'DEG' }), '1');
});

test('scientific calculator rejects identifiers outside its function allowlist', () => {
  assert.throws(() => calculateExpression('globalThis.process'), /numeric LaTeX expressions/);
  assert.throws(() => calculateExpression('random()'), /numeric LaTeX expressions/);
});
