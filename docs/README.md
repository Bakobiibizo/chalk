# Chalk documentation

The documentation is organized around explicit runtime and ownership boundaries.

## Operational contracts

- [Runtime, parsing, and failure policies](runtime-policies.md)

## Architecture maps

- [Application composition](application-controller-boundaries.md)
- [Coach subsystem](coach-panel-ui-boundaries.md)
- [Drawing subsystem](drawing-boundaries.md)
- [Lesson workflow](lesson-workflow-boundaries.md)
- [Platform adapters](platform-adapters.md)
- [Project domain](project-domain-boundaries.md)

The source and tests are authoritative. When a runtime policy changes, update the relevant
boundary map and its regression contract in the same change.
