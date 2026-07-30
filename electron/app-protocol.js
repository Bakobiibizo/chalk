import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHALK_APP_SCHEME = 'chalk';

/**
 * @typedef {Pick<
 *   typeof import('electron').protocol,
 *   'registerSchemesAsPrivileged' | 'handle'
 * >} ProtocolAdapter
 *
 * @typedef {Pick<typeof import('electron').net, 'fetch'>} NetworkAdapter
 * @typedef {(request: Request) => Response | Promise<Response>} ProtocolHandler
 */

/** @param {ProtocolAdapter} protocolAdapter */
export function registerChalkAppScheme(protocolAdapter) {
  protocolAdapter.registerSchemesAsPrivileged([
    {
      scheme: CHALK_APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

/** @param {string} requestUrl */
export function normalizeChalkRequestPath(requestUrl) {
  const requestedPath = decodeURIComponent(new URL(requestUrl).pathname);
  return requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
}

/**
 * @param {string} filePath
 * @param {string} distributionDirectory
 */
export function isDistributionPath(filePath, distributionDirectory) {
  return (
    filePath === distributionDirectory || filePath.startsWith(`${distributionDirectory}${path.sep}`)
  );
}

/**
 * @param {{
 *   distributionDirectory: string,
 *   networkAdapter: NetworkAdapter,
 * }} dependencies
 * @returns {ProtocolHandler}
 */
export function createChalkAppProtocolHandler({ distributionDirectory, networkAdapter }) {
  return (request) => {
    const relativePath = normalizeChalkRequestPath(request.url);
    const filePath = path.resolve(distributionDirectory, relativePath);

    if (!isDistributionPath(filePath, distributionDirectory)) {
      return new Response('Not found', { status: 404 });
    }

    return networkAdapter.fetch(pathToFileURL(filePath).toString());
  };
}

/**
 * @param {{
 *   protocolAdapter: ProtocolAdapter,
 *   networkAdapter: NetworkAdapter,
 *   distributionDirectory: string,
 * }} dependencies
 * @returns {ProtocolHandler}
 */
export function registerChalkAppProtocol({
  protocolAdapter,
  networkAdapter,
  distributionDirectory,
}) {
  const handler = createChalkAppProtocolHandler({
    distributionDirectory,
    networkAdapter,
  });
  protocolAdapter.handle(CHALK_APP_SCHEME, handler);
  return handler;
}
