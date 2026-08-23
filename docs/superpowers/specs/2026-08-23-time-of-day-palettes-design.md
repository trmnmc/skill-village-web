# Time-of-Day Palettes & Weather — Design

**Date:** 2026-08-23
**Status:** approved in brainstorm, section by section; this document is the record
**Inputs:** the user's Claude Design project "Village Palette Explorations"
(`96ec9409-1223-4d59-80c9-d28d7559848b`) — `Village Palette Explorations.dc.html`
+ `village-scene.js`, which together define six palettes, the four-frame sky
cycle, the tint math, the night ambience, and a nine-kind weather engine with
a live render loop. Those files are the visual source of truth; this spec
maps them onto the game. Plus the user's `github.com/trmnmc/moon` (Meeus
moon-phase port), vendored for the real lunar cycle (§5).
**Approach:** A — live theme store with continuous keyframe blending (approved
over stepped phases and a tint overlay).

## 1. Decisions taken in brainstorm

- Time of day always follows the player's local clock; light blends
  continuously between keyframes (never steps).
- Weekdays weave Meadow Blue (1a) + Golden Hour (1b) into an 8-keyframe day
  ordered by the real daylight color-temperature curve — warm sunrise,
  **bluest at midday** (the user's correction: blue by 8:30), orange peak at
  sunset, violet blue-hour, deep night.
- Weekends wear a special palette and **change every weekend**: the ISO week
  picks Saturday's and Sunday's palettes from {Spring Tonic 1c, Toasted Oat
  1d, Berry Dusk 1e, Marigold 1f}, distinct from each other, never repeating
  the previous Saturday.
- Roughly one weekday per week is a seeded **surprise day** in a palette from
  the same pool.
- The UI chrome (chat panel, HUD, banner) follows the palette and dims after
  dusk — one coherent world ("ui follows along").
- Weather ships this arc (the user designed the engine); **temperature stays
  a future layer** with an open slot above weather.
- Weather modes: **Off (default) / Pick (player chooses the sky) / Journey
  (curated palette·time·weather tour) / Real (location-accurate, opt-in)**.
  Random seeded weather spells were considered and replaced by Pick +
  Journey at the user's direction.

## 2. The daily timeline

Keyframes are (palette, frame) pairs placed on the local clock; every token
lerps between neighbors (`mix()`, the exploration's exact math). Weekday
weave, Kelvin-annotated:

| Anchor | Keyframe | ≈ CCT | Light |
|---|---|---|---|
| 00:00–05:30 | 1a night (hold) | — | deep night |
| 06:10 | 1a dawn | ~3000K | civil twilight |
| 06:45 | 1b dawn | ~2500K | sunrise gold |
| 07:20 | 1b day | ~4300K | brief warm-white morning |
| 08:30–16:45 | 1a day (hold) | 5500–6500K | blue daylight plateau |
| 17:45 | 1a dusk | ~3500K | golden hour |
| 18:45 | 1b dusk | ~2500K | sunset peak |
| 19:20 | 1b night | blue hour | violet evening |
| 21:00 → | 1a night | — | astronomical darkness |

Weekend/surprise days place that single palette's four frames on the same
skeleton: dawn @06:45, day plateau 08:30–16:45, dusk @18:45, night from
21:00 — same plateau shape, fewer keyframes.

Sunrise/sunset anchors are constants (06:45 / 18:45) in Simulated mode; in
Real mode they snap to the true local sunrise/sunset from the weather feed
(§6), shifting the whole table proportionally (shoulder offsets are relative
to the two solar anchors, plateau bounds derived from them).

Midnight can cross palettes (Sunday night → Monday's weave): the lerp between
the last keyframe of one day and the first of the next blends palettes too —
this is a required, tested case.

## 3. The week

`schedule.ts` resolves `(date) → dayPlan` as a layer stack, each layer a pure
function `(date, planSoFar) → plan`:

1. **Base:** the weekday weave.
2. **Weekend:** Sat/Sun replaced by ISO-week-seeded picks from the four
   specials; Saturday ≠ Sunday; Saturday ≠ last Saturday.
3. **Surprise:** a date-seeded hash picks ~one weekday per week and a palette
   from the pool.
4. **Weather:** §5–6. In Off/Pick/Real modes it modifies tokens and adds a
   weather state without replacing the palette; Journey mode supersedes the
   whole stack (it drives palette, time, and weather together).
5. **Temperature:** empty slot, same function shape, reserved for the user's
   future layer.

All seeding is deterministic from the date (no stored state, stable across
reloads, self-consistent all day).

## 4. Architecture

New subsystem `packages/web/src/theme/`:

- **`palettes.ts`** — the six palettes verbatim from the exploration's `DIRS`
  (ink, cream, bubble, wood, accent, foliage pair, ground pair, houseA/B,
  four 3-band skies) plus `mix()`/`lite()`.
- **`timeline.ts`** — pure: `(date, dayPlan) → keyframes[]` per §2.
- **`schedule.ts`** — pure: `(date) → dayPlan` per §3.
- **`weather/`** — §5–6: spell seeding (pure), WMO mapping (pure), fetcher
  behind an interface, mode setting.
- **`store.ts`** — the one stateful piece. Once a minute, on visibility
  return, and on weather updates it resolves now → `ResolvedTheme`: every
  token post-pipeline, plus `sceneryTintCol/K`, `creatureTintCol/K`, phase
  flags (`isNight`, `isDusk`, `lanternsOn`), sun/moon arc positions, and
  `weather` (kind, ramp 0–1, `overcast`).

**Pipeline order per token:** palette lerp → weather graying (the engine's
`GRAYS` tone/strength table, ramped by spell intensity; snow's ground swap
and storm's window-glow flag ride here) → time tint (`sc()` scenery mix, 55%
max at night; `cc()` creatures, 28% max — the exploration's legibility rule,
preserved exactly).

**Scene outlet:** `THEME` (frozen const in `theme.ts`) is replaced by the
store's current value. Scenery objects are tagged with token names at
creation; one subscriber updates tagged objects' colors on publish. Creatures
keep fixed hues and receive only the `cc()` tint.

**Chrome outlet:** the store writes CSS variables (`--sv-cream`, `--sv-ink`,
`--sv-bubble`, `--sv-accent`, `--sv-panel-bg`, …) on `:root`; panel, HUD, and
banner styles move onto them once. After dusk the chrome tokens cross to the
palette's night side so the UI dims with the village.

## 5. Ambience + weather rendering

Ported from the exploration painter into the KAPLAY scene:

- **Phase-gated objects** (created once, toggled by store flags): sun and
  moon traveling real arcs between the solar anchors; stars fading in
  through blue hour (7 dusk → 24 night, deterministic positions) with slow
  twinkle; a shooting star every few minutes at night; warm windows + lantern
  glow from dusk (and during storms, per the engine); moths at the lantern;
  up to 9 drifting fireflies (4 at dusk).
- **The real moon** (from the user's `trmnmc/moon` — a Meeus
  *Astronomical Algorithms* port with true phase instants, elongation-based
  illumination, and almanac phase naming): `src/astro.js` is vendored into
  the theme subsystem (provenance comments intact) and drives the night
  sky. The moon sprite renders one of the 8 phases by `phaseName`, waxing
  side per hemisphere (northern by default; Real mode's latitude decides).
  Phase feeds the night itself: a new-moon night runs a touch darker with
  more stars and the fireflies at their brightest; a full-moon night gets a
  faint silver lift in the night tint and washes out the dimmest stars.
  Optional flourish (polish, not v1-required): a notice-board line from
  `nextFullMoon` ("full moon in 3 nights").
- **Immediate-mode weather layer** (one onDraw object, drawn behind
  creatures; only the storm flash and fog front-veil in front): rain/storm
  drops with slant + splash ticks, the storm's layered decks + shafts +
  flicker + 4.5s bolt cycle + screen flash, snow flakes with sway + ground
  swap + roof/tree caps, fog bands + veils, wind streaks, leaf flutter,
  rainbow arc from the creature hues, heat shimmer. Constants and the
  golden-ratio particle distributions carry over verbatim.
- **Creature choreography:** flyers stay grounded during rain/storm; a
  seeded ~third of creatures own umbrellas (accent canopy) and raise them in
  rain/storm; fireflies/moths obey the clear-night gating from the engine.
- `prefers-reduced-motion`: twinkle, drift, flicker, and particles freeze to
  their static-frame variants (the engine's `staticFrame` flag); nothing
  disappears.
- **Ambient volumetric-feel clouds** (design delta, approved 2026-08-23,
  supersedes the reference's day-only static clouds): fair-weather clouds
  are sky furniture at *every* phase — white by day, warm at dawn, ember at
  dusk, moonlit slate at night — so the Off-mode sky is never a void. Three
  upgrades carry the depth: (1) clusters live on three parallax layers
  (far/mid/near) that track the camera's pan by rising fractions
  (0.1/0.18/0.3) and drift at rising speeds, so panning reads the sky as
  deep; (2) each cluster shades in three tones — lit cap, body, darker
  belly — so blobs read as mass, not flat stamps; (3) rect sizes billow on
  slow incommensurate sines (the village-wander trick), bounded to a breath
  (±11%) so clusters breathe without morphing. The overcast blobs share all
  three mechanisms; fair clouds still crossfade out under `overcastRamp`.

## 6. Weather modes

Setting (gear menu, localStorage, default **Off** — clear skies until the
player opts into a mood):

- **Off:** always clear; the clock-driven palette cycle carries the day.
- **Pick:** a toggle row of the nine weathers — the player chooses the sky
  and it stays chosen (clock still drives time and palette). Persisted like
  the mode itself.
- **Journey:** a cozy premade tour, decoupled from the clock: the village
  strolls a curated loop of (palette · time · weather) waypoints, ~3 minutes
  each, every transition a seamless lerp. The loop is authored so each step
  changes mostly one axis (palette, time, or weather) — that is the
  cohesion rule, and it is what keeps a snow night from slamming into a
  heat-shimmer noon. The premade loop, "summer blue → night storm":

  1. Meadow Blue · day · clear — the summer-blue start
  2. Meadow Blue · day · wind — a breeze picks up
  3. Marigold · day · heat — high-summer shimmer
  4. Marigold · dusk · clear — golden evening
  5. Berry Dusk · dusk · leaves — autumn drifts in
  6. Toasted Oat · day · leaves — amber afternoon
  7. Toasted Oat · dusk · fog — misty evening
  8. Spring Tonic · dawn · fog — cool morning mist
  9. Spring Tonic · day · rain — spring rain
  10. Berry Dusk · day · rainbow — after the rain
  11. Berry Dusk · night · clear — starry night, fireflies
  12. Meadow Blue · night · snow — quiet winter night
  13. Golden Hour · night · rain — warm rainy night
  14. Meadow Blue · night · storm — the finale
  15. Meadow Blue · dawn · clear — the storm breaks at dawn → loop

  Waypoint position derives from wall-clock time (`(now / 3min) mod 15`), so
  the journey is stateless, reload-stable, and shared by every open tab.
- **Real:** browser geolocation (prompted only when the user picks this
  mode; denial → Off with a one-line note) + **Open-Meteo** (keyless, CORS,
  client-side): current WMO code → engine kind (drizzle/rain→rain,
  thunder→storm, snow codes→snow, fog codes→fog, overcast→cloudy, clear+hot→
  heat, high wind→wind), polled ~20 min + on focus, last reading cached; if
  stale >2h fall back to Off's clear sky. Daily sunrise/sunset from the same
  call drives §2's solar anchors. A rainbow may still follow real rain that
  ends in daylight.

Pick and Journey are the "simulated" family: no network, no permissions.
Journey overrides the clock's time-of-day and the week's palette schedule
while active (it IS the schedule); Off, Pick, and Real all stay clock-true.

## 7. Dev override (the playtest lever)

Query params pin the store: `?at=19:05&day=sat&weather=storm&palette=1e`.
Overrides beat every layer including Real mode; they exist so the user's eyes
can review any moment without waiting for the sky.

## 8. Testing

- `timeline.ts`/`schedule.ts`: frozen-date tests — anchor ordering, the 8:30
  blue crossover, plateau holds, midnight cross-palette lerp, weekend
  rotation invariants, surprise determinism, empty temperature slot
  pass-through.
- Weather: the `GRAYS` pipeline as a pure token transform; WMO→kind table;
  real/stale fallback ladder with fixture payloads; fetcher faked behind its
  interface; Pick persistence round-trip. Journey: the loop closes (last →
  first lerps cleanly), every adjacent pair changes at most one-and-a-bit
  axes (the cohesion invariant, asserted structurally), and the wall-clock
  position function is stateless and reload-stable.
- Moon: the vendored `astro.js` is cross-checked against fixture vectors
  taken from the upstream repo's own test suite (same dates → same
  phaseName/illumination), so drift from the source is caught; the
  night-darkness modulation is a pure function of illumination.
- Store: fake clock ticks publish lerped tokens; visibility resume; CSS
  variable output as a pure token→map function with a thin DOM applier.
- Renderer: tag-updater logic unit-tested; visuals gated by the user's eyes
  via §7 (the standing playtest rule).

## 9. Non-goals (this arc)

- No temperature layer (slot reserved), no seasonal daylight math in
  Simulated mode (fixed anchors), no server involvement anywhere, no
  geolocation unless the user picks Real, no settings beyond the weather
  mode, no changes to creature DNA hues (fixed-hue rule is load-bearing).
