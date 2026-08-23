# Swarm Village trailer — the showroom's visual bible

A ~33s animated trailer for the **Swarm Showroom** (monetization S1), built as a Claude
Design project ("Swarm Village Animation Trailer") and imported 2026-08-23. **This is the
approved mockup generation the S1 spec defers to** (`docs/superpowers/specs/2026-08-23-swarm-showroom-design.md` §5):
when the spectator village's art, staging, or motion is ambiguous, this scene file is the answer.

Seven scenes: Night → Hatch → Dawn → Showroom → Auction → Sold → Title.

- **`swarm-village-scene.jsx`** — the scene. Day/night palette cycle, grounded staging,
  creature motion, the hatch and sold ceremonies, all signage copy. Read this before
  writing the spectator scene (S1 plan, Task 12).
- **`Swarm Village Animation.dc.html`** — wrapper; defines the scene list and playback.
- **`animations-v3.jsx` / `tweaks-panel.jsx` / `support.js`** — the Claude Design
  runtime, vendored **this time** (unlike `reference/animation-trailer/`) so the trailer
  actually plays locally. They are that tool's framework, not ours — the game
  reimplements the scene's vocabulary in KAPLAY and never imports these.

## Run it

```bash
npx --yes http-server reference/swarm-village-trailer -p 8264 -c-1
```

Then open http://localhost:8264/Swarm%20Village%20Animation.dc.html (or use the
`swarm-trailer` entry in `.claude/launch.json`). Needs internet on first load:
`support.js` pulls React/Babel from unpkg (SRI-pinned) and the two fonts from
Google Fonts. The clock runs on requestAnimationFrame, so the tab must be visible.

## What to take from it (S1 Task 12)

- **The sky cycle**: four flat-band palettes (`PAL` night/dawn/day/dusk) blended by
  eased stops — no gradients, the night is a single tint layer with lights drawn above
  it. This slots straight into the game's time-of-day subsystem when it lands.
- **Grounded staging**: contact shadows under every standing thing (creatures, eggs,
  houses, fence posts, trees, sign posts, the pedestal), houses with base-shade rows and
  a dirt line at the doorstep, a horizon band (`HOR`) the treeline sits into. Nothing floats.
- **Selective animation constants**: volume-preserving breath (`sy` squash with per-cast
  phase `ph` and period `per`), blink cadence, pupil look-drift, the anticipate/arc/recover
  `hopPose`, egg wobble in bursts vs the shy egg's shiver, chimney smoke, fireflies,
  one butterfly. Architecture never moves; nothing shares a phase.
- **The hatch ceremony**: rock bursts → stepped cracks (three stages from 1.4s) → shell
  split at 2.1s → pop-in with overshoot at 2.15s → confetti in the eight hues → sign
  stamp at 2.85s. Matches the S1 plan's timeline; copy: "hatched at 3:12am · run 4 was the one".
- **The sold ceremony** (S3 material): the rare floats up into the night sky, sways,
  fades among the stars; the ADOPTED plaque stamps onto the empty pedestal.
- **The pitch, in captions**: "the lights are out. the swarm is not." · "commons live
  here forever — proof the machine ships" · "one buyer takes the repo, the live app,
  and the creature" · wordmark + `village.fenley.ai`.
