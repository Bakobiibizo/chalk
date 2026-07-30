# Drawing boundary map

Drawing behavior has shared interaction primitives and two state owners: the
main sketch page and a lesson practice sheet.

| Module                           | Owned responsibility                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawing-canvas.js`              | Pixel/normalized coordinate types, pointer pressure, pen-tip eraser detection, cursor/tool appearance, pointer release, and pressure-stroke rendering |
| `stroke-session.js`              | Explicit idle/drawing/selecting pointer-session state and injected coordinate, sampling, selection, render, and persistence strategies                |
| `selection-engine.js`            | Box selection, selected indices/bounds, drag preview, and injected stroke movement                                                                    |
| `drawing-history.js`             | Pure undo and selected-stroke removal operations                                                                                                      |
| `sketch-canvas-controller.js`    | Main sketch DOM listeners, pixel-space strokes, tool/color/size, redo stack, selection, redraw, resize, and save notifications                        |
| `lesson-practice-controller.js`  | Lesson practice listeners, normalized strokes, practice selection/history, redraw/resize, image capture, and lesson-store persistence callback        |
| `drawing-session-coordinator.js` | Copies live sketch strokes/cards/title into the active project page and restores project/page/coach state into live controllers                       |
| `drawing-command-port.js`        | Stable `saveDrawing`, `loadDrawing`, and `redraw` commands across the setup-time dependency cycle; single validated connection                        |
| `image-compositor.js`            | Read-only composition of canvas ink and math cards into image output                                                                                  |
| `preview-export-composition.js`  | Page preview/PNG event lifecycle and capture calls; it does not mutate drawing state                                                                  |

## State and persistence paths

The main sketch stores pixel-space strokes in `SketchCanvasController`. On a
save notification, `DrawingSessionCoordinator` writes those strokes and the
math-card snapshot to the active `ProjectPage`, updates timestamps, and asks
`ProjectStore` to persist. Loading performs the inverse copy and redraws.
Neither the canvas controller nor the coordinator owns the project schema.

Lesson practice stores normalized strokes on the active lesson as
`practiceStrokes`, with its canvas height and update timestamp. The practice
controller calls the injected lesson persistence callback. It shares drawing
primitives with the sketch controller but does not write to project pages.

## Interaction contract

`StrokeSession` owns pointer-session state but not strokes after completion.
Each controller injects its coordinate space and persistence strategy:

- The sketch uses pixel coordinates and appends completed strokes to its local
  state before requesting a project save.
- Practice uses normalized coordinates so saved work survives pane resizing,
  then persists the lesson.
- Selection delegates geometry and movement to `SelectionEngine`; the owning
  controller decides how a moved or deleted selection is persisted.

Do not mix pixel and normalized points, add storage access to drawing
primitives, or bypass the drawing command port with application-composition
imports. Project payload validation remains the authority for saved sketch
strokes, and lesson payload validation remains the authority for practice
strokes.
