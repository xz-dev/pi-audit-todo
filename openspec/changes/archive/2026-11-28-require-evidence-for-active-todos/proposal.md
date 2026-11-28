## Why

The default TODO instructions tell the main agent to keep unfinished or blocked work `in_progress` even after work stops. The private reviewer can then renew the same entry with a reason and no source, so the board no longer distinguishes work underway from work someone intends to resume.

## What Changes

- Give the main agent and private reviewer one meaning for `in_progress`: identifiable work on this item is happening now. Investigating a failed test qualifies; putting it aside until another task finishes does not.
- Tell the main agent to return paused work to `pending`, record a real dependency or resumption condition, and split mixed-scope work when only one part is moving. Keep the private reviewer limited to correcting existing entries; it cannot create split tasks.
- For both periodic and parallel reviews, require a current, item-specific original source before accepting an active `KEEP`. An earlier accepted review or the same old evidence cannot renew the item again. Do not cap the number of evidence-backed keeps for long-running work.
- Distinguish an evidenced pause from a lack of evidence: correct the former; report the latter as unverified without changing the board or advancing its accepted-review baseline. Leave other items in the review independent where the existing write fences permit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `forked-todo-maintenance`: Align default TODO guidance and private audit decisions on active, paused and partially active work; tighten acceptance of active keeps without changing the rules for non-active items.

## Impact

Affects the registered `todo` guidance, private review prompt, parent-side decision validation, receipt replay and focused tests under `packages/rpiv-todo/`, plus the package README and the existing TODO review process model. No new public status, command, configuration, dependency or child write authority. Existing boards and historical receipts remain readable; custom main-agent guidance remains an override.
