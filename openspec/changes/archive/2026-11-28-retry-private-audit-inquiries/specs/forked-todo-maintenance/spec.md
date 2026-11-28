## ADDED Requirements

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
