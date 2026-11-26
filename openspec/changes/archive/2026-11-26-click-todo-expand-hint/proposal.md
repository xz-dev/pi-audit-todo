## Why

The TODO overlay already accepts a click on its heading, but its collapsed hint only mentions the keyboard and does nothing when clicked. Make the hint itself a discoverable mouse target so users can reopen the panel without remembering the shortcut or knowing the heading is clickable.

## What Changes

- In Pi fullscreen, let a plain left click on the collapsed hint row expand the TODO panel. The heading continues to toggle the panel in both states.
- Advertise click-to-expand in fullscreen, alongside the configured shortcut when enabled. Regular terminal mode and hosts without mouse dispatch keep the current keyboard or static collapsed hint.
- Leave expanded task rows, the spacer, other mouse gestures, and keyboard bindings unchanged. Do not change the TODO board or audit behavior.

## Capabilities

### New Capabilities

- `todo-overlay`: Mouse and keyboard interaction with the TODO panel's collapsed expand hint.

### Modified Capabilities

None.

## Impact

Update `packages/rpiv-todo/todo-overlay.ts`, its localized hints, mouse tests, and overlay documentation. Reuse Pi's existing widget mouse API. No dependencies, settings, or host changes are required.
