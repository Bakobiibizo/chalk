# Runtime, parsing, and failure policies

Chalk favors explicit failure over silent recovery. A transport, parser, subprocess, or
persistence failure must remain observable to its caller and must not be converted into a
replacement thread, replacement document, or misleading generic error.

## Codex requests

The renderer talks to a local WebSocket bridge. Vite and Electron both map each authenticated
WebSocket client to one `codex app-server --listen stdio://` child process.

| Contract                              | Value                 |
| ------------------------------------- | --------------------- |
| Connection and initialization timeout | 8 seconds             |
| Connected turn timeout                | None                  |
| Concurrent coach turns                | One per coach service |
| WebSocket message capacity            | 100 MiB               |
| Page-image capture scale              | 2×                    |

If a saved Codex thread cannot be resumed, Chalk preserves its identifier and rejects the
request. It does not delete the identifier or start a replacement thread. Invalid JSON-RPC
messages disconnect the client and reject pending work.

## Grist model-output parsing

Generated lesson text is never parsed directly with `JSON.parse`. The raw model response is
sent to:

```text
grist parse model-output - --json-value
```

Grist owns malformed-JSON repair and parsing. Chalk decodes Grist's JSON output and then
validates the resulting lesson payload. Desktop requests use Electron IPC; development and
preview requests use `POST /grist/parse-model-json`. Both transports terminate at the same
process adapter.

The Grist child has a ten-minute timeout. Spawn failures, nonzero exits, invalid Grist output,
and timeouts reject the lesson operation.

## Lesson size

Chalk does not truncate learner goals, generated lesson fields, graph nodes, graph edges,
obligations, relations, or teaching objectives. Broad prompts instruct Codex to create as many
dependency nodes as necessary to represent the complete requested scope.

Upstream model context and operating-system memory constraints still apply; Chalk does not
silently shorten content to satisfy them.

## Persistence

An absent storage key is normal and initializes the corresponding empty state. Read failures,
malformed JSON, schema violations, and write failures are diagnosed and thrown. Existing
project or lesson evidence is not overwritten with blank recovery state.

Legacy project shapes are migrated only when current project storage is absent and the legacy
payload is valid.

## Expected domain errors

Errors caused by explicit user input—such as an unsupported calculator expression—are rendered
as domain feedback. This is not an operational fallback: no alternative result is fabricated
and no underlying stored state is replaced.
