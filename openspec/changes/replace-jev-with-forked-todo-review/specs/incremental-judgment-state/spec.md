## ADDED Requirements

### Requirement: Old judgments do not establish reviewed TODO state
Maintenance SHALL NOT consult JEV cursors, opinions, model thresholds, old provider receipts or cached verdicts to authorize a mutation or declare an item reviewed. These records SHALL remain historical and SHALL NOT be rewritten during migration.

#### Scenario: Upgrade on a branch with a previously accepted judgment
- **WHEN** the prior audit had judged a task complete but the actual TODO board still lists it as active
- **THEN** maintenance recovers the actual board and its own valid branch-local receipts, does not apply the old verdict, and leaves the historical record intact.

## REMOVED Requirements

### Requirement: Questions judge change against stored state
**Reason**: Incremental classifier questions are retired.
**Migration**: Make private decisions only on programmatically eligible board items.

### Requirement: Partial completion and uncertainty are distinct state
**Reason**: JEV business classifications are no longer stored for later inference.
**Migration**: Use evidence-backed actual operations or reasoned keeps, not classifier states.

### Requirement: Cursor advancement
**Reason**: Classifier scope cursors have no meaning for maintenance.
**Migration**: Track actual item revisions and accepted review receipts instead.

### Requirement: Invalidation of stored judgments
**Reason**: No old judgments are reused or rebuilt.
**Migration**: Validate current branch, authority and item revisions before writeback.

### Requirement: Evidence scope of a segment
**Reason**: Maintenance does not build JEV request segments.
**Migration**: Fork the effective parent context and supply the current board evidence.

### Requirement: Complete-loop segmentation within selected capacity
**Reason**: Model capacity packing was part of the retired service contract.
**Migration**: Use private fork execution and disclose execution failures without board effects.
