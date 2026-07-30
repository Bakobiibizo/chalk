# Lesson workflow boundary map

Lessons are a persisted domain integrated beside or over the sketch experience.
They share the Codex service and drawing primitives but do not own a separate
application bootstrap.

## Implemented ownership

| Module                               | Owned responsibility                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lesson-payload-contract.js`         | Lesson, graph, and normalized practice-stroke schemas; storage/import/export validation and diagnostics                                                |
| `lesson-store.js`                    | `chalk-lessons` state, validated localStorage reads/writes, completion changes, insertion/removal, and versioned import/export                         |
| `active-lesson-selection.js`         | Ephemeral active lesson ID resolved through `LessonStore`                                                                                              |
| `lessons-application-composition.js` | Lesson-domain composition, library/detail/practice lifetime, generation/progression wiring, modal root, navigation, and public application port        |
| `lesson-library-ui.js`               | Library, picker, modal, filtering/rendering, and visible generation errors                                                                             |
| `lesson-detail-template.js`          | Escaped lesson detail markup                                                                                                                           |
| `lesson-detail-dom.js`               | Resolves controls created by each detail render; transient practice elements never enter the persistent application DOM registry                       |
| `lesson-detail-ui.js`                | Opens a lesson in the integrated layout, wires rendered controls, coordinates completion, practice, coach handoff, minimization, and graph progression |
| `lesson-layout-controller.js`        | Persisted three-pane order/widths, drag-tab and dual-divider lifecycles, sketch resizing, and sticky coach docking while lesson layout is active       |
| `lesson-practice-controller.js`      | Normalized practice drawing state and persistence into the lesson                                                                                      |
| `lesson-generation-composition.js`   | Generation form lifecycle and the Grist model-output parser routing boundary                                                                           |
| `lesson-ai.js`                       | Prompt construction, generated lesson normalization, and model-response-to-contract handoff                                                            |
| `lesson-progression-service.js`      | Next graph-node selection, busy/complete/started result, generated follow-up insertion, and graph advancement                                          |
| `lessons-composition.js`             | Lesson navigation listener lifecycle                                                                                                                   |

## Generation and progression flow

1. The generation form asks the shared coach service for model output.
2. `parseLessonResponse()` sends that raw output through the injected
   `parseModelJson` function.
3. `createGristModelJsonParser()` uses `window.chalkDesktop.parseModelJson` in
   Electron or POSTs raw text to `/grist/parse-model-json` in browser
   development/preview.
4. The parsed value is normalized and validated by the lesson payload contract
   before `LessonStore.prepend()` persists it.
5. The library/picker rerender and the generated lesson opens inside the sketch
   workspace.

Graph progression uses the same parser and store path. The progression service
returns explicit `complete`, `busy`, or `started` state; only a started
generation owns a completion promise and can insert the next lesson.

Grist is the sole model-output parsing boundary. Do not parse raw generated
lesson text with `JSON.parse`, strip code fences in UI code, or add a client-side
fallback.

## Integrated lesson lifecycle

Opening detail selects the lesson, destroys any previous practice controller,
renders and resolves transient detail controls, activates the three-pane
layout, and creates one practice controller. Rerendering or composition teardown
destroys that controller before replacing its DOM.

The sketch remains active beside the lesson and stretches to the lesson
content height. The layout controller may dock the same coach panel into the
workspace, pin it at its captured viewport offset, and restore it on teardown.
Pane order and relative widths persist locally. Minimizing a lesson saves the
current project drawing, removes the integrated layout, and clears ephemeral
active-lesson selection. Lesson practice remains stored with the lesson; main
sketch work remains stored with the active project page.
