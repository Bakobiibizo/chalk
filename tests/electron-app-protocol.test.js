import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  CHALK_APP_SCHEME,
  createChalkAppProtocolHandler,
  isDistributionPath,
  normalizeChalkRequestPath,
  registerChalkAppProtocol,
  registerChalkAppScheme,
} from '../electron/app-protocol.js';

test('Chalk application scheme registration preserves its privileged capabilities', () => {
  const registrations = [];

  registerChalkAppScheme({
    registerSchemesAsPrivileged: (schemes) => registrations.push(schemes),
  });

  assert.deepEqual(registrations, [
    [
      {
        scheme: 'chalk',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
        },
      },
    ],
  ]);
  assert.equal(CHALK_APP_SCHEME, 'chalk');
});

test('request path normalization preserves root fallback, decoding, and leading slash removal', () => {
  assert.equal(normalizeChalkRequestPath('chalk://app/'), 'index.html');
  assert.equal(normalizeChalkRequestPath('chalk://app/index.html?theme=dark'), 'index.html');
  assert.equal(
    normalizeChalkRequestPath('chalk://app/assets/lesson%20card.js'),
    'assets/lesson card.js',
  );
  assert.equal(normalizeChalkRequestPath('chalk://app///assets/app.js'), 'assets/app.js');
});

test('distribution containment accepts only the distribution directory and its descendants', () => {
  const distributionDirectory = path.resolve('application', 'dist');

  assert.equal(isDistributionPath(distributionDirectory, distributionDirectory), true);
  assert.equal(
    isDistributionPath(path.join(distributionDirectory, 'assets', 'app.js'), distributionDirectory),
    true,
  );
  assert.equal(
    isDistributionPath(
      path.resolve(distributionDirectory, '..', 'outside.txt'),
      distributionDirectory,
    ),
    false,
  );
  assert.equal(isDistributionPath(`${distributionDirectory}-backup`, distributionDirectory), false);
});

test('protocol handler fetches contained files through Electron networking', async () => {
  const distributionDirectory = path.resolve('application', 'dist');
  const fetchedUrls = [];
  const expectedResponse = new Response('application');
  const handler = createChalkAppProtocolHandler({
    distributionDirectory,
    networkAdapter: {
      fetch: (url) => {
        fetchedUrls.push(url);
        return expectedResponse;
      },
    },
  });

  const response = handler({ url: 'chalk://app/assets/app.js' });

  assert.equal(response, expectedResponse);
  assert.deepEqual(fetchedUrls, [
    pathToFileURL(path.join(distributionDirectory, 'assets', 'app.js')).toString(),
  ]);
});

test('protocol handler rejects decoded traversal before fetching a file', async () => {
  const distributionDirectory = path.resolve('application', 'dist');
  let fetchCount = 0;
  const handler = createChalkAppProtocolHandler({
    distributionDirectory,
    networkAdapter: {
      fetch: () => {
        fetchCount += 1;
      },
    },
  });

  const response = handler({ url: 'chalk://app/%2E%2E%2Foutside.txt' });

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
  assert.equal(fetchCount, 0);
});

test('application protocol registration binds the handler to the Chalk scheme', () => {
  const distributionDirectory = path.resolve('application', 'dist');
  const registrations = [];
  const networkAdapter = {
    fetch: () => new Response('application'),
  };

  const handler = registerChalkAppProtocol({
    protocolAdapter: {
      handle: (scheme, registeredHandler) => registrations.push({ scheme, registeredHandler }),
    },
    networkAdapter,
    distributionDirectory,
  });

  assert.deepEqual(registrations, [{ scheme: 'chalk', registeredHandler: handler }]);
});
