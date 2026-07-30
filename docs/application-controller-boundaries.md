# Application composition boundary map

Chalk has one browser application and one bootstrap path. `src/main.js` loads
styles, calls `bootstrapApplication()`, and registers page-unload teardown.
`src/application-controller.js` is the thin browser entry point: it creates the
DOM registry, composes the application, starts it, and returns the lifecycle.

## Implemented ownership

| Module                                 | Owned responsibility                                                                                                         | Boundary contract                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `application-dom-registry.js`          | Queries persistent application DOM elements and validates required elements once                                             | Returns named `application`, `sketch`, `lessons`, and `coach` element groups; it does not attach listeners |
| `application-composition.js`           | Connects setup to lifecycle construction                                                                                     | `composeSetup(registry) -> dependencies`, then `composeLifecycle(dependencies) -> { start, destroy }`      |
| `application-setup-composition.js`     | Browser composition root for controllers, stores, domain compositions, and callback ports                                    | Constructs dependencies only; it does not start controllers or initialize stores                           |
| `application-session-adapters.js`      | Adapts `ProjectStore` to application-level active project, page, coach-thread, and persistence accessors                     | Project objects remain the stored session objects; the adapter adds no cache or second store               |
| `application-lifecycle-composition.js` | Owns startup order, rollback after partial startup, idempotent start/destroy, reverse teardown, and paper resize observation | Consumes the `ApplicationLifecycleDependencies` contract and exposes only `start()` and `destroy()`        |
| `application-contracts.js`             | Shared JSDoc types for setup and lifecycle ports                                                                             | Type-only module with no runtime ownership                                                                 |
| `application-controller.js`            | Creates and starts the composed browser application                                                                          | Does not know domain wiring or lifecycle stage order                                                       |

## Setup graph

`composeApplicationSetup()` resolves the registry before constructing any
controller. It then builds the runtime in this order:

1. Desktop bridge, toast reporting, appearance, and project menu.
2. `ProjectStore` and the project/session adapters.
3. A disconnected drawing command port, calculator/cards, and the sketch
   controller.
4. Preview/export capture and `LessonStore`.
5. Codex service, coach UI, and page interpretation.
6. Lesson, navigation, and project compositions.
7. Drawing session coordinator, followed by the one-time drawing command-port
   connection.
8. Project/lesson import and export composition.

The drawing command port deliberately breaks the construction cycle. Early
consumers receive stable `saveDrawing`, `loadDrawing`, and `redraw` functions;
the port is connected only after their actual owners exist. Calling a command
before connection or connecting twice is an error.

## Lifecycle order

`composeApplicationLifecycle()` starts these stages in order:

1. Desktop shell, appearance, and project menu.
2. Project-store initialization.
3. Calculator/cards, sketch canvas, preview export, coach, page interpretation,
   lessons, navigation, projects, and import/export listeners.
4. Initial UI state: attach the lesson modal root, load the active drawing,
   render projects and lessons, and show the sketch page.
5. Asynchronous Codex connection.
6. Paper `ResizeObserver`.

Every entered stage is recorded before its `start` callback runs. A startup
failure therefore tears down the failing stage and all prior stages in reverse
order. Normal `destroy()` uses the same reverse order and aggregates teardown
errors instead of hiding them.

## Cross-domain ownership rules

- `ProjectStore` owns project and page persistence. Pages own strokes and math
  cards; projects own title, active-page selection, coach threads, and the
  legacy coach compatibility fields.
- `LessonStore` owns lesson persistence. Active lesson selection is ephemeral
  application state, resolved back through the store.
- `SketchCanvasController` owns live sketch stroke and tool state.
  `DrawingSessionCoordinator` is the explicit transfer boundary between live
  sketch/card state and the active project page.
- `CodexCoachService` owns connection, thread, and active-request behavior.
  `CoachPanelUI` owns coach presentation; the application supplies project,
  lesson, and page-image context through injected ports.
- Lessons are integrated into the sketch workspace by
  `LessonsApplicationComposition` and `LessonLayoutController`. They do not
  create a second application or replace the sketch bootstrap.
- Generated lesson model output always crosses the Grist parser adapter in
  `lesson-generation-composition.js`. Desktop uses the preload bridge; browser
  development and preview use `/grist/parse-model-json`. There is no
  client-side model-output JSON fallback.

## Change constraints

Keep the setup phase free of listener/store initialization, preserve lifecycle
stage order and reverse teardown, and add new long-lived resources as explicit
lifecycle ports. Domain modules must receive commands and state accessors
through composition rather than importing the application controller or
querying unrelated global DOM.
