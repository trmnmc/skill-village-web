# Sound Engine — Design

**Date:** 2026-08-23
**Status:** approved in brainstorm, section by section; this document is the record
**Inputs:** an A/B listening demo (two aesthetics synthesized live in Web Audio,
auditioned by the user in the browser pane; the demo file was throwaway, its
patch recipes are recorded in §10) and the M4-complete codebase.
**Approach:** A — pure sound-director with a thin Web Audio player (approved
over a Tone.js-backed engine).

## 1. Decisions taken in brainstorm

- **Scope:** the full soundscape — creature voices, body/interaction SFX, an
  ambient village bed, and adaptive music.
- **Fully procedural.** Every sound is synthesized in the Web Audio API at
  runtime. No audio files anywhere, ever — the audio mirror of "creatures are
  pixel grids, not image assets." Zero licensing, zero download weight; a
  creature's voice is a handful of numbers, diffable in a PR.
- **Aesthetic: the Animal Crossing hybrid.** Creature *voices* are warm
  chiptune-organic (triangle cores, soft attacks, gentle vibrato — cute,
  unmistakably characters). Body sounds, ambience, and music are lo-fi
  naturalistic (wind, songbirds, cricket fields, a warm pad with vinyl
  crackle — a believable world). Chosen by ear from the A/B demo: "1 for
  voices, 3 for body, ambience and music."
- **Wire into everything live now:** chat babble synced to the real M4 speech
  bubbles, thought-bubble sounds, hop/land, sleep, panel/UI sounds,
  connection stings, village events.
- **Ambience is clock-aware from day one**, reading the local clock on the
  same daily skeleton as the approved time-of-day palettes spec
  (`2026-08-23-time-of-day-palettes-design.md`). When that arc builds its
  theme store, `soundscape.ts` swaps its clock source in one place and
  gains weather modulation for free.
- **No new dependencies.** Raw Web Audio; the demo proved the library isn't
  needed.

## 2. Architecture

New directory `packages/web/src/sound/`, under the house rule — everything
that decides is a pure function; only the last inch rings:

| File | Role | Pure? |
|---|---|---|
| `voice.ts` | creature id → `VoiceParams` (FNV-1a hash, like `phaseFor` but a different basis so voice ≠ phase) | ✅ |
| `soundscape.ts` | `(Date) → AmbienceMix` — bird density, cricket level, wind band, music daypart | ✅ |
| `music.ts` | `(daySeed, daypart, barIndex) → NoteEvent[]` — the generative sequencer emits notes as data | ✅ |
| `director.ts` | `(GameSound event, VoiceParams, AmbienceMix) → SoundCommand[]` — plain command objects | ✅ |
| `player.ts` | the last inch: owns the `AudioContext`, executes commands, runs the ambience loops | thin |
| `settings.ts` | volume/mute per bus ↔ `localStorage` | ✅ logic, thin I/O |

A `SoundCommand` is a plain object, e.g. `{patch: 'chirp', freq, dur, gain,
pan, bus}`. The director never touches an AudioNode; the player never makes a
decision.

- **Bus graph:** `master → {voices, sfx, ambience, music}` — four `GainNode`s,
  individually mutable.
- **Panning:** position-bearing commands carry a pan derived from creature x
  vs camera center, through a `StereoPannerNode`. A hop off-screen-left
  sounds off-left and quiet.
- **Autoplay:** the context is created lazily on the first pointer/key
  gesture (the browser requires one anyway). Until then, commands are
  dropped silently — never queued; a village that "catches up" on unlock
  would be a burst of noise.
- **Hidden tab:** ambience and music ramp to zero over ~1s on
  `visibilitychange` and resume on return.
- **`@village/core` is untouched.** The scene emits events; the sound system
  consumes them — the same one-way relationship the chat panel has.

## 3. Creature voices (the chip half)

`VoiceParams` — eight numbers hashed from the creature id, deterministic on
any machine:

| Param | Range | Meaning |
|---|---|---|
| `basePitch` | 380–950 Hz | the register. Hashed, then shifted by body: small bodies (`pip`) skew high, `mound`/`boxy` low — the voice matches the silhouette |
| `contour` | rise / fall / arch | the shape of a syllable's pitch bend |
| `syllableRate` | 7–11 /s | fast = chattery, slow = drawly |
| `jitter` | 0–0.2 | per-syllable pitch wobble |
| `vibratoDepth` | 0–9 Hz | the warble |
| `timbre` | triangle / triangle+sine mix | tonal identity |
| `phraseLen` | 2–4 syllables | length of a free-standing chirp |
| `sparkle` | 0–1 | chance of a decorative octave-up grace note |

Agents ride ~15% higher and slightly breathier (a touch of noise mix) — the
airborne tell, audible as well as visible.

Voice surfaces:

