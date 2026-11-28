## Why

A private TODO audit can stop on a single setup or execution failure. Its generic warning does not tell the operator what failed or which child session to inspect. The existing result-correction loop helps a child fix a bad answer, but cannot recover a failed inquiry; Reflect has the same distinction between a bad answer and a failed run.

## What Changes

- Give TODO maintenance, parallel TODO reviews and private Reflect inquiries up to **three whole attempts per admitted job**: one initial attempt and at most two immediate retries. Each retry starts from the same captured input, not from the failed child's transcript. Stop on success, cancellation or loss of authority.
- Keep native provider retry and same-child result correction separate. A normally finished text reply without a designated result write, a rejected tool batch or an invalid payload gets concrete correction instructions. Show the operator which correction is being retried; do not ask for a fourth answer in the same child.
- After the last failed attempt, show one human-only diagnostic with the final error and the verified failed-child session path, or an honest unavailable reason. TODO then uses its existing item backoff. Never retry a parent board write, receipt, Reflect hook or continuation.
- Implement the whole-attempt policy once in `pi-extension-utils`. TODO and Reflect explicitly enable it; existing callers that do not opt in keep their single-attempt behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `forked-todo-maintenance`: specify the two retry budgets, cancellation, terminal diagnostics and the boundary before guarded writeback for both TODO review triggers.

## Impact

The local delta belongs to `pi-audit-todo`. Delivery also requires coordinated changes in `pi-extension-utils` (`private-inquiry-runtime`) and `pi-reflect-watchdog` (notably `reflection-private-execution`: one child **per whole attempt**, no longer one per logical reflection). Those repositories own their respective specs, dependency pins and tests. Reflect's existing success and continuation behavior stays intact. The change increases possible inference cost, not board authority or ordinary work accounting. It adds no public command, service or global Pi setting.
