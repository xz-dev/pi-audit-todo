## 1. Shared dependency prerequisite

- [x] 1.1 Verify that `pi-extension-utils` companion `retry-private-inquiry-attempts` has an installable revision, keeps opt-out callers at one attempt, and passes its packed checks. Use `4db1a196a2c01b96a344424b645e60936fde68bf` (independently Git-installed; `npm run check` passed in the owning repository). The `pi-reflect-watchdog` companion `reflection-terminal-retry` owns Reflect integration and is a parallel consumer, not a TODO implementation task.

## 2. TODO audit

- [x] 2.1 Pin the verified revision in the package and lock/trust metadata; enable three whole attempts for both maintenance and parallel reviews. Verify setup recovery in the original job, using the frozen anchor, model and IDs, and that the shared profile leaves one helper after spending three out of four.
- [x] 2.2 Provide same-child correction text and bounded human-only warnings. With a scripted responder return text without `write`, then write a valid result in that child. Assert one `1/3` warning, one accepted result, no `3/3` re-ask warning or extra main turn, and no private diagnostic in main context.
- [x] 2.3 Report only the final failure with the bounded error and exact verified JSONL or unavailable reason. Test three failed attempts, unchanged acceptance and both backoff thresholds. Cancel or invalidate a current review and assert no terminal failure notice or successor child.
- [x] 2.4 Keep guarded settlement and parent effects outside retries. Test a committed update followed by receipt failure, stale revisions, and partial item acceptance; no repeated mutation, inquiry or receipt is allowed.

## 3. Verification

- [x] 3.1 Document all retry budgets and update `docs/programming-thinking/todo-review.idea.lean`; typecheck and run the model.
- [x] 3.2 Run the TODO package suite and projected `scripts/smoke-pi-audit-todo.mjs` with the updated installed dependency on stock and xz Pi. Verify real private retry-to-success, one board change, no extra main turn, and standalone plus both Continue load orders.

The updated Lean model typechecked and ran with Lean 4.35.0. An independent semantic reader was launched but stopped before returning a report; this is not an independent proof review.

Verified: 365 TODO tests; projected recovery on stock Pi 1.5.2 and xz Pi 1.6.1-xz.438.1 in all three load orders. Every run used three answers in the first child and one in its replacement, with one receipt and no audit-triggered turn.
