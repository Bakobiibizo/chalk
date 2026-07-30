# Chalk

Chalk is a pressure-aware drawing and lesson workspace for pen tablets. It combines a
multi-page sketch canvas, mathematical tools, persistent lesson plans, and a local Codex
learning coach in a Vite web application and an Electron desktop shell.

All projects, lessons, drawings, and preferences are stored locally. Codex credentials stay
inside the installed Codex CLI; they are never embedded in browser code.

## Features

- Pressure-sensitive pen strokes, pen-tip erasing, selection, undo, and redo
- Named projects with multiple drawing pages and PNG export
- Pinned calculator results and numeric LaTeX parsing
- Streaming, page-aware Codex tutoring with resumable project threads
- Dependency-graph lesson plans with no application-side input or content truncation
- Grist-backed repair and parsing of malformed model JSON
- Integrated lesson, sketch, practice, and coach panes
- Persistent light, dark, and system-following themes
- Vite development runtime and packaged Electron desktop application

## Requirements

- Node.js 22.12 or newer
- pnpm
- The [Codex CLI](https://github.com/openai/codex) installed and authenticated
- The `grist` CLI available on `PATH`

Chalk invokes Codex as:

```text
codex app-server --listen stdio://
```

It invokes Grist for model-output repair as:

```text
grist parse model-output - --json-value
```

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. The Vite runtime provides the local Codex WebSocket and Grist
HTTP bridges used by the browser application.

To use a different compatible Codex bridge:

```bash
VITE_CODEX_APP_SERVER=wss://example.invalid/codex pnpm dev
```

## Desktop application

Run the Electron application locally:

```bash
pnpm desktop
```

Create an installer for the current operating system:

```bash
pnpm desktop:pack
```

Desktop artifacts are written to `release/`. The desktop shell serves the built application
through the private `chalk://app/` protocol and owns authenticated loopback bridges for Codex
and Grist.

## Validation

```bash
pnpm validate
```

This runs, in order:

1. Prettier formatting checks
2. ESLint
3. Strict TypeScript checking
4. The Node regression suite
5. A production Vite build

Use `pnpm test:regression` to run only the tests.

## Runtime behavior

- Codex connection and initialization have an eight-second timeout.
- Once connected, Codex turns have no Chalk-imposed timeout.
- Grist parsing has a ten-minute timeout.
- Codex WebSocket messages support up to 100 MiB in both Vite and Electron.
- Page images sent to Codex are captured at 2× resolution.
- Failed thread resumes, malformed transport responses, malformed stored data, and subprocess
  failures propagate as errors. Chalk does not silently create replacement threads or blank
  replacement state.
- Missing local state is normal and initializes an empty project or preference value.

See [docs/runtime-policies.md](docs/runtime-policies.md) for the full request, parsing, and
failure contract. Architecture maps are indexed in [docs/README.md](docs/README.md).

## Drawing shortcuts

- `P`, `B`, or `1`: pen
- `E` or `2`: eraser
- `[` / `]`: decrease or increase pen size
- `Ctrl+Z` / `Cmd+Z`: undo
- `F`: enter or exit fullscreen canvas focus

These can be mapped directly to Wacom pen or ExpressKey buttons.

## License

Chalk is licensed under the [MIT License](LICENSE).
