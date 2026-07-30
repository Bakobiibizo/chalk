# Project domain boundary map

A project is the durable session boundary. It owns its pages and coach history;
a page owns drawing strokes and pinned math cards.

## Data model

`project-payload-contract.js` defines the canonical types and validation rules:

- `ProjectState`: `sessions` plus `activeId`.
- `Project`: identity, title, pages, `activePageId`, project-scoped coach
  threads, compatibility fields, timestamps, and optional import metadata.
- `ProjectPage`: identity, title, strokes, cards, and timestamps.

The project storage version is 1 and the export envelope version is 2. The
contract accepts the supported v1 export and legacy single-page shapes, then
normalizes them to the current multi-page model.

## Implemented ownership

| Module                            | Owned responsibility                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-payload-contract.js`     | Typed payload reading, validation diagnostics, storage normalization, supported import migration, export normalization, and legacy stroke/card parsing     |
| `project-runtime-factories.js`    | Runtime timestamps and identifiers for pages, projects, and imported projects                                                                              |
| `project-store.js`                | In-memory `ProjectState`, project/page creation and transitions, active lookups, strict `chalk-sessions-v1` persistence, and legacy localStorage migration |
| `application-session-adapters.js` | Read-only active project/page accessors plus coach normalization and persistence ports for application consumers                                           |
| `projects-composition.js`         | Connects store transitions to project panel, page tabs, drawing save/load, navigation, coach activity, and canvas resize                                   |
| `projects-panel-ui.js`            | Project list rendering and create/switch/delete interaction                                                                                                |
| `page-tabs-ui.js`                 | Page tab rendering and add/switch/rename/delete interaction                                                                                                |
| `drawing-session-coordinator.js`  | Transfers strokes, cards, project title, timestamps, and coach restoration between live controllers and the active stored project/page                     |
| `project-import-export.js`        | Versioned project export and validated import insertion with new runtime identity                                                                          |
| `import-export-composition.js`    | File-input/button listener lifecycle and post-import UI coordination                                                                                       |

## Persistence and migration

`ProjectStore.initialize()` reads `chalk-sessions-v1`, parses JSON, validates and
normalizes the payload, normalizes coach threads, and writes the normalized
state back. If current storage is absent, it migrates valid `chalk-strokes`,
`chalk-cards`, `chalk-title`, and `chalk-codex-thread` data into one project
with one page. Read, parse, validation, and write failures produce storage
diagnostics and propagate to the application; they do not create a blank
replacement project.

All normal persistence passes through `parsePersistedProjectPayload()` before
`JSON.stringify`. Imports pass through the versioned export contract before
being assigned a new imported-project identity. Exports pass through the
current export contract before download.

## Mutation flow and invariants

Project and page UI commands save the current drawing before changing active
identity. After a transition, the composition loads the new active page,
restores project-scoped coach state, rerenders the appropriate lists/tabs, and
resizes the sketch. Switching is refused while Codex has an active request.

Keep at least one project and one page through store/UI transition rules.
Coach history remains project-scoped when pages change. Do not move strokes or
cards into UI modules, duplicate project state in a composition, change storage
keys, or remove legacy coach fields without an explicit versioned migration.
