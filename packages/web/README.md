# @village/web

The browser game — the full-fidelity view of the village.

**Owns:**

- **KAPLAY scene** — scrollable pixel-art village with the four zones (Homes, Adoption Center, Hatchery, Notice board), plus the props: houses, trees, grass tufts, and per-creature signs, all drawn as flat rectangles.
- **Grid renderer** — turns core's `CreatureAppearance` into a drawn creature: paint the archetype grid one pixel per character through the creature's three-color map, then overlay eyes at the anchor coordinates so they can blink and track.
- **Motion** — the animation vocabulary from §4.2 of the spec: idle breathing, blinks, gaze, hops with anticipation and recovery, height-linked shadows, wing flap and antenna sway, puff bursts, floating sleep glyphs, and pop-in speech bubbles. Every creature carries a phase offset so nothing moves in lockstep.
- **Panels** — chat, hatch interview, draft/diff review with Approve/Edit/Ask-for-changes, adoption browser, settings (budgets, hooks consent), HUD with the token meter.
- **Cold open** — the first-run sequence (§4.3): terminal types, blooms into the village, filenames fly out and land as creature signs.

**Talks to:** `@village/server` over REST + WebSocket. Holds no game truth of its own — it renders what the server sends and posts intents back.

**Stack:** Vite + TypeScript + KAPLAY (MIT). Type: Pixelify Sans + IBM Plex Mono.

**Depends on:** `@village/core` (types + appearance data only).

**Visual reference:** `reference/animation-trailer/skill-village-scene.jsx` is the bible for how all of this should look and move. Copy its constants; they are tuned.
