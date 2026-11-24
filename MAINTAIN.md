# Downstream maintenance

`source` carries the upstream monorepo layout. `main` is generated: it is the installable `pi-audit-todo` package, not the base for patches. The original `rpiv-mono` and `pi-jev-todo-audit` repositories are not changed by a rebuild.

## Assembly

1. Fetch and pin [upstream main](https://github.com/juicesharp/rpiv-mono/tree/main).
2. Replay `patch/rpiv-todo-focus-window`, `patch/rpiv-todo-completed-fade`, `patch/rpiv-todo-active-strip`, then `patch/pi-audit-todo`. The branches are stacked in that order. Keep porting conflicts on their owning patches. The baseline does not include upstream [#190](https://github.com/juicesharp/rpiv-mono/pull/190), [#351](https://github.com/juicesharp/rpiv-mono/pull/351), or [#362](https://github.com/juicesharp/rpiv-mono/pull/362): the first two nudge instead of committing, and the last collapses parallel work to a single active item. For writes, track both the board generation and the item revision; see upstream [#340](https://github.com/juicesharp/rpiv-mono/issues/340).
3. On the source candidate, run `npm ci`, `npm run check`, `npx vitest run packages/rpiv-todo`, the [OpenSpec change](https://github.com/xz-dev/pi-audit-todo/tree/source/openspec/changes/replace-jev-with-forked-todo-review) checks and the real-session audit acceptance smoke. The currently tested host is stock Pi 1.5.2.
4. Use `scripts/project-pi-audit-todo.mjs SOURCE_ROOT EMPTY_OUTPUT_ROOT` from the projection branch. Both paths must be distinct and non-nested. The script only reads tracked source files and records exact provenance. Do not modify the projection by hand.
5. Run `npm pack --dry-run` and test a disposable Pi load of the projection before moving `main`. Keep the package's original `todo`, `/todos`, and `rpiv-todo-state` compatibility. Hooks, any publication automation, and downstream maintenance policy belong on `ci`, not on an upstream patch.

Rebuild and validate after upstream changes; compatibility patches belong on their own source branch and must not be hidden in a generated tree. Retire a patch only when the replacement behavior passes the corresponding tests. Do not edit or republish any independently installed watchdog or JEV package.
