# pi-audit-todo

A persistent TODO board for [Pi](https://github.com/earendil-works/pi), with private background reviews that keep the board up to date without restarting the main agent. It combines the `rpiv-todo` tool, `/todos` command, and live panel with audited writeback. It does **not** use or install JEV. Private reviews use the main session’s selected model and can incur inference cost.

## Install

Tested on stock Pi **1.5.2**. Install the package and restart Pi:

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

## Controls

- `/todos`: Show the current board. The live panel retains the three latest completions and keeps active tasks above the focus window.
- `/jev-audit`: Legacy command name; checks existing maintenance eligibility, not the old classifier. The `full` argument is retired.
- `/cancel-todo-audit`: Cancel only this session’s queued and running reviews. It does not stop the main agent or another watchdog.
- To disable automatic maintenance but keep the board, set `{"audit":{"enabled":false}}` in `${XDG_CONFIG_HOME:-$HOME/.config}/rpiv-todo/config.json` and reload Pi. `PI_AUDIT_TODO_DISABLE=1` also disables it.

Deletion or reactivation by audit requires a narrow, explicit user instruction for the exact ID, e.g. `Delete TODO #7` or `Mark #7 in_progress`. The normal `todo` tool remains available for direct, user-directed bookkeeping. A model judgment is not independent verification of completion. Keep sensitive files outside the permitted scope; a remote model can process the fork’s inherited context.

## Source and license

[Source and tests](https://github.com/xz-dev/pi-audit-todo/tree/source) retain the upstream monorepo layout. The default branch is the installable projection of `packages/rpiv-todo`; `.downstream-source` identifies the exact upstream and patches. See [MAINTAIN.md](MAINTAIN.md) for rebuild instructions. The board is based on [juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono). [MIT](LICENSE), with upstream and downstream notices retained.
