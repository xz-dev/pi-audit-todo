## 1. Rename the command

- [x] 1.1 In `packages/rpiv-todo/audit/extension.ts`, replace the registration with `/todo-audit`, update the help description and usage, and leave the handler's guards and scheduling intact. In `packages/rpiv-todo/audit/extension.test.ts`, verify registration when disabled, the disabled notice, due-only and non-duplicate review behavior, and that `full` and unsupported arguments start no review. Run `npx vitest run packages/rpiv-todo/audit/extension.test.ts`.
- [x] 1.2 Update the Controls section of `packages/rpiv-todo/README.md` and verify that it lists `/todo-audit` and mentions `/jev-audit` only as a removed command.

## 2. Verify the installable package

- [x] 2.1 Update `scripts/smoke-pi-audit-todo.mjs` so Pi RPC `get_commands` checks that `todo-audit`, `todos`, and `cancel-todo-audit` are each present once, and that neither old JEV command is registered. Run the smoke with `TEST_PACKAGE` pointing to a disposable installable projection built as described in `MAINTAIN.md`; preserve the existing standalone and co-installation checks.
