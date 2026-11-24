## ADDED Requirements

### Requirement: Maintenance replaces JEV entrypoints
The existing package SHALL preserve historical visible messages, support disabling business activity with `enabled: false`, and cease scheduled, terminal and manual JEV inference. `/jev-audit` SHALL check currently eligible items through the same maintenance rules; a disabled or not-due board SHALL launch no child. The obsolete `full` argument SHALL explain that JEV rebuilds are retired and SHALL NOT silently force a different paid operation. Documentation SHALL identify obsolete settings/commands and the actual compatibility boundary.

#### Scenario: Upgrade without an audit backend
- **WHEN** the user starts the extension without JEV and runs `/jev-audit` or `/jev-audit full`
- **THEN** neither command needs JEV or triggers its installation; the former checks due maintenance without duplicating pending obligations, and the latter reports retirement without making model calls.

#### Scenario: Disabled or stopped session
- **WHEN** business activity is disabled, or an ordinary watchdog terminal-stop message arrives with no due item or new activation
- **THEN** no maintenance child is launched by that condition and no task is resumed.

## REMOVED Requirements

### Requirement: Audit every 10th loop
**Reason**: Periodic classification is replaced by observable board triggers.
**Migration**: Review new concurrency entries or per-item staleness, not multiples of ten.

### Requirement: User-message cooldown
**Reason**: User steering invalidates stale decisions rather than hiding eligible events for ten loops.
**Migration**: Revalidate the current input before acting on fork results.

### Requirement: Audit request content
**Reason**: There is no packed JEV request.
**Migration**: Use a private fork with parent context, board snapshot and decision scope.

### Requirement: Verdict handling and corrective injection
**Reason**: A classifier verdict is not the deliverable.
**Migration**: Apply validated parent bookkeeping and report actual outcomes.

### Requirement: Configuration
**Reason**: JEV transport, cadence, packing and threshold settings no longer configure an auditor.
**Migration**: Keep the business off-switch; retire JEV settings without reading secrets or modifying independent packages.

### Requirement: Terminal-stop board check
**Reason**: Stopping is neither a trigger for JEV nor permission to continue tasks.
**Migration**: Reconcile only on maintenance eligibility; do not wake the parent to execute tasks.

### Requirement: Relevant recent and global evidence
**Reason**: Service evidence packing belongs to the removed classifier.
**Migration**: Private forks inherit current effective parent context; validate the actual board before writing.

### Requirement: Provider context limits without artificial quotas
**Reason**: This plugin no longer submits packed service requests.
**Migration**: Use the private runtime's limits and fail without claiming a board change.

### Requirement: Engineering-grounded granularity assessment
**Reason**: The granularity classifier and four-active/ten-loop reminder are retired. Age and concurrency justify checking, not mandatory subdivision.
**Migration**: Evaluate whether the active set is justified or contains forgotten items for each new activation when at least two items remain `in_progress` at the settled loop boundary.

### Requirement: Corrections remain fresh and do not repeat themselves
**Reason**: Correction keys for steering are replaced by guarded, idempotent parent writeback.
**Migration**: Bind maintenance decisions, compare current revisions, and deduplicate receipts.

### Requirement: TODO-defined state segments
**Reason**: Maintenance does not segment a JEV inference history.
**Migration**: Reconstruct canonical board changes and settled active sets.

### Requirement: Resumable rolling conclusions
**Reason**: Model conclusions are not replayable maintenance authority.
**Migration**: Restore eligible branch-local baselines and confirmed receipts only.

### Requirement: Manual review modes
**Reason**: There is no incremental/full model state to rebuild.
**Migration**: `/jev-audit` checks current eligibility; `full` reports retirement.

### Requirement: Observable cost and capacity outcomes
**Reason**: JEV call/segment diagnostics no longer describe the active system.
**Migration**: Surface actual maintenance outcomes; disclose that private model runs can incur cost.

### Requirement: One visible body for each main-agent advisory
**Reason**: New output reports actions rather than advising the main agent to take them.
**Migration**: Deliver one plugin-attributed factual receipt about the review.

### Requirement: Concise advisories preserve source and authority
**Reason**: Generic JEV correction wording no longer applies.
**Migration**: Retain plugin attribution and the no-new-authority boundary on maintenance receipts.

### Requirement: Incomplete-review messages retain actionable limits
**Reason**: JEV capacity recovery is retired.
**Migration**: Report an unavailable writer, conflict or failure without claiming success.

### Requirement: Visible advisories do not produce duplicate delivery receipts
**Reason**: There are no new JEV advisories.
**Migration**: Deliver maintenance receipts once; do not add a second generic notice.

### Requirement: Main-agent-only auditing
**Reason**: A root still owns scheduling and the board, but deliberately launches private children for reflection.
**Migration**: Run owner-only scheduling with scoped child decisions, no recursive review or cross-session mutation.

### Requirement: Source-backed current factual material
**Reason**: JEV factual-material serialization and evidence Choice are no longer required.
**Migration**: Validate private decisions against current original-session evidence and authoritative item records.

### Requirement: Provider-compatible Choice candidate sets
**Reason**: Maintenance makes no JEV Choice requests.
**Migration**: Accept only bounded structured item decisions through the private result channel.

### Requirement: Audit calls the stateless service with packed state
**Reason**: The external judgment service is removed from this package.
**Migration**: Use independent private reflection and parent writeback; do not fall back to service inference.
