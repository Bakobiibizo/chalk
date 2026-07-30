import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCoachRequest } from '../src/coach-request-builder.js';

test('coach request builder includes the page image and active lesson byte-for-byte', () => {
  const request = buildCoachRequest({
    prompt: 'What next?',
    sketch: { pageTitle: { value: 'Adapter project' } },
    activeLesson: {
      title: 'Variables',
      topic: 'Algebra',
      explanation: 'Use inverse operations.',
      example: 'x + 1 = 2',
      practice: 'Solve it.',
      hint: 'Subtract one.',
    },
    pageImageDataURL: 'data:image/png;base64,AA==',
  });

  assert.deepEqual(request, {
    image: 'data:image/png;base64,AA==',
    request: `The learner shared their handwritten page titled "Adapter project".
Active lesson content:
Title: Variables
Topic: Algebra
Explanation: Use inverse operations.
Example: x + 1 = 2
Practice: Solve it.
Hint: Subtract one.
Learner request: What next?
Respond as a patient tutor. Be concise, use the visible work and lesson content as evidence, and prefer a useful next step over giving away the answer.`,
  });
});

test('coach request builder omits lesson context when no lesson is active', () => {
  const request = buildCoachRequest({
    prompt: 'Check this proof.',
    sketch: { pageTitle: { value: 'Geometry notes' } },
    activeLesson: null,
    pageImageDataURL: 'data:image/png;base64,BB==',
  });

  assert.deepEqual(request, {
    image: 'data:image/png;base64,BB==',
    request: `The learner shared their handwritten page titled "Geometry notes".
Learner request: Check this proof.
Respond as a patient tutor. Be concise, use the visible work and lesson content as evidence, and prefer a useful next step over giving away the answer.`,
  });
});
