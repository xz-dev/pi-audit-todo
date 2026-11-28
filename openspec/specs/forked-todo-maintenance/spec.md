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

### Requirement: Accumulate ordinary working time without self-triggering
The time condition SHALL use the union of observed ordinary work intervals of the main session and its participating child sessions. Simultaneous activity counts once. The plugin SHALL exclude idle, downtime and its own private inquiry activity. A time limit exceeded during ordinary work SHALL be detectable without waiting for a 31st loop; private child turns SHALL NOT count toward the loop limit. Reload, compaction and branch navigation SHALL respect current-branch baselines and MUST NOT invent work during observation gaps.

#### Scenario: Parallel work is not multiplied
- **WHEN** main and an ordinary child work concurrently for 20 minutes, then both remain idle for an hour, then only the child works another 11 minutes
- **THEN** an unchanged item has accumulated 31 minutes, not 51 or 91, and is due even if main completed fewer than 31 loops.

#### Scenario: Private work is not an activity source
- **WHEN** only TODO review forks are running, or the process was closed and then reopened after an hour
- **THEN** neither interval contributes ordinary working time or ordinary main loops, and neither independently causes another review.

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

### Requirement: Retry a failed private audit without repeating its trigger
For each admitted maintenance or parallel review, the plugin SHALL allow one initial whole attempt and at most two immediate retries to obtain a private decision. Any returned or thrown inquiry failure before decision handoff SHALL qualify, without error-text or status-code matching. Each retry SHALL start after cleanup of the preceding attempt, use the same job reservation, original anchor, selected model/thinking, target IDs and captured board/evidence scope, and use a fresh child and result file if setup reaches that point. Acceptance, cancellation or loss of job authority SHALL end retries. No attempt SHALL advance the ordinary work clock or loop count merely by running.

#### Scenario: Recovery from unlike failures
- **WHEN** lazy runtime acquisition fails before a child exists, the next attempt's provider fails after native recovery, and the third attempt returns a valid decision
- **THEN** the same admitted job accepts that decision without waiting for a new main loop, timer or manual command
- **AND** only its successful child can supply the decision; no fourth attempt or terminal failure notice occurs.

#### Scenario: Cancellation between attempts
- **WHEN** `/cancel-todo-audit`, a new user input, owner shutdown or a branch change revokes the job while a failed attempt is draining
- **THEN** no replacement child or correction is started; a late answer, warning or receipt from the revoked job is not published.

### Requirement: Correct invalid terminal answers in the same audit child
The plugin SHALL allow at most three terminal result answers per whole attempt, including the first. A normally completed answer that does not submit the designated result, a rejected tool batch, or a result that fails validation SHALL receive a concrete correction in the same child while budget and authority remain. The correction SHALL identify the required `write` tool, designated result file and relevant submission error. Each actual re-ask SHALL have one bounded human-visible warning identifying the rejected answer number out of three. Native provider recovery SHALL remain separate. Valid helper-only progress is not a terminal answer. The four evidence calls available to one logical TODO review SHALL be shared across its children and corrections, not replenished on a fresh fork. A designated result write alone SHALL remain available at zero and SHALL NOT spend a helper call.

#### Scenario: The child says “done” instead of calling write
- **WHEN** the child finishes the first answer with ordinary text and no result write
- **THEN** the operator sees an invalid-answer warning for 1/3 and the same child is asked to write the complete result at the designated path
- **AND** a valid second answer ends the inquiry without opening a new child or publishing the text reply.

#### Scenario: Wrong tool, then exhaustion
- **WHEN** all three terminal answers use a rejected tool batch or fail result validation
- **THEN** disallowed effects do not execute, only answers 1 and 2 trigger re-ask warnings, and answer 3 fails this whole attempt
- **AND** if all three whole attempts fail this way there are at most nine terminal answers in three children, not a fourth child; this is not a cap on provider requests.

#### Scenario: Replacement does not replenish evidence calls
- **WHEN** the first child uses three of the review's four evidence calls before its provider fails
- **THEN** the replacement child can use at most one further evidence call, and can still submit a valid result with `write` after that call.

#### Scenario: No child response to correct
- **WHEN** the prompt settles without an assistant response of its own, or the provider returns an execution error after native recovery
- **THEN** the failure does not consume a format correction or validate an inherited reply; the current job uses the next whole attempt if available.

### Requirement: Finish retries before parent writeback or final failure reporting
The plugin SHALL hand off at most one accepted decision per job to the existing guarded writeback. A rejected, partial or unverified board operation, checkpoint, refresh or receipt failure after handoff SHALL NOT restart the inquiry. If all three whole attempts fail while the job is current, the plugin SHALL issue exactly one human-only terminal warning. It SHALL identify the audit and final failure, include a bounded terminal-safe preview of the last error when present, and give the verified full absolute path to the last attempt's retained private JSONL or an explicit unavailable reason. It SHALL NOT substitute an earlier child or the parent, expose the transcript to the main model, mark a review accepted, or trigger a main turn. Due items SHALL remain subject to existing per-revision backoff, not immediate re-enqueue.

#### Scenario: Last failure has or lacks a retained session
- **WHEN** all attempts fail and the final attempt leaves a verified private session
- **THEN** the warning contains that child's path and final error, not the history of earlier errors; the review baseline remains unchanged
- **WHEN** the last attempt instead fails before a fork exists, even if an earlier attempt left a file
- **THEN** the warning identifies the final setup failure and reports no private session without borrowing the earlier path.

#### Scenario: Review becomes eligible later
- **WHEN** the last current attempt fails on a still-due revision
- **THEN** it is not retried on the next eligibility check while both backoff thresholds remain unmet; a later check after ten ordinary loops or sixty seconds of accrued ordinary work can admit a new job.

#### Scenario: The board write succeeded but the receipt failed
- **WHEN** the parent has already applied a validated update and an error occurs delivering its receipt
- **THEN** it neither obtains another private decision nor repeats the update or claims a second success.
