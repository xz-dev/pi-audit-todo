# todo-overlay Specification

## Purpose

Make the TODO overlay easy to reopen while preserving keyboard access and ordinary terminal mouse behavior.

## Requirements

### Requirement: Expand the TODO overlay by clicking the collapsed hint
In a Pi fullscreen TUI that supports widget mouse input, the collapsed TODO overlay SHALL show a clickable expand hint. A plain left click anywhere on that hint row SHALL expand the panel once; the same row position SHALL NOT act as an expand control when the panel is open. An unmodified left click on the heading SHALL still toggle either state. Modified clicks, other buttons, wheel, drag, task rows, and blank spacer rows SHALL retain their existing behavior.

#### Scenario: Click the hint while collapsed
- **WHEN** the TODO panel is collapsed in Pi fullscreen and the user left-clicks the hint below `Todos` without modifiers
- **THEN** the panel expands and shows its task rows; clicking the first task row afterward does not collapse it.

#### Scenario: Use the heading or keyboard as before
- **WHEN** the user clicks the heading or presses the configured collapse shortcut
- **THEN** the existing action still toggles the panel. In fullscreen the collapsed hint advertises both the click and the configured key when the shortcut is enabled.

#### Scenario: Use the hint with the shortcut disabled
- **WHEN** the panel is collapsed in fullscreen and `collapseKey` is `off`
- **THEN** the hint advertises a click without a key and a plain left click still expands it.

#### Scenario: No mouse dispatch
- **WHEN** the panel is collapsed in regular terminal mode or on a host without widget mouse support
- **THEN** the hint does not advertise a mouse action and shows the configured key, or the static collapsed label if that key is disabled.

#### Scenario: Other mouse input passes through
- **WHEN** the user scrolls, drags, clicks the spacer, or uses a modified or non-left click on the hint
- **THEN** the TODO widget does not consume the event or toggle the panel.