- **Speak** (chat reply, canned or LLM): babble synced to the bubble — a
  syllable train at `syllableRate` for `min(text.length × 28ms, 2.2s)`,
  starting on the bubble's `easeOutBack` pop-in. Not a per-character
  typewriter (bubbles show text all at once); it is talking *over* the
  bubble. Canned lines babble slightly quieter — the "(canned)" tag, audible.
- **Thinking:** one soft low double-blip when the thought bubble appears;
  silence while it holds. A ticking loop would make waits louder, and
  first-persona waits are long.
- **Greeting chirp:** the creature's `phraseLen` signature phrase when the
  player opens chat with it — its "name," always the same notes.
- **Sleep:** the naturalistic breath swell (§10), pitched by `basePitch`.
  Body sounds belong to the world aesthetic even when the sleeper is a chip
  singer.
- **Idle chirps:** rare chirps from on-screen happy creatures (mood > 75),
  Poisson-spaced ~120s per creature, capped village-wide at one per 25s
  (retuned from 45s/8s after the first playtest: with a crowd on screen some
  timer was always pending, so the 8s gap fired like a metronome) —
  seventy villagers must not become an aviary.

## 4. Body & interaction SFX (the naturalistic half)

| Sound | Design | Fires where |
|---|---|---|
| Hop land | low thump (120→52 Hz) + grass brush (band-passed noise) | the exactly-once landing point that fires the puff (`packages/web/src/scene/creature.ts`, the `lastLanding` guard); a landing that draws no puff also makes no sound |
| Takeoff / touch-down | soft whoosh up / the land thump, quieter | behaviour transitions `fly: null ↔ 'roam'` in `setCreature` |
| Wingbeats | **none** — a continuous flutter per agent is drone, not life | — |
| Sleep start | one breath swell (§3) | behaviour transition into `asleep` |
| Bubble pop-in / out | tiny soft pop / softer reverse | `showBubble` / bubble expiry |
| Chat open / close / send | woody tap (panel), paper tick (send) | `chat/panel.ts` open/close/submit |
| Moved-in | small arrival chime + that creature's greeting chirp | the client's new-creature spawn path |
| Stage-changed | rising three-note figure | `setCreature` observing a stage change |
| Server offline | one low soft tone, not alarming | `onStatus` transition in `main.ts` |
| Reconnected | gentle two-note up | same |
| Camera pan | **none** — the player moving is not world sound | — |

Global director rules:

- **Cooldowns per sound type.** A burst of server updates cannot
  machine-gun arrival chimes; they queue at ≥600ms spacing.
- **The off-screen rule.** Position-bearing sounds ride their pan and
  attenuate to silence beyond ~1.4 screen-widths — the audio version of "no
  landing puff for a landing nobody saw."

## 5. Ambience & music (clock-aware)

`soundscape.ts` maps the local clock onto the palette spec's daily skeleton
and, like the light, **lerps — never steps**:

| Daypart (weekday anchors) | Wind | Birds | Crickets | Music |
|---|---|---|---|---|
| Night (21:00–05:30) | low band, quiet | 0 | full field (dual-cricket bed) | none — crickets are the night music |
| Dawn (06:10–07:20) | rising | chorus peak | fading out | none — the dawn chorus is the show |
| Day plateau (08:30–16:45) | medium band | sparse songbirds | 0 | sparse lo-fi |
| Dusk (17:45–19:20) | warm/low | last few calls | fading in | sparse lo-fi, warmer |

Every value is a keyframe blend on the clock: 19:00 genuinely sounds
*between* dusk and night. Midnight can cross parameter sets, the same
required-and-tested case as the palette spec's midnight palette-cross.

**Theme-store handoff:** when the palettes arc builds its theme store,
`soundscape.ts` swaps its `(Date)` input for the store's resolved frame in
one place. Weather then modulates for free — rain ducks birds, wind rises
with the storm. Until then, weather sounds are **out of scope**.

**Music** (`music.ts`, decided entirely as data): the lo-fi pad — detuned
saws, heavy lowpass, vinyl crackle — plus an occasional music-box note from
the chip world (~1 note/6s): the one deliberate aesthetic crossover, so the
score belongs to both halves. A **day-seeded** progression: the date hash
picks a 4-chord loop from a small curated set and a pentatonic pool for
melody notes — each day has its song; weekends inherit the palette spec's
ISO-week seed so a Berry Dusk Saturday can carry its own key. **Duty
cycle:** ~3-minute passages with ~2-minute rests. Ambience is the constant;
music is a visitor. A village left open all day must never feel like a loop.

## 6. Controls & persistence

- One speaker button in the existing HUD strip: click toggles master mute;
  hover (click-hold on touch) reveals a popover with the four bus sliders.
- All five values persist in `localStorage` (`settings.ts`). Default: sound
  on, master 70%, music slightly lower. After that, what you set is what you
  get.
