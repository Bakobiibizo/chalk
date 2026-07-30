import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { CoachPopoutController } from '../src/coach-popout-controller.js';

test('coach popout owns escaped mirror markup and desktop synchronization', async () => {
  const dom = new JSDOM();
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  const documents = [];
  const toasts = [];
  const controller = new CoachPopoutController({
    desktopBridge: {
      openChatPopout: async (html) => {
        documents.push(html);
      },
    },
    getSession: () => ({ title: 'Algebra <project>' }),
    getActiveThread: () => ({
      title: 'Solve <x>',
      messages: [{ role: 'user', text: 'Is x < 3?' }],
    }),
    showToast: (message) => {
      toasts.push(message);
    },
  });

  try {
    const markup = controller.markup();
    assert.match(markup, /Solve &lt;x&gt;/);
    assert.match(markup, /Algebra &lt;project&gt;/);
    assert.match(markup, /Is x &lt; 3\?/);

    await controller.open();
    assert.equal(controller.popoutWindow, 'desktop');
    assert.equal(documents.length, 1);
    assert.deepEqual(toasts, ['Chat opened in a separate window']);

    controller.sync();
    await Promise.resolve();
    assert.equal(documents.length, 2);
    controller.destroy();
    assert.equal(controller.popoutWindow, null);
  } finally {
    globalThis.document = previousDocument;
    dom.window.close();
  }
});

test('coach popout propagates desktop failures without opening a browser fallback', async () => {
  const dom = new JSDOM();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = dom.window.document;
  const toasts = [];
  let browserOpenCalls = 0;
  globalThis.window = {
    open: () => {
      browserOpenCalls += 1;
      return null;
    },
  };
  const controller = new CoachPopoutController({
    desktopBridge: {
      openChatPopout: async () => {
        throw new Error('desktop unavailable');
      },
    },
    getSession: () => ({ title: 'Project' }),
    getActiveThread: () => null,
    showToast: (message) => {
      toasts.push(message);
    },
  });
  try {
    await assert.rejects(controller.open(), /desktop unavailable/);
    assert.deepEqual(toasts, []);
    assert.equal(browserOpenCalls, 0);
    assert.equal(controller.popoutWindow, null);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    dom.window.close();
  }
});
