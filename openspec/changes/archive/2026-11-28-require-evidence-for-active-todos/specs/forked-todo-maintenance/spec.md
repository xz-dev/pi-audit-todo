## ADDED Requirements

### Requirement: Default guidance distinguishes active work from unfinished work
The built-in `todo` guidance SHALL reserve `in_progress` for work actually underway on the named task, including work by an identifiable ordinary worker or running job. It SHALL distinguish investigating a blocker from waiting for it. It SHALL direct the main agent to move wholly paused work to `pending`, to record an existing prerequisite with `blockedBy` or otherwise describe the resumption condition, and to split independently actionable work from deferred work when an item mixes both. Pausing or splitting SHALL NOT be represented as completion of unfinished scope. Configured guidance overrides SHALL retain their existing replacement semantics.

#### Scenario: Same failing test, different task states
- **WHEN** a test fails and the agent is investigating the failure on this task
- **THEN** the default guidance directs the agent to keep the task `in_progress`, not mark it completed
- **WHEN** that investigation stops until a maintainer supplies a fixture, with no other work underway on the item
- **THEN** the guidance directs the agent to set it to `pending` and record the fixture as the resumption condition, without inventing a dependency ID.

#### Scenario: Part of the work can continue
- **WHEN** the agent is implementing the parser but the independently deliverable integration work must wait for tracked task #4
- **THEN** the default guidance directs the main agent to track the two parts separately, leave only the parser work `in_progress`, and record the integration work as `pending` with `blockedBy: [4]`
- **AND** neither the original scope nor the remaining obligation is silently dropped or declared complete.

## MODIFIED Requirements

### Requirement: Review every due item or account for keeping it
The plugin SHALL measure each item independently, starting at its creation or last real change and restarting its review window after a newer accepted review. Eligibility SHALL be strictly more than 30 ordinary completed main loops **or** strictly more than 30 minutes of accrued ordinary work. The plugin SHALL require evidence for an actual board update. For non-active items a specific reason that the current record remains accurate SHALL suffice for KEEP. For `in_progress` items, in both periodic and parallel reviews, an accepted KEEP SHALL name the ongoing activity and cite an original record that supports it for that item in its current active period. Repeated acceptance SHALL require evidence newer than the last accepted review's evidence window for that item; neither rephrasing a reason nor citing an earlier audit receipt SHALL suffice. An accepted KEEP SHALL advance the review baseline without fabricating a task mutation. Missing evidence alone SHALL NOT authorize a status change or count as an accepted review. No mandatory empty-board operation or classification of new work SHALL replace the agent's existing initialization guidance.

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

#### Scenario: A second reason is not a second observation
- **WHEN** an active item was kept on a report that its test run was executing, and the next review has only that same report, no source, a previous audit receipt, or work on a different task
- **THEN** the item is reported as unverified, not kept, completed or automatically demoted; neither its board revision nor its accepted-review baseline advances
- **AND** this remains true after reloading the branch; the normal retry backoff prevents an immediate review loop.

#### Scenario: Long-running work does not exhaust a keep budget
- **WHEN** successive reviews each cite a new observation of the same still-running job for the item, without a task edit
- **THEN** each review can accept the active KEEP, including after reload, regardless of the number of prior keeps; no artificial task mutation or change in wording is required.

### Requirement: Private decisions and bounded authority
The review SHALL inherit the effective source context of the originating main session and operate privately without interrupting ordinary work. It SHALL return item-level, evidence-backed KEEP decisions, specific proposed board operations, or an explicit unverified outcome when neither is justified. When the evidence establishes that no work on an active item is underway and it has been put aside or is waiting, the reviewer SHALL propose returning it to `pending`, recording a known tracked prerequisite or otherwise the known resumption condition. The parent SHALL apply only operations that pass existing write guards. Count, age or the child model's opinion alone SHALL NOT authorize completion, cancellation, scope expansion or task execution. A private child SHALL NOT create split tasks, mutate the parent directly, delegate execution, or publish its transcript as a result.

#### Scenario: New activity exposes a forgotten old task
- **WHEN** a second task starts and the parent's record shows the older active task has stopped until tracked prerequisite #4 finishes
- **THEN** the reflection proposes setting the older task to `pending` and recording dependency #4, rather than forcing the second task off the board or justifying KEEP with the wait.

#### Scenario: Parallel work is justified
- **WHEN** each active task has a distinct evidenced activity that is genuinely underway
- **THEN** the plugin records why keeping the set is appropriate, identifies the tasks, and does not manufacture board edits.

#### Scenario: Missing evidence for one item does not decide its siblings
- **WHEN** one task in an otherwise valid parallel review lacks evidence and a different, independent task has an evidenced, guarded correction
- **THEN** the receipt distinguishes the first task as unverified from the correction actually applied to the second; the first task does not acquire an accepted-review baseline and no additional main turn is requested.

#### Scenario: Mixed scope in a private review
- **WHEN** the private reviewer finds active and deferred deliverables in one item and an accurate correction would require creating another item
- **THEN** the receipt identifies the parts needing separation for the main agent, without creating tasks, marking the whole item paused or complete, or renewing the unsplit item as fully active.