- First gesture: the village opens silent (browser rule); the speaker icon
  shows a small dot until unlocked. The first click — pan, creature,
  anything — creates the context and fades ambience in over ~2s. No
  "enable sound?" dialog.

## 7. Edge cases

- **Concurrency cap:** at most 8 concurrent one-shot voices; excess drops
  lowest-priority first (idle chirps first, chat babble never). Ambience is
  ~6 persistent nodes; CPU cost is negligible.
- **Muted bus ≠ dead code path:** the director still decides; the player
  multiplies by zero. Unmuting mid-hop works.
- **Clock jumps** (laptop wake): `soundscape.ts` is a pure function of now —
  simply correct on the next tick, nothing to resync.

## 8. Testing

Mirrors the repo's pattern: every deciding function DOM-free and unit-tested.

- `voice.test.ts` — determinism (fixed vectors), all params in range for
  arbitrary ids (property test), body-register shift, agent lift.
- `soundscape.test.ts` — keyframe blending including the midnight cross,
  monotone fades, plateau holds.
- `music.test.ts` — same seed → same passage; notes always in the day's
  scale; duty cycle honored.
- `director.test.ts` — cooldown queueing, off-screen attenuation, priority
  drop order, silence before unlock.
- `boundaries.test.ts` gains a rule: nothing under `sound/` except
  `player.ts` may reference `AudioContext` or the DOM.
- **Dev tuning harness:** a `?soundcheck` query flag adds a small overlay of
  trigger buttons over the real engine in the running game. Dev-only, ~40
  lines, replaces the throwaway demo page.

## 9. Out of scope

- Weather sounds (arrive with the theme store, §5).
- Wingbeat loops and camera-pan sounds (rejected as drone, §4).
- Per-character typewriter speech (bubbles don't type, §3).
- Tone.js or any audio dependency (§1).
- Recording/exporting audio; volume ducking per-creature; positional audio
  beyond stereo pan.

## 10. Starting synthesis recipes (from the auditioned demo)

The A/B demo's patches are the tuning starting points. Constants the user
approved by ear:

- **Chip chirp (voices):** triangle osc through a 2.8kHz lowpass; per
  syllable: attack 12ms to ~0.16 gain, exponential decay to silence by
  140ms; pitch bends up ~12–37% over 50ms then settles to 92%; vibrato
  6.2Hz. Syllables 100–150ms apart.
- **Thump (hop/land):** sine 120→52 Hz exponential over 120ms, gain 0.22
  decaying exponentially.
- **Grass brush:** white noise through bandpass 420Hz Q0.8, 90ms
  exponential decay, gain 0.06.
- **Breath swell (sleep):** noise through bandpass 480Hz Q1.2, 550ms linear
  rise to 0.05, 750ms fall; two swells 1.5s apart.
- **Breeze:** looped noise buffer → lowpass (day ~900Hz / night ~260Hz,
  Q0.5) → gain ~0.02–0.045 with a 0.07–0.13Hz LFO wobbling ±~40%.
- **Songbird:** sine syllables, 2.1–3.7kHz, exponential sweeps up ×1.35–1.65
  or down ×0.7, 60–160ms each, gain 0.05; 2–5 syllables per song; songs
  2.5–7.5s apart.
- **Cricket field:** two voices — sine 4.25kHz AM'd at 38Hz gated ~340ms
  on/~240ms off at gain 0.022, plus 3.85kHz/31Hz/~420on/~380off at 0.014.
- **Lo-fi pad:** per chord tone, two saws detuned ±6 cents → lowpass 700Hz
  Q0.4; attack 2.5s to 0.016, hold to 5s, release by 8s; chords ~7.5s
  apart. Vinyl crackle: noise ticks through highpass 2.5kHz, 15ms decay,
  gain 0.012, every 60–380ms.
- **Music-box note (crossover):** sine at f plus sine at 4f (12% gain),
  sharp attack, exponential decay over 1.4s, gain 0.055; drops 4–9s apart
  while music plays.
- **Thinking blip:** two syllables of the creature's own voice at
  `basePitch × 0.5`, 70ms apart, gain 0.06.
- **Bubble pop:** sine 520→880 Hz over 50ms, gain 0.05, dead by 70ms.
- **Chat open:** the thump patch at 320→180 Hz, 60ms, gain 0.1 (woody tap).
- **Send tick:** noise through highpass 1.8kHz, 30ms decay, gain 0.05.
- **Arrival chime:** music-box E5 then B5 120ms apart, then the newcomer's
  greeting chirp ~450ms later.
- **Stage-up:** music-box C5–E5–G5, 140ms apart.
- **Offline:** sine 160 Hz, 150ms rise to 0.07, 900ms exponential fall.
- **Reconnect:** sine G4 then D5, 110ms apart, soft 300ms tails.

All gains are pre-master (master default 0.7) and are starting values, not
contracts — the `?soundcheck` harness exists to retune them in place.
