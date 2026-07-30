import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { createGristProcessAdapter } from './src/grist-process-adapter.js';
import { createViteCodexAppService } from './src/vite-codex-app-service.js';

/** @typedef {import('vite').Plugin} Plugin */
/** @typedef {import('vite').ViteDevServer | import('vite').PreviewServer} ViteServer */

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const gristProcessAdapter = createGristProcessAdapter({
  spawnPolicy: ({ command, arguments: commandArguments, options }) =>
    spawn(command, commandArguments, {
      ...options,
      shell: process.platform === 'win32',
    }),
});

const codexAppService = createViteCodexAppService({
  spawnPolicy: ({ command, arguments: commandArguments, options }) =>
    spawn(command, commandArguments, options),
  workingDirectory: process.cwd(),
});

/** @returns {Plugin} */
function gristParserService() {
  /** @param {ViteServer} server */
  const attachParser = (server) => {
    server.middlewares.use('/grist/parse-model-json', (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end('Method not allowed');
        return;
      }
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (/** @type {string} */ chunk) => {
        body += chunk;
      });
      request.on('end', async () => {
        try {
          const parsed = await gristProcessAdapter.parseModelJson(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(parsed));
        } catch (error) {
          response.statusCode = 500;
          response.end(errorMessage(error) || 'Grist JSON parser failed.');
        }
      });
    });
  };

  return {
    name: 'chalk-grist-parser-service',
    configureServer: attachParser,
    configurePreviewServer: attachParser,
  };
}

export default defineConfig({
  plugins: [codexAppService, gristParserService()],
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/build/**'],
    },
  },
});
