# Coach boundary map

The coach is a project-scoped feature inside the unified Chalk application.
`composeCoach()` joins the Codex service to the panel facade; application-level
prompt context remains outside both.

## Implemented ownership

| Module                                        | Owned responsibility                                                                                                                                                                           | Does not own                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `coach-composition.js`                        | Creates `CodexCoachService`, creates `CoachPanelUI`, and pairs their initialize/destroy lifecycle                                                                                              | Project storage, prompt construction, or DOM details below the facade                                            |
| `codex-coach-service.js`                      | Resolves the configured/desktop/same-origin WebSocket URL, owns one active request, translates client events to a streamed result, selects Codex threads, and persists synchronized thread IDs | Transcript rendering or coach-thread collection mutation                                                         |
| `codex-client.js` and `codex-client-state.js` | JSON-RPC transport plus explicit connection/thread state transitions                                                                                                                           | Application session data                                                                                         |
| `coach-panel-ui.js`                           | Panel-level facade and control wiring; composes history, renderer, form, widget, and popout controllers                                                                                        | Message markup rules, thread mutation details, request execution, widget geometry, or popout document generation |
| `coach-history-controller.js`                 | Thread creation, legacy normalization, active-thread selection, transcript persistence, history markup, and Codex thread selection handoff                                                     | Network requests or conversation DOM                                                                             |
| `coach-message-renderer.js`                   | Conversation DOM, fixed greeting, LaTeX rendering, scrolling, streaming reply updates, transcript restoration, and persistence handoff                                                         | Stored thread mutation                                                                                           |
| `coach-prompt-form-controller.js`             | Presets, prompt focus, submit state, request preparation, streaming coordination, and visible errors                                                                                           | Prompt context policy or Codex transport state                                                                   |
| `floating-widget-controller.js`               | Drag/resize behavior and project-owned `chatWidget` geometry persistence                                                                                                                       | Panel content or project selection                                                                               |
| `coach-popout-controller.js`                  | Escaped read-only mirror markup, desktop/browser popout transport, synchronization, and browser-window cleanup                                                                                 | Transcript persistence                                                                                           |
| `coach-request-builder.js`                    | Builds the application-level tutor request from learner text, page title, active lesson, and composited page image                                                                             | Sending requests or parsing replies                                                                              |
| `coach-contracts.js`                          | Shared types at service, persistence, renderer, and panel ports                                                                                                                                | Runtime behavior                                                                                                 |

## Data ownership and compatibility

Coach history is embedded in the active project:

- `coachThreads` is the project thread collection.
- `activeCoachThreadId` selects the visible thread.
- Each thread owns its messages and resumable `codexThreadId`.
- Project-level `coachMessages` and `codexThreadId` remain synchronized
  compatibility fields.
- `chatWidget` stores floating panel geometry on the project.

`ensureCoachThreads()` migrates legacy project fields in place and repairs an
invalid active-thread selection. `ApplicationSessionAdapters` supplies the
active project and persistence callback; coach modules do not introduce another
storage layer.

## Request and rendering flow

1. The form trims the learner prompt and asks the renderer to append and
   persist the user message.
2. The renderer creates an unpersisted `Thinking` assistant message.
3. The application-owned request builder adds lesson and sketch-image context.
4. `CodexCoachService.run()` streams accumulated text through the form to the
   renderer.
5. A successful final reply is rendered with LaTeX and persisted through the
   history controller. A failed reply remains visible but is not persisted.
6. History persistence mutates the active project synchronously, persists the
   project, rerenders history, and synchronizes the popout.

Starting or selecting a thread updates the project compatibility fields, tells
the service which Codex thread to use, restores the transcript, and rerenders
history. Project/page changes are blocked while a request is active.

## Lifecycle and trust boundaries

`CoachPanelUI.initialize()` uses one `AbortController` for panel and prompt
listeners and creates the widget. `destroy()` aborts those listeners, destroys
the widget and prompt timer, and closes a browser popout. `composeCoach()`
destroys the panel before the service, and the service rejects an active
request, removes client listeners, and closes the client.

Model, project, and learner text is untrusted. Conversation messages use
`textContent`; history and popout markup pass dynamic text through `escapeHtml`.
`prepareRequest` stays at the application boundary because it combines coach,
lesson, project, drawing, and image-export context.
