# @village/web

The browser game — the full-fidelity view of the village.

**Owns:**

- **KAPLAY scene** — scrollable pixel-art village with the four zones (Homes, Adoption Center, Hatchery, Notice board), wandering/idle animations, speech bubbles.
- **Sprite compositor** — turns core's `CreatureAppearance` into a drawn creature by layering Kenney Monster Builder parts from `assets/parts/` at the archetype's anchor points, tinted to the creature's palette.
- **Panels** — chat, hatch interview, draft/diff review with Approve/Edit/Ask-for-changes, adoption browser, settings (budgets, hooks consent), HUD with the token meter.

**Talks to:** `@village/server` over REST + WebSocket. Holds no game truth of its own — it renders what the server sends and posts intents back.

**Stack:** Vite + TypeScript + KAPLAY (MIT).

**Depends on:** `@village/core` (types + appearance data only).
