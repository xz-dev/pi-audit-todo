# shared-audit-integration Specification

## Purpose
Integrate advisory TODO auditing with the shared judgment service while retaining audit-specific evidence, scheduling and task-authority safety under the stateless version-two contract.

## Requirements

### Requirement: No external judgment-service dependency
The audit SHALL operate without a JEV service, model selection, credentials, or a global judgment handle. It SHALL NOT call JEV as a fallback when a fork, validation, or parent write fails.

#### Scenario: Absent, broken or separately selected service
- **WHEN** a maintenance trigger fires with JEV absent, an incompatible JEV installed, or an independent service already selected
- **THEN** the same private review path is used, with zero JEV calls, no service warning and no edits to the independent installation.
