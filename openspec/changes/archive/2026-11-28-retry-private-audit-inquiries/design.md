## Context

`packages/rpiv-todo/audit/extension.ts` reserves a job, then `reflect()` acquires the runtime, calls `runPrivateInquiry` and immediately calls `settle()` on success. `pump()` handles failures with a generic warning and per-revision backoff. A retry around `reflect()` or `pump()` would also catch failures *after* a board change. The harness in `audit/extension.test.ts` stubs the executor, so it cannot by itself demonstrate that the model was re-asked in the right child.

In `pi-extension-utils/src/private-inquiry/core.ts`, one execution owns a temp directory, guarded result file and child. The existing loop resets the result file before each prompt, validates only an own completed response, corrects invalid responses in the same child and returns typed failures with session evidence. The pinned runtime already rejects a text-only terminal reply or wrong write and exposes the child's admitted `helperCalls` count. Reflect uses this core and already has correction warnings, retained-session diagnostics and a check that the accepted response came from the observed child. See `proposal.md` for motivation.

## Goals / Non-Goals

- Add recovery to the phase that **obtains** a decision. Do not retry admission, guard failure, board settlement, durable publication, UI rendering or continuation delivery.
- Preserve existing per-consumer validators, native provider retry policy, cancellation, activity accounting and costs bounded by the existing evidence allowance. Retry count is not a wall-clock timeout or an HTTP request cap.
- Do not change TODO's commands, public configuration, scheduling thresholds, item-level eligibility, persisted schema or evidence standards. Do not enable retries globally for Continue or other consumers.

## Decisions

### 1. One opt-in loop in the shared executor

Keep the current one-attempt executor as the unit of resource ownership. Add an optional whole-attempt limit to the shared private-inquiry API (default **1**); TODO and Reflect explicitly choose **3**. Accept lazy runtime acquisition as well as the existing runtime input, so each attempt can acquire/reacquire within this boundary. Preserve extension-lifetime caching of a successfully created runtime; evict a rejected acquisition promise. Do not dispose a shared runtime on every retry. This covers setup throws without adding independent retry loops around three layers of consumer code.

An admitted job keeps one slot and frozen input. For each attempt, check cancellation/currentness, acquire the runtime, execute against the same source anchor/model/profile, then drain or quarantine that exact attempt's work and clean its transient files. Recheck authority after awaits and before another prompt, fork, handoff or notice. A typed `cancelled`, abort or stale guard ends the job silently. An accepted decision ends acquisition; a typed execution failure, exhausted invalid answers or an unexpected thrown inquiry error uses the next attempt immediately, without text matching, an added timer or waiting for a scheduler tick. The final failure preserves its own type, error and verified session evidence. Setup that never created a child has no session. Never start two attempts for one job concurrently.

### 2. Three distinct counters

| Counter | Owner and reset | Example |
| --- | --- | --- |
| Whole attempt | Shared retry loop, once per admitted logical job | Initial runtime acquisition fails, attempt 2 forks successfully; no third attempt on success. |
| Invalid terminal answer | Existing same-child correction loop, starts afresh for a new child | Text-only reply is invalid answer 1/3. The re-ask requires a single `write` at the marked path. A normal helper-only turn is progress, not a missing answer. |
| Evidence calls | One allowance per logical job across all children and re-asks | TODO: 3 of 4 already used leaves 1. Reflect: 8 of 10 leaves 2. At zero, allow the result write alone. |

Pass only the remaining lookup allowance to each fork. Capture each drained child's admitted count once and subtract it; pre-fork failure spends zero, rejection before batch admission spends zero. If a child ran but its count cannot be trusted, do not grant it back: use a write-only remaining allowance. Correction must neither reset the counter nor spend it just for submitting the result. Keep native transport retries native: they do not create children, consume a format attempt or earn an invalid-answer warning on their own. For these consumers, three consecutive format attempts in each of three forks can produce nine terminal answers, even if the ninth succeeds; three setup failures can exhaust the outer budget without a single answer.

### 3. Keep failure evidence and side effects on opposite sides of handoff

TODO supplies the same frozen board, IDs and evidence scope on every attempt. Improve its correction prompt: name the rejected submission, the designated `write` and the required complete payload rather than asserting that the board content was wrong when the tool was never called. Use the shared response observation for a human-only `1/3` or `2/3` warning only when a correction remains authorized. A failing optional UI observer must not change the outcome or trigger another request. Use Reflect's bounded, terminal-safe last-error preview and full verified-path/unavailable convention for the final notice; do not inject raw child text, paths or diagnostics into the main conversation.

Return a single terminal outcome to `reflect()`; invoke guarded `settle()` **outside** the retry loop. Parent commit, checkpoint, receipt and refresh errors remain settlement errors, not a claim that the private inquiry failed. A structurally valid decision with an unverified item or a stale target is also settlement, not grounds to rerun sibling items. This keeps `require-evidence-for-active-todos` independent. Only an exhausted current inquiry takes the existing failure backoff; it does not mark any item reviewed. Cancellation retains the existing cancellation command's own suppression behavior.

### 4. Enable Reflect explicitly, without changing its publication contract

Reflect's `reflection-private-execution` currently requires one child per logical reflection. Amend that external contract to **at most one live child per reflection and one distinct child per whole attempt that reaches fork**, not three separately admitted reflections. Keep the inquiry ID stable and distinguish the whole-attempt ordinal from the same-child answer number. Use an immutable per-attempt correlation for child subscriptions, working/progress observations and private source metadata. Detach old subscriptions and clear old source/progress before starting a successor; a late disposal callback must not overwrite the accepted child's source. Only the winning child/session/correlation can authorize existing durable result/completion entries, one completion hook and one ordinary continuation. Never wrap that publication in the retry loop. A final failure emits the existing diagnostic once; a stale operation emits nothing. Earlier failed-child paths cannot stand in for a final setup failure.

## Risks / Trade-offs

- **Latency and inference cost:** a failing provider may exhaust native retries inside each whole attempt. Keep the fixed outer cap, preserve cancellation throughout and document that immediate retry does not mean a short per-attempt timeout.
- **Lost provenance or duplicate writes:** a generic retry around the consumer handler would risk both. The shared loop has no parent writer; test a successful parent mutation followed by a throwing receipt, and a late event from a failed Reflect child.
- **Package skew:** both consumers pin the shared utility and carry install trust metadata. An adapter compiled against the new API must not ship with the old pin. Test a packaged consumer against the actual dependency, not just a mocked executor.

## Migration Plan

1. In `pi-extension-utils`, the `retry-private-inquiry-attempts` companion owns the shared API, contract, tests, and installable revision. TODO verifies that revision, then opts in locally without changing the default for other callers.
2. Update TODO's manifest, lock and trust metadata together. The `pi-reflect-watchdog` companion `reflection-terminal-retry` owns Reflect's parallel opt-in, specs and process models; it does not block TODO's local release after shared verification. The local `forked-todo-maintenance` delta does not replace the other repositories' contracts.
3. Run consumer and packaged regressions, including native correction, cancellation and exactly-once publication. To roll back either consumer, remove its opt-in or revert its adapter and pin together. No session migration is needed.
