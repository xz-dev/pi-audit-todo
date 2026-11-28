## Context

`todo.ts` publishes configurable main-agent guidelines. Its default blocker rule conflicts with `state/invariants.ts`, which already supports the useful transition `in_progress` → `pending`. No new transition is needed. In `audit/decision.ts`, `makePrompt` requests a factual reason, but `parseChoices` currently accepts `keep` even with an empty `sources` array. `audit/extension.ts` treats that choice as accepted; `audit/history.ts` then restores its loop/work-time baseline on replay. Parallel reviews can overlap on the same active item without changing its board revision.

## Goals / Non-Goals

**Goals:** Preserve the distinction between a board change, a supported decision to keep an item, and an item the reviewer could not verify. Apply the same evidence rule to an active item whether reviewed alone or in a group. Keep historical boards readable.

**Non-goals:** No fifth task status, inactivity timeout, maximum number of keeps, new scheduler, audit-created subtasks, mandatory agent heartbeats or new worker monitoring. Do not change completion, deletion or activation authority, non-active KEEP behavior, or custom `guidance.promptGuidelines` overrides.

## Decisions

### 1. Base both prompts on what is happening now

Use the same contrasts in the registered tool guidance, review prompt and README. If a test is failing but someone is debugging it, the work is active. If nobody is acting until #4 delivers a fixture, return the dependent task to `pending` and add #4; for an external wait, record the restart condition in the description. Do not create a fake blocker or treat an unfinished task as complete. If only the parser can proceed, let the **main agent** narrow the active item and retain the integration work in a separate pending item, using the existing `todo` operations. Do not silently discard scope in a description edit. A private fork reports a split that it cannot express; it does not acquire `create` authority.

A new `paused` or `blocked` status would duplicate `pending` plus a dependency or explanation. A fixed KEEP limit would penalize a long build even when fresh observations show it is still running.

### 2. Use the existing branch record as the evidence clock

Keep the loop/work-time baseline for **when to review**; use entry order for **what the review may cite**. They answer different questions. Reuse the anchored branch prefix, source IDs and ordering already built in `reflect`. Track the entry that starts the item's current active period from the board transitions; unrelated task edits and no-ops must not start a new active period.

For the first active KEEP, require an eligible original observation of this task in the current active period. For subsequent keeps in that period, require at least one qualifying observation strictly after the last accepted review's evidence cutoff and no later than this fork's anchor. Store the accepted fork anchor as an optional ID on the per-item review receipt; use branch order, not lexical comparison of IDs. Using the receipt's **write** time for new reviews would discard observations made while the fork was running. Carry the cutoff across description/dependency edits while continuously active; clear it when a new active period begins or the board is cleared. For old accepted receipts, use their own branch position as a conservative cutoff, without rewriting them. Never treat a missing or unreachable cutoff as permission to reuse old evidence.

The parent validates source membership, provenance, order and item/branch fences. The reviewer judges whether the cited record actually describes this item's ongoing work: a fresh observation of a named test run counts; a future intention, activity on another item, or the reviewer's own explanation does not. Give the reviewer usable source labels and the cutoff. Do not use keyword matching as proof of activity. An original user or assistant report is evidence of a report, not independent verification that a process is running. No polling or progress-message protocol is introduced for silent jobs.

### 3. Handle uncertainty per item, not as a renewal or a forced demotion

| Evidence in this review | Private decision | Parent outcome |
| --- | --- | --- |
| Item-specific work underway, with a current source | `keep` with reason and sources | Accept if the live fences and cutoff still match. |
| Whole item explicitly put aside or waiting | `update` to `pending`; record the prerequisite or restart condition | Apply the existing guarded write, then report actual changes. |
| Missing, stale or inconclusive evidence | `unverified`, naming what is missing | No board mutation and no accepted receipt for this ID. |
| Accurate mixed-scope correction needs another task | `unverified`, identifying the active and deferred portions | Report the split needed; no private creation, blanket demotion or renewal. |

Add `unverified` only to the **private response**, not the public TODO status or API. In a structurally valid result, handle an active KEEP lacking qualifying support as unverified for that item. Preserve whole-response rejection for malformed envelopes or incorrect requested IDs, and all existing authorization checks for mutations. Keep item-level retry backoff separate from an accepted-review checkpoint. Before accepting an active KEEP in `settle`, compare against the **live** evidence cutoff as well as the current board fences: sibling forks seeing the same original evidence must not both renew the item. Continue to deliver receipts with `triggerTurn: false`.

A prompt-only fix would still let a source-free result reset the timer. Conversely, forcing `pending` whenever evidence is missing would misclassify quiet jobs. Neither is appropriate. Changing an item's spinner text or paraphrasing a reason is not a substitute for evidence of work.

## Risks / Trade-offs

- **Sparse conversation evidence:** A real job may continue without a new observable report. Leave status unchanged but visibly unverified; retain retry backoff. Do not ask the agent to manufacture progress messages.
- **Fresh but irrelevant citations:** Order and provenance can be checked mechanically; semantic relevance cannot be inferred from an ID alone. Guide the reviewer with paired positive/negative examples and exercise those decisions separately from deterministic validation tests.
- **Replay and overlapping reviews:** Exercise two accepted windows, overlapping fork anchors, unchanged revisions, metadata edits, reload, reactivation and legacy receipts. If the boundary cannot be established, fail closed for renewal, not for ordinary work.

## Migration Plan

No migration command, board rewrite or reclassification on load. Read existing snapshots and receipts as before, apply the stronger acceptance rule on the next normally triggered review, and leave old visible messages intact. The new optional cutoff is private audit metadata; a rollback can ignore it and continue reading the existing receipt fields. Paused items already corrected to `pending` remain ordinary valid TODOs in either version.
