# @village/web

The browser view of the village: a KAPLAY scene that draws whatever `@village/server` sends and renders nothing else. It holds no game truth of its own.

## What's here

- **`theme.ts`** — the village's fixed palette and pixel unit `U`. Creature hues are not here; those come from each creature's own palette, generated in core.
- **`render/`** — pure functions that turn a `CreatureAppearance` into pixels: `roles.ts` maps grid characters to colours, `compose.ts` builds the pixel grid (body, crown, eyes, wing posture), `bake.ts` paints that grid into a raw `Uint8ClampedArray`, and `label.ts` derives the nameplate text and filename label (`skill/` vs `agent.md`) from a creature.
- **`motion/`** — the animation vocabulary from spec §4.2: `motion.ts` has the pure per-frame math (breathing, blinking, gaze, hop arcs with a landing timestamp, wing flap, shadow squash, the per-creature phase offset that keeps nobody moving in lockstep), and `behaviour.ts` turns a creature's stats into motion flags (hopper, asleep, flying, scruffy) without the renderer ever reading a stat directly.
- **`layout/zones.ts`** — the four zones along the village strip (Homes, Adoption Center, Hatchery, Notice board) and stable creature placement within them.
- **`net/protocol.ts`** — the wire types shared with the server's REST/WebSocket payloads. `net/client.ts` (not re-exported — see below) is the actual socket connection used by `main.ts`.
- **`scene/`** — the KAPLAY layer: `village.ts` boots the game, draws the static scenery, and reconciles the server's view into live creature actors; `creature.ts` bakes and spawns one creature's sprite, eyes, nameplate, sleep glyphs and landing puffs, and animates it every frame.
- **`main.ts`** — the entry point: starts the scene and wires the socket to it. Nothing outside `main.ts` (and the things it calls) may import from `scene/`.

## Testing rule: DOM-free

Everything under `render/`, `motion/`, `layout/`, and `net/` is pure — no KAPLAY, no `document`, no canvas — which is what makes it unit-testable without a browser. `scene/` is the one place that touches KAPLAY and the DOM; it has no unit tests by design and isn't meant to gain any. `boundaries.test.ts` enforces the import rules below by walking the real source tree.

## Import rules

- Import creature/appearance types from **`@village/core/visual`**, never the bare `@village/core` barrel. The barrel also re-exports modules that need Node's `crypto` and filesystem APIs, which throw the moment a browser evaluates them.
- **Never import `@village/server`.** This package renders what the server sends over REST + WebSocket and posts intents back; it has no game truth of its own.
- No `Math.random()` — the village's look and motion are deterministic in (creature id, time).

## Stack

Vite + TypeScript + KAPLAY (MIT). Type: Pixelify Sans (display) + IBM Plex Mono (filenames, HUD). `index.html` loads both from Google Fonts.

**Visual reference:** `reference/animation-trailer/skill-village-scene.jsx` is the bible for how all of this should look and move. Copy its constants; they are tuned.

## Not yet here

Chat, personality cards and LLM-written nicknames (M4); the adoption catalog and installing files (M5); hatching (M6); breeding and training (M7); the Claude Code hook endpoint (M8); the autonomous scheduler and notice board contents (M9); the first-run cold open of spec §4.3 (M11). The Adoption Center, Hatchery and Notice Board exist today as signposted scenery — real places with nothing in them yet.
