# The Village Wakes — the game-experience trailer

A ~48s animated tour of Skill Village as it plays **today** (post-M5), built
2026-08-31. One self-contained HTML file, no framework, no build: a single
canvas renderer driven by a scene-cue clock, with a scrubber bar (play/pause,
click to seek, space / arrow keys).

Eight scenes:

1. **the terminal** — `ls skills/ projects/`, then `npx skill-village`
2. **the bloom** — filenames fly out of the terminal and land as genies
3. **village day** — breath, blinks, hops, a roaming flyer, a chat bubble
4. **the work signal** — an editing chip slides in; Sparky's genie swells
   to presence 1.32 with an accent aura (worked today stands the big genie)
5. **a project moves in** — M5: scaffold + striped barrier, house pop with
   confetti, nameplate stamps onto the house, Villy (`skill-village/`) arrives
6. **weather** — dusk, one swelling cloud mass, rain, umbrellas pop,
   both flyers ground themselves
7. **nightfall** — night tint with lights drawn above it: lamp windows,
   fireflies, stars, staggered zzz. Scout keeps flying (agents work at night)
8. **title** — wordmark, "your skills folder is alive", village.fenley.ai —
   then a crossfade loops back to the terminal

Everything is taken from the game's own sources, not invented:

- **Palette**: 1a Meadow Blue verbatim, including its four sky frames
  (`packages/web/src/theme/palettes.ts`)
- **Grids and motion**: the trailer bible (`reference/animation-trailer/`) —
  volume-preserving breath, per-cast phase offsets, the anticipate/arc/recover
  hop, shadow squash, blink cadence, wing flap
- **Staging rules**: contact shadows under everything, architecture never
  moves, the path blends, boxes hug their text, clouds are one filled mass

## Run it

```bash
npx --yes http-server reference/fable-trailer -p 8281 -c-1
```

Or use the `fable-trailer` entry in `.claude/launch.json`. Needs internet on
first load for the two Google fonts (Pixelify Sans, IBM Plex Mono); everything
else is inline. The clock runs on requestAnimationFrame, so the tab must be
visible. `window.trailer.seek(t)` scrubs from the console for QA.
