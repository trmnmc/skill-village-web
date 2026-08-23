# Game UI wireframes (reference)

Hand-drawn-style wireframes made in Claude Design (project "Game UI wireframing",
2026-08-20-ish), saved here as the design reference for future milestones. They are
**layout guidance, not visual style** — anything built from them is styled in the
game's own theme (cream/ink, IBM Plex Mono, `packages/web/src/theme.ts`).

Open any `.dc.html` in a browser; `support.js` beside them is the canvas runtime
they load. The live originals can be re-synced from the Claude Design project via
the DesignSync tool (project id `be9ebf64-88ce-472c-acaa-aa798901243f`).

## Files

- `Skill Village Wireframes.dc.html` — the option sheet: ten takes across six
  screens (1a–1k), "pick per screen, mix freely".
- `Village-C-Dock.dc.html` — **the chosen app shell**: map on top, bottom dock
  with creature card + stat bars, care verbs, docked chat input, roster chips,
  budget bar, egg status, notices.
- `Village-A-Floating.dc.html` / `Village-B-SidePanel.dc.html` — the two
  rejected shell candidates (floating card / right side panel), kept for the
  record.

## Which screens map to which milestone

| Wireframe | Screen | Milestone |
|---|---|---|
| shell (1a / Village-C) | dock chrome, care verbs, budget | unscheduled UI pass (pet/play endpoints already exist) |
| 1b / 1c | first-run ceremony vs narrated arrivals | first-run polish, any time |
| 1d / 1e | chat layouts (see open question below) | replaces the M4 side panel when the dock lands |
| 1f / 1g | adoption pen + catalog | M7 (builders) |
| 1h / 1i | hatchery interview + approval gate | M7 (builders) |
| 1j / 1k | train diff (sheet vs full-screen) | M7 (builders) |

Note the sheet predates the 2026-08-22 roadmap reconciliation (projects become
the villagers; skills/agents fold into helpers). The layouts survive that pivot —
the creature card, care verbs, and builder screens are cast-agnostic — but names
like "SKILL · lv 7" will read differently by the time these are built.

## Open question

Chat layout is deliberately undecided between 1d (input floats under the clicked
creature, on the map) and 1e (one fixed input bar in the dock, transcript beside
it). Decide when the dock is built.
