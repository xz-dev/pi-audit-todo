# incremental-judgment-state Specification

## Purpose
Per-question business judgment state for the TODO audit: change-question answers are persisted as task and session state with confirmed loop cursors, so previously judged history is never re-submitted and only new complete loops are judged.

## Requirements

### Requirement: Old judgments do not establish reviewed TODO state
Maintenance SHALL NOT consult JEV cursors, opinions, model thresholds, old provider receipts or cached verdicts to authorize a mutation or declare an item reviewed. These records SHALL remain historical and SHALL NOT be rewritten during migration.

#### Scenario: Upgrade on a branch with a previously accepted judgment
- **WHEN** the prior audit had judged a task complete but the actual TODO board still lists it as active
- **THEN** maintenance recovers the actual board and its own valid branch-local receipts, does not apply the old verdict, and leaves the historical record intact.
