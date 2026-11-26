## Context

`todo-overlay.ts` already supplies a `handleMouse` handler through Pi's `setWidget` factory. It accepts the heading at local row 0 in both states; the collapsed hint is local row 1. The `index.ts` shortcut and heading already use `toggleCollapse()` to update state and request a full redraw. Both the published and installed package already contain the heading-click behavior from upstream #323.

## Goals / Non-Goals

**Goals:** Reuse the existing mouse path and redraw, and keep the localized instruction accurate for the active renderer and configured key.

**Non-Goals:** No raw terminal mouse handling, renderer changes, new configuration, or change to global tool expansion or TODO audit behavior.

## Decisions

- Extend the widget's existing row check to accept row 1 only while collapsed. Keep the plain-left-click gate and the shared toggle. Do not add a second handler or make open task rows actionable; leave the spacer and every other event unhandled.
- Use the widget factory's Pi `TUI.mode` at render time. The pinned Pi API supplies a live renderer reference that follows mode switches. Advertise mouse only for `fullscreen`; treat an unavailable mode as keyboard-only. Do not cache the mode at registration, inspect global settings, or enable terminal tracking in regular mode.
- Keep the existing keyboard-only and static strings. Add localized mouse-only and combined mouse-and-key forms, using the existing locale/fallback and truncation mechanisms. Put the click instruction first in the English combined form so it remains discoverable at narrower widths. Example: `Click to expand or press ctrl+shift+t`.

## Risks / Trade-offs

- Row 1 is also the first task row when open → Test that the same coordinate is ignored after expansion, along with modifier, wheel, drag, and spacer cases.
- The terminal or multiplexer may intercept mouse input → The keyboard shortcut remains available; test mouse delivery in a real Pi fullscreen session as well as the widget handler. Regular mode continues to leave the terminal's mouse behavior alone.
