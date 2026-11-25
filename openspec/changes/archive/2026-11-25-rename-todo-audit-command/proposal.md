## Why

`pi-audit-todo` retained `/jev-audit` during migration even though it no longer uses JEV. Rename the entry point so users can find the manual check next to `/cancel-todo-audit` without mistaking it for a JEV command.

## What Changes

- **BREAKING** Replace `/jev-audit` with `/todo-audit` in `pi-audit-todo`. Do not register a compatibility alias; users must update shortcuts and scripts that invoke the old name.
- Keep the existing due-item check and off-switch behavior. `full` still reports that full reassessment is retired without starting a review; unsupported arguments show usage for `/todo-audit`.
- Leave `/todos`, `/cancel-todo-audit`, the `todo` tool, automatic maintenance, and independent extensions unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: Update the manual entry point in the migration's `Maintenance replaces JEV entrypoints` requirement. That requirement is in the implemented but unsynced `replace-jev-with-forked-todo-review` change; compose this delta after it.

## Impact

Update the command registration, shipped README, focused command tests, and projected-package smoke assertions. No dependency, configuration, session-data, or scheduler changes are needed.
