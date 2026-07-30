# Platform adapter map

The browser application consumes narrow ports. Vite and Electron provide
different transports for the same Codex and Grist capabilities without changing
domain ownership.

## Runtime map

| Runtime boundary            | Owning modules                                             | Contract                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser development/preview | `vite.config.js`, `vite-codex-app-service.js`              | Vite serves the app, upgrades `/codex` WebSockets, and exposes POST `/grist/parse-model-json`                                                                 |
| Desktop composition root    | `electron/main.js`                                         | Injects Electron/Node policies, composes protocol, window, Codex, Grist, popout, window-control, and single-instance lifecycles, and tears them down on quit  |
| Desktop asset protocol      | `electron/app-protocol.js`                                 | Serves only resolved files inside `dist` through the privileged `chalk://app/` scheme                                                                         |
| Main window                 | `electron/main-window-factory.js`                          | Starts one Codex bridge per window, creates the sandboxed window, restricts navigation, loads `chalk://app/index.html`, and closes the bridge with the window |
| Renderer bridge             | `electron/preload.cjs`, `chalk-desktop-bridge.d.ts`        | Exposes only Codex connection data, window commands/state, chat popout, and Grist parsing through `window.chalkDesktop`                                       |
| Renderer shell UI           | `desktop-shell-controller.js`                              | Adapts the optional preload bridge to title-bar classes, buttons, and maximize state                                                                          |
| Codex process transport     | `codex-stdio-session-adapter.js`                           | Owns one `codex app-server --listen stdio://` child and forwards newline-delimited messages                                                                   |
| Browser Codex bridge        | `vite-codex-app-service.js`                                | Maps each accepted WebSocket to one stdio session                                                                                                             |
| Desktop Codex bridge        | `electron/codex-bridge.js`, `codex-executable-resolver.js` | Owns authenticated loopback WebSocket transport, executable resolution, per-client stdio sessions, and shutdown                                               |
| Grist process transport     | `grist-process-adapter.js`                                 | Sends raw model output to `grist parse model-output - --json-value` and returns the parsed value                                                              |
| Desktop Grist IPC           | `electron/grist-ipc.js`                                    | Maps preload parse requests to the shared Grist process adapter                                                                                               |
| Desktop window commands     | `electron/window-controls-ipc.js`                          | Maps renderer window actions to the sender window and publishes maximize state                                                                                |
| Desktop coach popout        | `electron/chat-popout-lifecycle.js`                        | Owns one reusable sandboxed popout window for renderer-supplied escaped mirror HTML                                                                           |
| Desktop process policy      | `electron/single-instance-lifecycle.js`                    | Owns the single-instance lock and focuses the primary window on later launches                                                                                |

## Renderer routing

`CodexCoachService` chooses its WebSocket URL in this order:

1. Explicit `VITE_CODEX_APP_SERVER`.
2. Authenticated Electron loopback port/token from the preload bridge.
3. Same-origin `/codex` for Vite.

Lesson generation chooses Grist transport by capability: preload
`parseModelJson()` when available, otherwise same-origin
`/grist/parse-model-json`. Both routes terminate at
`createGristProcessAdapter()`; neither route substitutes a browser parser for
raw model output.

The Vite and Electron Codex bridges share a 100 MiB WebSocket message capacity.
Codex connection initialization is bounded at eight seconds; connected turns
have no Chalk timeout. Grist parsing is bounded at ten minutes. The complete
failure contract is documented in `runtime-policies.md`.

## Security and lifecycle constraints

- Electron renderer windows use context isolation, sandboxing, and no Node
  integration.
- The preload bridge is the only renderer-visible desktop capability surface.
- The app protocol rejects resolved paths outside `dist`, and main-window
  navigation stays under `chalk://app/`; HTTP(S) links open externally.
- The desktop Codex bridge binds loopback and requires its per-window token.
- Node process creation is injected as a spawn policy into the shared adapters;
  browser/domain modules never import `child_process`.
- Every Electron IPC handler, window registration, popout, Codex bridge, and
  single-instance listener has an explicit destroy path owned by `main.js`.

New platform behavior should extend a narrow bridge or injected adapter rather
than expose Electron or Node APIs directly to application/domain modules.
