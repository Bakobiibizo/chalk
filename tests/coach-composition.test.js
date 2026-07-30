import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { composeCoach, createCoachService } from '../src/coach-composition.js';

function replaceGlobal(name, value) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (previousDescriptor) Object.defineProperty(globalThis, name, previousDescriptor);
    else delete globalThis[name];
  };
}

test('coach composition injects one desktop bridge into the service and panel', (context) => {
  const dom = new JSDOM('<div id="codex-status"></div>', {
    url: 'http://localhost:5173/',
  });
  const injectedBridge = {
    codexPort: 4312,
    codexToken: 'injected token',
    openChatPopout() {
      return Promise.resolve();
    },
  };
  const restoreGlobals = [
    replaceGlobal('document', dom.window.document),
    replaceGlobal('location', dom.window.location),
    replaceGlobal('localStorage', dom.window.localStorage),
    replaceGlobal('chalkDesktop', {
      codexPort: 9999,
      codexToken: 'hidden global token',
    }),
  ];
  context.after(() => {
    for (const restore of restoreGlobals.reverse()) restore();
    dom.window.close();
  });

  const activeSession = () => null;
  const persistSession = () => {};
  const createIdentifier = () => 9001;
  const createTimestamp = () => '2026-07-25T12:00:00.000Z';
  const coachService = createCoachService({
    configuredUrl: null,
    desktopBridge: injectedBridge,
    location: dom.window.location,
    statusElement: dom.window.document.querySelector('#codex-status'),
    activeSession,
    activeThread: () => null,
    persistSession,
    createTimestamp,
  });
  const coach = composeCoach({
    coachService,
    desktopBridge: injectedBridge,
    activeSession,
    persistSession,
    renderLatex() {},
    showToast() {},
    beforeOpen() {},
    prepareRequest() {},
    createIdentifier,
    createTimestamp,
  });
  context.after(() => coach.destroy());

  assert.equal(coach.service.client.url, 'ws://127.0.0.1:4312/codex?token=injected%20token');
  assert.equal(coach.service.createTimestamp, createTimestamp);
  assert.equal(coach.panel.popout.desktopBridge, injectedBridge);
  assert.equal(coach.panel.history.createIdentifier, createIdentifier);
  assert.equal(coach.panel.history.createTimestamp, createTimestamp);
});
