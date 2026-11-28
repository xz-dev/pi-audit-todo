# pi-audit-todo

A persistent TODO board for [Pi](https://github.com/earendil-works/pi), with private background reviews that keep the board up to date without restarting the main agent. It combines the `rpiv-todo` tool, `/todos` command, and live panel with audited writeback. It does **not** use or install JEV. Private reviews use the main session’s selected model and can incur inference cost.

## Install

Tested with Pi **1.5.2** and **1.6.0**, including the `1.6.0-xz.437.1` build. Install the package and restart Pi:

```sh
pi install git:github.com/xz-dev/pi-audit-todo
```

This plugin **replaces** `rpiv-todo`; disable or remove the old TODO extension and `pi-jev-todo-audit` before loading it. Do not load two providers of `todo` or `/todos`. Existing TODO snapshots replay under the same keys; old JEV opinions do not count as reviews. You can keep Continue Watchdog, Reflect Watchdog, or JEV installed independently for other uses. The new package does not modify their settings, commands, or lifecycle.

## What runs in the background

| Trigger | What happens |
| --- | --- |
| A completed main loop ends with **at least two** `in_progress` tasks | Start a distinct private review for each task that just became active. The review explains why the whole group needs to be active or corrects stale entries. Two is a review threshold, not a maximum. An unchanged group does not retrigger. |
| An item goes **over 30 main loops or over 30 minutes of observed ordinary work** without change or review | Review that item: update supported fields or report a concrete reason to keep it. Pending tasks are included; an unchanged completed or deleted revision is reviewed once. `todo list` and no-op writes do not refresh it. |

Working time is not wall-clock age. It runs while the main session or a participating ordinary child is working, counts overlap once, and pauses when everyone is idle. Private audit work and offline time do not count. Child processes must load the plugin in the same inherited activity domain to be observed; unrelated and unobservable sessions are not counted. Child loop counts never replace the main loop count.

The reviewer reads the parent’s effective session context in a private fork. It can make a bounded number of read-only evidence lookups and submit a structured result, but cannot execute the work or write the parent board directly. The parent compares branch, board generation, and item revisions before applying any update. It then reports **what was actually changed**, kept with a reason, or skipped. The changelog enters the original conversation as plugin feedback, not as instructions or user approval. It does not start a new turn.

A text-only reply, wrong tool, or invalid result is corrected in the same child, with up to three answers per child. If the whole attempt fails, the audit immediately retries from its original snapshot, at most twice. All children share four read-only evidence calls; the result write does not consume that budget. Native provider retries are separate. Cancellation stops retries, and a failed attempt never writes the board. If all attempts fail, the audit reports the last error and the final child's verified session path when available, then applies its existing backoff.

## Active, paused, and unverified tasks

- **Keep `in_progress`** while someone is actually working on the item. Debugging a failing test or observing an ongoing test run counts; waiting for a fixture without doing more work does not.
- **Move paused work to `pending`.** Record an existing prerequisite in `blockedBy`, or put the external resumption condition in the task description. Do not mark paused work complete.
- **Split mixed work in the main agent.** If parser work continues but its integration must wait, keep only the parser work `in_progress` and track integration as a separate `pending` item. The private reviewer can report that a split is needed, but cannot create tasks.

For both periodic and parallel reviews, keeping an active task requires a fresh original report of work on that item. The same report cannot renew it twice; a later report on the same long-running job can. When a pause is supported by evidence, the reviewer can propose a guarded correction. When evidence is missing, the receipt says **unverified**: the status stays as it was, and the review baseline is not refreshed. `unverified` is a review outcome, not a TODO status. Custom `guidance.promptGuidelines` still replace the defaults shown to the main agent.

## Controls

- `/todos`: Show the current board. The live panel retains the three latest completions and keeps active tasks above the focus window.
- `/todo-audit`: Check for due TODO reviews. The `full` argument only reports that full reassessment is retired. This command replaces `/jev-audit`, which is no longer registered.
- `/cancel-todo-audit`: Cancel only this session’s queued and running reviews. It does not stop the main agent or another watchdog.
- To disable automatic maintenance but keep the board, set `{"audit":{"enabled":false}}` in `${XDG_CONFIG_HOME:-$HOME/.config}/rpiv-todo/config.json` and reload Pi. `PI_AUDIT_TODO_DISABLE=1` also disables it.

Deletion or reactivation by audit requires a narrow, explicit user instruction issued for the existing task, e.g. `Delete TODO #7` or `Mark #7 in_progress`. Completion requires a matching user directive or an explicit whole-item report such as `Task #7 completed`. The normal `todo` tool remains available for direct, user-directed bookkeeping. A model judgment is not independent verification of completion. Keep sensitive files outside the permitted scope; a remote model can process the fork’s inherited context.

## Source and license

[Source and tests](https://github.com/xz-dev/pi-audit-todo/tree/source) retain the upstream monorepo layout. The default branch is the installable projection of `packages/rpiv-todo`; `.downstream-source` identifies the exact upstream and patches. See [MAINTAIN.md](MAINTAIN.md) for rebuild instructions. The board is based on [juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono). [MIT](LICENSE), with upstream and downstream notices retained.
