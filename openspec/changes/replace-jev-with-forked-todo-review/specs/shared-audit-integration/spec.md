## ADDED Requirements

### Requirement: No external judgment-service dependency
The audit SHALL operate without a JEV service, model selection, credentials, or a global judgment handle. It SHALL NOT call JEV as a fallback when a fork, validation, or parent write fails.

#### Scenario: Absent, broken or separately selected service
- **WHEN** a maintenance trigger fires with JEV absent, an incompatible JEV installed, or an independent service already selected
- **THEN** the same private review path is used, with zero JEV calls, no service warning and no edits to the independent installation.

## REMOVED Requirements

### Requirement: Service-owned judgments
**Reason**: There is no service-based audit judgment.
**Migration**: Use private parent-context TODO maintenance forks.

### Requirement: Preserve predecessor audit guarantees
**Reason**: Periodic/manual service audits and terminal execution advice are intentionally retired.
**Migration**: Rely on the new branch-safe maintenance and receipt contract, not automatic continuation.

### Requirement: Durable progress is not final advice
**Reason**: Shared-service progress checkpoints are no longer created.
**Migration**: Publish actual verified operations or accepted keeps through parent receipts.

### Requirement: Service-filtered business choices
**Reason**: No shared-service threshold or Choice response exists in the new path.
**Migration**: Validate item decisions, scope and current write preconditions instead.

### Requirement: Diagnostics report actual scoped results
**Reason**: JEV transport and capacity diagnostics no longer describe maintenance.
**Migration**: Report observed changed/kept/conflicted/failed maintenance outcomes.
