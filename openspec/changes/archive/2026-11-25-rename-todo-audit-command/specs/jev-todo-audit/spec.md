## MODIFIED Requirements

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
