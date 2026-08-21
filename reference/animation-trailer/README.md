# Animation trailer — the visual bible

A 15s animated trailer for Skill Village, built as a Claude Design canvas in a parallel session (`tamagotchi-monster-design`) and exported 2026-08-21. **This is the reference implementation of the game's look and motion.** When the web client's art or animation is ambiguous, this file is the answer.

- **`skill-village-scene.jsx`** — the scene. Creature grids, palettes, motion functions, props, typography. Read this before writing the sprite or animation layer.
- **`Skill Village Animation.dc.html`** — canvas wrapper; defines the four scenes (Terminal 3.2s → Bloom 3s → Village 6s → Title 2.8s).
- **`preview.webp`** — thumbnail.

The Claude Design runtime files (`animations-v3.jsx`, `support.js`, `tweaks-panel.jsx`) are **not** copied here — they are that tool's framework, not ours, and the game reimplements this vocabulary in KAPLAY. They remain in the original zip if needed.

## What to take from it

**Creatures are pixel grids, not image assets.** A body is an array of strings; each character is a color key (`X` body, `D` feet, `W` eye white, `K` mouth, `A` light accent, `.` transparent). Three hex colors per creature (`hue`, `dark`, `lite`) plus two shared inks. Eyes are overlaid separately at anchor coordinates so they can blink and track. This is why creature art needs no downloads, no licensing, and no part-tagging pass — see §4 of the spec.

**Motion is the personality.** Idle breathing is volume-preserving squash/stretch; hops anticipate, arc, and recover; shadows shrink with height; every creature carries a phase offset so the village never moves in lockstep. The exact constants are in the file and are worth copying rather than reinventing.

**The launch story** the trailer tells — `ls skills/ agents/`, then `npx skill-village`, and the filenames fly out of the terminal to become creatures — is the product pitch in fifteen seconds. Tagline: "your skills folder… is alive."
