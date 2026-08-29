# Project-Into-Robot Ceremony + Full Mobile Pass — Design

**Date:** 2026-08-29
**Status:** draft for user review
**Inputs:** brainstorm this date (all five sections approved one at a time;
ceremony amended to live presets after two mockup rounds; weather-thinning
lever struck by user). GitHub scout ran twice: gesture libraries (verdict:
build on Pointer Events — every candidate is dormant, wrong-model, or heavier
than the fix) and game-juice libraries (verdict: no JS/canvas juice library
exists; the technique vocabulary — squash & stretch, anticipation, hit-stop,
scale punch, flash, trauma shake — is the deliverable, composed on KAPLAY
primitives).
**Deadline context:** the M5StackChan robot arrives ~2026-08-30; everything
here targets ready-today. Hardware setup itself is Task 13 in the
robot-personality repo, not this spec.

## 1. Concept

The drop-into-robot moment becomes the game's hero ceremony, the whole game
becomes playable on a phone, and the web side is provably ready for the
robot's arrival. Three workstreams, one deadline:

1. **Ceremony** — dropping a creature (villager or genie-framed project) on
   the robot-house plays a suck-in beat instead of today's silent teleport.
2. **Mobile** — touch input works (it is broken outright today), lag is
   profiled and fixed with invisible levers, and the viewport/HUD respect
   phone realities.
3. **Readiness** — deployed to village.fenley.ai, the robot's brain endpoint
   dry-run proven with a project resident, and a have-on-hand hardware
   checklist written.

What already works and is NOT redone: dragging (tracker, slop, click-vs-drag),
the held visual (dangle spring, panic flap, startled pupils, genie presence
scaling), the robot-house drop target and presence states, kind-agnostic
residency (`setRobotResident` accepts any creature), per-creature persona
generation. The drop mechanics ship today; this spec adds the spectacle and
the phone.

## 2. Ceremony — two live presets, judged in-game

Mockups failed twice (standing lesson: placeholder creatures are unjudgeable;
the ground texture was picked from live presets). The ceremony ships at two
intensities behind a URL override, same pattern as `?ground=`:

- **`?ceremony=a` — calm.** Wind-up (~0.12s: body tips back, stretches
  slightly away, label fades) → pull (~0.30s: arcs into the face-screen,
  squashing to a streak; the dangle spring keeps running) → land (~0.15s:
  screen flash, house rocks ~3° on a decaying spring, landing puff at the
  door, chime through the sound engine).
- **`?ceremony=b` — punch.** Preset `a` plus the two scouted impact
  techniques: **hit-stop** (the ceremony's actors freeze 2–3 frames at the
  instant of contact) and **scale-punch** (the house squashes hard and
  settles on a spring overshoot instead of only rocking).
- **No new props in either preset.** No stars, notes, faces, hops, or
  confetti — the round-2 lesson. Fun comes from distorting bodies already on
  screen, never from adding objects.
- Default is `a` until the playtest verdict; the loser is deleted, the
  winner becomes the only code path. The override then goes away.

Mechanics under the spectacle are unchanged: `setRobotResident` fires on
release, the animation is client-side dressing over the same write. A held
creature whose sprites never baked (null `held`) degrades to today's instant
drop. **Evict** plays a half-ceremony mirror: a pop-out puff at the house as
the resident lifts. **Swap** = old resident's pop-out at the porch as the
new one's suck-in lands.

Projects keep their `presence` scale through the whole flight — a genie's
streak is simply bigger drama through the same code path. A project resident
stands at the porch alone (aura dropped, not relocated) — existing, intended
behavior; the ceremony does not touch seating.

New code: `packages/web/src/scene/ceremony.ts` — a pure state machine
(wind-up → pull → land) plus curve functions (position-at-t, scale-at-t,
rock-angle-at-t, hit-stop gating), all timing constants exported and tested
headless; a thin KAPLAY skin drives the held objects from it. `robotHouse.ts`
gains `flash()` / `punch()` hooks. `village.ts`'s robot-drop branch swaps
`release()` for the ceremony; every other drop path is untouched.

## 3. Touch input — Pointer Events, one path

- The six DOM `mouse*` listeners in `village.ts` become `pointer*`
  equivalents (`pointerdown` on canvas; move/up/cancel + blur on window) and
  the mouse listeners are **deleted**, not duplicated — pointer events cover
  mouse and touch in one stream and kill the synthesized-mouse double-fire.
  Only `isPrimary` pointers participate; a second finger is ignored (zoom
  stays fixed; no pinch).
- Canvas CSS: `touch-action: none`, `user-select: none`,
  `-webkit-user-select: none`.
- **Press-point picking.** Desktop grabs whatever hover chose; a finger has
  no hover. The nearest-within-radius test moves out of the update loop into
  a pure `nearestCreature()` helper used by both hover and `pointerdown`.
  Desktop behavior is unchanged by construction.
- **Immediate grab, desktop parity** (user decision): press on a creature
  starts the gesture, press on ground pans. The startle/lift visual is the
  feedback the moment the slop is crossed. The touch pick radius is the
  declared tunable: if crowd panning is miserable in playtest, tighten the
  radius (grab only near the body) — never add a long-press.
