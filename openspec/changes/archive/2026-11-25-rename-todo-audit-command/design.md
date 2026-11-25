## Context

`packages/rpiv-todo/audit/extension.ts` registers the manual command and its usage text. Its no-argument handler already delegates to `checkDue()`, the same eligibility path used by automatic maintenance. The standalone package is generated from `packages/rpiv-todo`; its README and the registration are copied by the projection script.

The main `jev-todo-audit` spec still contains the predecessor's `Manual review modes` requirement. The implemented but unsynced `replace-jev-with-forked-todo-review` delta removes it and adds `Maintenance replaces JEV entrypoints`. This change modifies that replacement requirement, not the predecessor's full-review contract.

## Goals / Non-Goals

**Goals:** Keep one audit handler and verify the public name in the installable projection.

**Non-Goals:** No scheduler, writeback, configuration, persisted-state, or external extension changes. No hand edits to the generated branch.

## Decisions

- Rename the existing registration and update its description and usage. Keep the existing argument guards, disabled notification, session ownership checks, and due-item dispatch. A second registration would preserve an obsolete command and is explicitly out of scope.
- Update the source README with a short upgrade note. Verify the projected command list in the existing Pi RPC smoke test rather than relying on source-string matches or changing the projection machinery.

## Risks / Trade-offs

- Shortcuts and scripts using `/jev-audit` stop working → Document `/todo-audit` as the direct replacement.
- A rename applied to specs out of order could fail to find the requirement or leave the obsolete contract active → Sync or archive `replace-jev-with-forked-todo-review` before syncing or archiving this delta. No spec sync or archive is needed to implement the runtime rename.

## Migration Plan

Update the owning `patch/pi-audit-todo` source patch, regenerate a disposable projection using the existing procedure, and verify its public commands before release. Downgrading to the previous package revision restores the old command name without migrating board data.
