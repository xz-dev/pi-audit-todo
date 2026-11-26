## 1. Update the TODO widget

- [x] 1.1 Extend the existing mouse handler in `packages/rpiv-todo/todo-overlay.ts` to expand from the hint row only while collapsed. In `todo-overlay.mouse.test.ts`, verify one toggle per plain left click, the unchanged heading and keyboard paths, no action on the same row when open, and pass-through for the spacer and other gestures.
- [x] 1.2 Add localized mouse-only and mouse-plus-key hints and update `packages/rpiv-todo/docs/overlay.md`. Test fullscreen with a configured key and with `collapseKey: "off"`, regular mode, an unavailable mode, and a live mode change. Run `npx vitest run packages/rpiv-todo/todo-overlay.mouse.test.ts` and `npx vitest run packages/rpiv-todo`.

## 2. Verify mouse delivery in Pi

- [x] 2.1 In a disposable real Pi TUI session with a populated and collapsed TODO widget, verify that fullscreen delivers a click on the hint and the tasks reappear without a main turn or board write. Verify that the heading still toggles and regular mode retains its keyboard-only hint and shortcut. Record the host version and terminal or PTY used.
  - Verified on stock Pi 1.5.2 and Pi 1.6.1-xz.438.1 using isolated tmux PTYs with seeded sessions: fullscreen hint clicks reopen the panel, heading clicks toggle it, task clicks do not toggle it, regular mode still toggles with the shortcut, and neither board snapshots nor conversation entries change.