- **Slop by pointer type:** 6px mouse (unchanged), ~10px touch.
- Camera pan on touch is expected to work via KAPLAY's `touchToMouse`
  feeding `k.onMouseDown`/`k.onMouseMove`, gated on `tracker.current() ===
  null` as today. Verified in playtest, not assumed.
- `DragTracker` (`input/drag.ts`) survives verbatim.

## 4. Mobile performance — profile first, invisible levers only

- **Measure before touching anything:** a `?fps=1` HUD line (frame time,
  object count) plus one Chrome remote-profiling session on the real phone
  against the live site.
- Suspects, ranked by prior: fill rate (`pixelDensity: min(DPR, 2)` means a
  DPR-3 phone pushes 4× a desktop's pixels), alpha-heavy weather overdraw,
  75+ actors updating every frame for a 10-creature camera slice.
- **Lever 1 — density cap on coarse-pointer devices:** try 1.5 (or 1).
  Only visual risk is text sharpness; judged by screenshots before it
  ships. If text degrades, scope the cap to a viewport-width threshold.
- **Lever 2 — offscreen culling:** actors outside camera ± one screen-width
  skip `update()` and hide. The idle-chirp loop already does this math
  (`halfW + 200`); same pattern, applied to rendering.
- **The weather is untouched** (user decision). If profiling proves the
  weather dominates, that comes back as evidence with screenshots for an
  explicit decision — never a silent quality cut. Tasteful vibes stay; the
  game must read relaxing, productive, fun.
- Each lever lands as its own commit with before/after frame-time numbers
  from the phone. Whatever misses the time box is logged in the deferred
  list, not silently dropped.
- **Screenshots throughout:** every visual change gets before/after captures
  (browser pane + pixel-playtester) judged against the
  relaxing-productive-fun bar.

## 5. Viewport + HUD polish

- Viewport meta gains `viewport-fit=cover`; HUD chip and gear menu respect
  `env(safe-area-inset-*)`.
- Canvas sizing verified against `100dvh` (URL-bar collapse).
- HUD/text sizes checked on-device; boxes hug text, mono for anything read
  (standing taste rules). Remember the KAPLAY `width`-option trap when
  measuring text.

## 6. Readiness for the robot

- **Deploy:** verify first — `GET https://village.fenley.ai/api/health`.
  Live → ship today's work per `docs/village-deploy.md` (build, rsync
  `dist/`, restart, health-check creature count). Not live → the runbook
  end-to-end; the SSH-key question is the first blocker to surface.
  The phone playtest targets the public URL, so deploy and mobile verify
  each other.
- **Shim dry-run (no hardware):** set a project as resident, curl the
  OpenAI-compatible endpoint with a fixture-shaped request, expect an
  in-character reply as the project's persona; then break the LLM path and
  confirm the canned-pool fallback still answers (never mute). Exit: arrival
  day owes this repo nothing.
- **Have-on-hand hardware checklist** (details live in robot-personality
  Task 13):
  - M5Burner installed — factory-restore escape hatch before first flash.
  - Gateway startable: xiaozhi-esp32-server Docker image pulled (native
    Python fallback noted), local ASR model on disk, LLM provider pointed at
    the shim on 8262, OpenAI TTS key live, Piper fallback voices on disk.
  - OpenAI key billing confirmed.
  - PC reachable on LAN: fixed IP/hostname, firewall opening for the gateway
    port.
  - 2.4 GHz Wi-Fi credentials (ESP32-S3 has no 5 GHz).
  - USB-C data cable + serial driver.

## 7. Testing

- **CI, headless, token-free:** `ceremony.test.ts` pins the state machine,
  curves, and timing constants; `nearestCreature()` gets radius tests;
  `drag.test.ts` gains the slop-by-pointer-type case. No server changes are
  expected — residency is already kind-agnostic and tested. If the shim
  dry-run exposes a project-persona gap, it is flagged as discovered work,
  not silently patched.
- **Playtest checklist (user's eyes, real phone, public URL):** grab, carry,
  and ceremony a villager AND a project; evict; swap; `?ceremony=a` vs `b`
  verdict; pan across Homes without accidental pickups; tap opens chat;
  nothing under the notch; HUD legible; frame rate feels right. Desktop
  regression: mouse drag, trackpad tap, drag-out-of-window release.

## 8. Risks

- KAPLAY's `touchToMouse` and the new pointer listeners disagreeing about a
  gesture — mitigated by the pan gate reading the same tracker, and by the
  playtest's pan cases.
- Density cap degrading text — mitigated by screenshot judgment before
  shipping and the viewport-width scoping fallback.
- Deploy state unknown until verified — the health check is step one, and
  the SSH blocker surfaces immediately if it holds.
- One-day scope — the deferred list is the pressure valve: perf levers and
  polish items drop into it with their evidence; ceremony, touch input, and
  the dry-run do not.

## 9. Out of scope (deliberately)

Pinch zoom and any camera zoom change; long-press grab; weather thinning;
round-2 props (stars, notes, screen faces, hops); any new animation
dependency; project breeding; pocket-god minigame; away-from-home robot
access; writing anywhere under `~/.claude`.
