# jev-todo-audit Specification

## Purpose
Periodically audits the agent's todo board (rpiv-todo) against actual conversation activity using the jev model (TypeSafe Choice primitive), and nudges the agent back on track when the two disagree. It also performs a bounded board check when the agent autonomously reaches a terminal stop, reconciling lifecycle state per task rather than treating the board as one aggregate verdict.

## Requirements

### Requirement: Loop counting from session branch

The extension SHALL count completed agent loops as the number of finalized assistant messages on the current session branch, starting from the first loop of the session. The count SHALL be reconstructed from the session branch on session start, compaction, and session-tree changes, so it survives restarts, reloads, and compaction. The runtime in-memory counter SHALL be authoritative between reconstructions.

#### Scenario: Count survives restart
- **WHEN** the session is reloaded or the process restarted
- **THEN** the loop count equals the number of assistant messages on the branch, and auditing continues from that count

#### Scenario: Aborted turns do not count
- **WHEN** an assistant message is aborted before finalization (never persisted to the branch)
- **THEN** the loop count is not incremented for it

#### Scenario: Branch switch follows the branch
- **WHEN** the user switches to a different session branch
- **THEN** the loop count is recomputed from that branch's assistant messages

### Requirement: Historical advisory bodies remain stable

Redraw, session reopening and later wording or configuration changes SHALL use the original stored advisory content rather than regenerate its text. Only a recognized shared footer can start collapsed; expansion SHALL show the original body in full. Earlier unrecognized verbose advisories SHALL remain fully displayed without a data migration or added new disclaimer. Presentation changes SHALL NOT turn an old advisory into fresh evidence or re-arm a previously suppressed demand.

#### Scenario: Reopen an earlier advisory after a wording update
- **WHEN** a session containing an older verbose advisory is reopened after this change
- **THEN** its original body remains visible without a new body wrapper, summary or rewrite
- **AND** reopening alone does not resend the advisory

#### Scenario: Redraw a new advisory
- **WHEN** the terminal width or theme changes after publication
- **THEN** styling or line wrapping can change while the stored and delivered body remains unchanged

### Requirement: Maintenance replaces JEV entrypoints
`pi-audit-todo` SHALL preserve historical visible messages, support disabling maintenance with `audit.enabled: false`, and perform no scheduled, terminal, or manual JEV inference. Whenever the plugin loads and exposes its audit commands, it SHALL register `/todo-audit` as its only manual maintenance check, including when maintenance is disabled. It SHALL NOT register `/jev-audit` as an alias or register `/jev-audit-service`. The command SHALL check currently eligible items through the existing maintenance rules without duplicating pending work. A disabled or not-due board SHALL launch no review. `full` SHALL report that full reassessment is retired; other unsupported arguments SHALL show `Usage: /todo-audit`. Neither response SHALL start an audit. Documentation SHALL identify the replacement command and obsolete settings and commands.

#### Scenario: Command discovery after upgrade
- **WHEN** Pi loads `pi-audit-todo`, whether maintenance is enabled or disabled
- **THEN** the plugin exposes `/todo-audit` once, does not expose `/jev-audit` or `/jev-audit-service`, and still exposes `/todos` and `/cancel-todo-audit`.

#### Scenario: Upgrade without an audit backend
- **WHEN** the user runs `/todo-audit` without arguments in an enabled session without JEV
- **THEN** the plugin applies its normal due-item rules without requiring or installing JEV, starting reviews for eligible items only and not duplicating pending work. If no item is due, it starts no review.

#### Scenario: Retired or unsupported arguments
- **WHEN** the user runs `/todo-audit full` or passes another unsupported argument to `/todo-audit`
- **THEN** `full` reports retirement and other unsupported arguments show `Usage: /todo-audit`; neither starts a review or makes a model call.

#### Scenario: Disabled or stopped session
- **WHEN** the user runs `/todo-audit` without arguments while maintenance is disabled, or an ordinary watchdog terminal-stop message arrives with no due item or new activation
- **THEN** neither condition starts a maintenance review or resumes a task, and the disabled command invocation reports that maintenance is disabled.
