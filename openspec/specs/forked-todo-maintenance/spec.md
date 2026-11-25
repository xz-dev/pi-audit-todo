# forked-todo-maintenance Specification

## Purpose

Keep the original agent's TODO board accurate by reviewing concrete concurrency transitions and overdue items in private, then recording verified changes or reasons for retaining them.

## Requirements

### Requirement: Review new active items at settled loop boundaries
The plugin SHALL compare task IDs in the preceding and current settled active sets on the selected main branch. For every ID newly `in_progress` when the final count of `in_progress` tasks is at least two, it SHALL initiate a distinct private background review giving concrete, evidence-backed reasons why the whole group needs to be concurrently active, or correcting obsolete active entries. It MUST NOT enforce a maximum, use a ten-loop cooldown, or launch a review solely because a count remains high.

#### Scenario: Two new activations in a single loop
- **WHEN** one active task remains active and two more enter `in_progress` in one completed main loop
- **THEN** two distinct background reflections are requested, one per new task, against the final three-item active set; an unchanged next loop requests neither again.

#### Scenario: Threshold is inclusive and based on identities
- **WHEN** the board goes from one to two active tasks, or a two-item active set replaces one ID with another while staying at two
- **THEN** one review is requested for the new ID, even if a different activation was just reviewed.

#### Scenario: Transient activity and restored boards
- **WHEN** an item briefly enters and leaves the active set before loop end, the final count is below two, or the plugin reloads an unchanged board already at two
- **THEN** none of these conditions by itself creates a parallelism review.

### Requirement: Review every due item or account for keeping it
The plugin SHALL measure each item independently, starting at its creation or last real change and restarting its review window after a newer accepted review. Eligibility SHALL be strictly more than 30 ordinary completed main loops **or** strictly more than 30 minutes of accrued ordinary work. The plugin SHALL require evidence for an actual board update or a specific reason that the current record remains accurate. A keep decision SHALL advance the review baseline without fabricating a task mutation. No mandatory empty-board operation or classification of new work SHALL replace the agent's existing initialization guidance.

#### Scenario: Exact boundaries and independence
- **WHEN** A has accumulated exactly 30 loops and exactly 30 minutes since its baseline
- **THEN** A is not due yet; loop 31 or any measured work beyond 30 minutes suffices independently. A `todo list`, an identical write, or an update to B does not refresh A.

#### Scenario: Every status is included, terminal revisions are settled once
- **WHEN** pending, in-progress, completed and deleted records exceed either limit
- **THEN** each is covered by a review; an unchanged completed or deleted revision is not scheduled again after its accepted terminal review. A later actual change to that record opens a new window.

#### Scenario: Reason instead of meaningless edits
- **WHEN** a pending item still depends on an unfinished prerequisite already accurately recorded
- **THEN** an accepted review names the item, prerequisite and reason for keeping it unchanged; the mutation date stays intact, and the plugin does not redispatch the same review on the next loop.

#### Scenario: Empty board
- **WHEN** a new session begins with no items and the user only asks a question
- **THEN** the plugin does not force a list or create operation, invent an item, or start a maintenance fork solely to initialize the board.

### Requirement: Accumulate ordinary working time without self-triggering
The time condition SHALL use the union of observed ordinary work intervals of the main session and its participating child sessions. Simultaneous activity counts once. The plugin SHALL exclude idle, downtime and its own private inquiry activity. A time limit exceeded during ordinary work SHALL be detectable without waiting for a 31st loop; private child turns SHALL NOT count toward the loop limit. Reload, compaction and branch navigation SHALL respect current-branch baselines and MUST NOT invent work during observation gaps.

#### Scenario: Parallel work is not multiplied
- **WHEN** main and an ordinary child work concurrently for 20 minutes, then both remain idle for an hour, then only the child works another 11 minutes
- **THEN** an unchanged item has accumulated 31 minutes, not 51 or 91, and is due even if main completed fewer than 31 loops.

#### Scenario: Private work is not an activity source
- **WHEN** only TODO review forks are running, or the process was closed and then reopened after an hour
- **THEN** neither interval contributes ordinary working time or ordinary main loops, and neither independently causes another review.

### Requirement: Private decisions and bounded authority
The review SHALL inherit the effective source context of the originating main session and operate privately without interrupting ordinary work. It SHALL return item-level, evidence-backed KEEP decisions or specific proposed board operations. Count, age or the child model's opinion alone SHALL NOT authorize completion, cancellation, scope expansion or task execution. A private child SHALL NOT mutate the parent directly, delegate execution, or publish its transcript as a result.

#### Scenario: New activity exposes a forgotten old task
- **WHEN** a second task starts and the parent's record shows the older active task is waiting on a prerequisite
- **THEN** the reflection can propose marking that older task pending and recording the dependency, rather than forcing the second task off the board or inventing a justification for both.

#### Scenario: Parallel work is justified
- **WHEN** each active task has a distinct evidenced activity that is genuinely underway
- **THEN** the plugin records why keeping the set is appropriate, identifies the tasks, and does not manufacture board edits.

### Requirement: Guard authoritative writeback and publish actual outcomes
Only the owning parent plugin SHALL apply a validated decision through the real parent TODO board. Before mutation it SHALL check session/branch, target and related revisions, scope, and TODO operation invariants. It SHALL avoid overwriting newer conflicting changes, reject late or duplicate result authority, and keep failed or unverified operations distinct from committed changes. It SHALL send a concise plugin-attributed receipt to the original agent's context describing actual changes, accepted keeps with reasons, and relevant skips/failures. Delivery SHALL NOT request another main turn, claim user authorization, or instruct the main agent to perform operations already applied.

#### Scenario: Live board, replay and context agree
- **WHEN** a validated update changes task #7 to pending and adds dependency #4 while #9 is kept for a stated reason
- **THEN** the main `/todos`, later `todo list` and reloaded main branch show the same real update. The original agent receives the changed fields for #7 and reason for #9, not the child's reasoning transcript or a to-do list of unexecuted suggestions.

#### Scenario: Two reviews race or the branch changes
- **WHEN** two reflections refer to the same revision, and one commits a change before the other returns, or the owner moves to another branch
- **THEN** no stale write overwrites the new state, no duplicate success is claimed, and no old result is delivered to a different branch or session.

#### Scenario: A partial operation set or unavailable writer
- **WHEN** one operation succeeds and a later operation fails validation, or no supported parent writer is available
- **THEN** only verified successes are described as changes; rejected or unavailable operations are not marked done or counted as accepted review of those items. The main session remains usable.

### Requirement: Standalone and co-installed operation
Maintenance SHALL work without installing or activating a public JEV, Reflect or Continue extension. If Continue Watchdog is installed separately, the two extensions SHALL keep independent commands, ownership, activity accounting, children, timers, locks, budgets, hooks, result channels and cancellation. Each SHALL remain independently switchable; internal review work SHALL NOT constitute ordinary activity, a continuation decision, or a callback for the other.

#### Scenario: Standalone and both load orders
- **WHEN** the audit runs alone, or both it and Continue Watchdog run in either load order with ordinary inputs held constant
- **THEN** the audit produces the same due decisions; there is no duplicate watchdog registration, change to user package settings, spurious Continue wake, reset or budget charge from the review.

#### Scenario: Independent cancellation
- **WHEN** one extension cancels its private inquiry, is disabled, or shuts down while the other remains enabled
- **THEN** it cancels only its own work and makes no change to the other extension's lock, outstanding decision or result publication.
