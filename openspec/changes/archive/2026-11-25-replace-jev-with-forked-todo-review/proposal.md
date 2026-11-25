## Why

The current audit repeatedly asks JEV to infer board drift, then asks the main agent to do the bookkeeping. The board already supplies two concrete reasons to review it: a new concurrent activity and an item that has gone too long without a change or an explanation. Use those signals to pay for reflection only when needed and report what actually happened.

## What Changes

- **BREAKING** Remove JEV as an audit dependency. The new standalone `pi-audit-todo` package replaces `rpiv-todo` and the old audit for users who migrate; it does not uninstall independently configured services, modify the frozen predecessor, or rewrite old sessions.
- Replace the four-active reminder and its cooldown. At each ordinary main loop end, compare final `in_progress` task IDs: for **each newly active ID** with a final total of **at least two**, start a distinct private reflection that gives concrete reasons why the whole set needs to be active or identifies obsolete active entries to correct. Two is a review threshold, not a cap.
- Review each TODO after **more than 30 completed main loops OR more than 30 minutes of observed ordinary working time** since its last actual change or accepted review. Include pending, in-progress, completed and deleted items; review an unchanged terminal revision only once. Retain the existing agent-side initialization guidance; do not create busywork for an empty board.
- Fork privately as Reflect Watchdog does. The child returns supported board operations or concrete reasons to keep items unchanged. The parent plugin applies current, validated operations to the real parent TODO board, without executing the tasks, and sends a short factual changelog to the original agent's context without requesting a turn.
- Use Continue Watchdog's activity/idle semantics, not an idle-timeout or a wall clock. A private dependency is permitted; neither public watchdog must be installed or activated. Standalone and co-installed operation must not interfere with another extension's state or behavior.

## Capabilities

### New Capabilities
- `forked-todo-maintenance`: Per-item eligibility, activity accounting, private parallelism review, guarded parent-board writeback, truthful receipts and co-installation isolation.

### Modified Capabilities
- `jev-todo-audit`: Retire the prior classifier cadence, workflow, configuration and advisories; preserve branch-based counting and historical messages.
- `incremental-judgment-state`: Retire the JEV segment/cursor business protocol; old conclusions are not maintenance receipts.
- `shared-audit-integration`: Remove consumer obligations for the shared judgment service.
- `judgment-service-delivery`: Remove the delivery entry and service provisioning obligations from this package, without removing user-owned installations.

## Impact

Affects extension resources, runtime and package dependencies, session/replay handling, the rpiv-todo mutation boundary, commands, tests, operator docs and the two process models. No changes to the independently installed Continue, Reflect or JEV extensions are assumed. Forks still use the main session's model and can incur inference cost; this is JEV-free, not model-free. Legacy audit records stay readable but confer no write or execution authority.
