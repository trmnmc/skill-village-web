# Weather layer rescue — screen-space rescale, clouds, lightning redesign

Pre-merge fix wave on `claude/palette-weather-moon`, from the 2026-08-23
playtest. The user's verdicts: the storm renders badly, and lightning must be
less frequent (~30s), more detailed, more dramatic, less stroby. Root cause of
the storm defect: `packages/web/src/scene/weather-layer.ts` paints in world
space with anisotropic scale factors (`WORLD_W/480 ≈ 8.96` horizontal,
`GROUND_TOP/182 ≈ 1.99` vertical), so panel shapes smear ~4.5:1, particle
budgets tuned for a fully-visible 480px reference scene spread across a 4300px
scrollable world of which the camera shows ~a quarter, and the lightning bolt
is anchored at one world x while its flash is screen-fixed.

The sky already solves this correctly: `packages/web/src/scene/sky.ts` draws
sun/moon/stars **screen-fixed** (`k.fixed()`), positioned as fractions of
`k.width()` with the vertical range tied to the live horizon screen y
(`horizonScreenY(k)` = `k.toScreen(k.vec2(0, GROUND_TOP)).y`), which
self-corrects on window resize. This wave aligns the weather layer with that
pattern and ports the two cloud branches that were never brought over from the
reference painter.

**Spec authority:** `docs/superpowers/specs/2026-08-23-time-of-day-palettes-design.md`
(§ weather) and the vendored reference painter
`reference/palette-explorations/village-scene.js` (the visual source of
truth). Where this plan deviates from the reference (drift on clouds, the
whole lightning redesign), this plan wins — the deviations are user-directed.

## Global Constraints

- **Repo:** work ONLY in the worktree
  `C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web/.claude/worktrees/palette-weather-moon`
  (branch `claude/palette-weather-moon`). Never touch the main checkout.
- **Verification:** `npm test` (vitest) and `npm run typecheck` must both be
  green before a task is committed. The suite is 628 tests at the wave's base.
- **TDD:** every new pure function gets its tests written first. KAPLAY draw
  code is kept thin over pure, tested spec-generator/mapping functions.
- **Reference-verbatim rule:** colors, alphas, rect geometry, speeds, and
  periods come verbatim from `reference/palette-explorations/village-scene.js`
  unless this plan explicitly overrides them.
- **Reduced motion:** every animated addition respects the existing
  `prefers-reduced-motion` pattern in weather-layer.ts (`REDUCED_MOTION_T`,
  static frame, no flashes).
- **No subagents:** implementers never dispatch their own subagents or
  reviewers.
- **Commit style:** match the branch (`feat(scene): …` / `fix(scene): …`,
  imperative, no attribution lines beyond the repo's convention:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

### The coordinate contract (Tasks 1 and 3 both use it)

All weather painting moves to **screen space** on `k.fixed()` objects.
Reference space is the painter's 480×270 canvas: sky rows `[0,182)`, ground
rows `[182,270)`. Define in weather-layer.ts, as exported pure functions:

```
fx(width)              = width / 480
fy(horizonY)           = horizonY / 182
mapX(refX, width)      = refX * fx(width)
mapY(refY, horizonY, height) =
    refY <= 182 ? refY * fy(horizonY)
                : horizonY + ((refY - 182) / 88) * (height - horizonY)
```

`horizonY` is the live horizon screen y — compute per frame with the same
transform sky.ts uses: `k.toScreen(k.vec2(0, GROUND_TOP)).y`. (Export
`horizonScreenY` from sky.ts and import it, or inline the one-liner; do not
duplicate a stale copy of GROUND_TOP math.)

Three scaling classes, replacing the old SCALE_X/SCALE_Y everywhere:

1. **Confetti particles** (rain streaks, snowflakes, splash ticks, wind
   flecks, leaves, heat dashes): positions through mapX/mapY, sizes stay
   literal pixels — the same rule sky.ts stars use.
2. **Aspect-critical clusters** (storm cloud decks + rims + in-cloud flicker
   rect, the Task 2 cloud blobs, the Task 3 bolt): the cluster's ANCHOR x
   goes through mapX (or `x01 * width`); every intra-cluster x offset and
   every width/height scales by `fy(horizonY)` on BOTH axes so the shape
   keeps its chunky reference aspect. Y positions through mapY.
3. **Diffuse veils** (storm rain shafts, fog bands, fog overlay, fog front
   veil, storm ground-mist band, wind gust streaks): x and width through
   mapX / proportional to `width` (full-width veils just use `k.width()`),
   y and height through mapY endpoints (a veil from ref y 60 to the bottom
   spans `mapY(60,…)` to `height`).

Wrap/modulo arithmetic stays in reference space (periods and speeds carry
through mapX unchanged — scaling a wrapped value by a positive constant is
scaling the value and its period before wrapping).

## Task 1: Screen-space rescale of the existing weather branches

**File:** `packages/web/src/scene/weather-layer.ts` (+ its test file
`packages/web/src/scene/weather-layer.test.ts`; a one-line export change in
`sky.ts` is allowed for `horizonScreenY`).

Rebuild the draw layer on the coordinate contract above. Concretely:

- Change `behind` and `front` to `k.fixed()` objects (z values unchanged: 5
  and 10000). The existing `flash` object is already fixed; leave it.
- Delete the module-level `SCALE_X`/`SCALE_Y` constants and `groundBandY`.
  Every draw call re-derives `width = k.width()`, `height = k.height()`,
  `horizonY` per frame (cheap; sky.ts already does the transform every
  publish, this layer's onDraw may call it every frame).
- Implement and export the pure mapping functions `fx`, `fy`, `mapX`, `mapY`
  exactly as specified in the Global Constraints; TDD them first, including
  the mapY piecewise boundary: `mapY(182,h,H) === fy(h)*182 === h` and
  `mapY(270,h,H) === H`.
- `rainDrop`, `snowFlake`, `frac` keep their reference-space contracts and
  existing tests untouched; only the draw sites change how their outputs map
  to screen.
- Per-branch application:
  - **rain/storm rain + splashes:** drop positions mapX/mapY (drop refY wraps
    `% 290 - 12` and now falls naturally past the horizon into the ground
    region via mapY); streak/tick sizes literal. Splash band ref y 194..264
    goes through mapY (replacing groundBandY).
  - **storm cloud decks (far, near, rims), in-cloud flicker rect:** class-2
    clusters. Far-deck cluster anchor is `cfx`; its intra offsets (+24) and
    all rect sizes (168×20, 120×8, etc.) scale by fy. Same for the near deck
    (anchor `cnx`, offsets +8/+18, rim heights) and the flicker rect
    (96,12,84,34). Drift formulas verbatim in ref space.
  - **storm rain shafts:** class-3 veils (x/width through mapX, y 30 and
    height 150 through mapY endpoints).
  - **storm ground-mist band** (ref `0,172,480,16`): full width `k.width()`,
    y/height via mapY.
  - **the storm bolt + flash:** keep the CURRENT logic in this task (Task 3
    replaces it) but move the bolt through the class-2 rules with anchor
    `mapX(312, width)` so Task 1 leaves no world-space coordinates behind.
  - **snow:** positions mapX/mapY, sizes literal.
  - **fog (behind bands, overlay, front veil):** class-3. Bands' `fby`
    132/170/208 and the +fs*5 stack go through mapY (the 208 band lands in
    the ground region — that is correct, fog hugs the ground); band width
    500 through mapX; overlay ref `(0,60,480,210)` becomes
    `(0, mapY(60,…), k.width(), height − mapY(60,…))`; front veil ref
    `(0,150,480,120)` becomes `(0, mapY(150,…), k.width(), height − mapY(150,…))`.
  - **wind:** flecks class-1; the three gust streaks class-3 (width 70/54/60
    through mapX).
  - **leaves, heat shimmer:** class-1 particles (heat dash rows ref y
    170/157/144 through mapY; the `hxp < 480` loop maps through mapX).
  - **rainbow:** REPLACE the per-frame arc draw with a retained object.
    Build a root `k.fixed()` object at z 5 holding the arc blocks once per
    activation (rebuild if `width`/`horizonY` changed by >1px since built,
    destroy when weather leaves rainbow or at night). Geometry: center
    screen x = `width/2`, ref center y 265 and radii `170 − b*6` scale by
    `fy` on both axes (a true arc, not an ellipse); block size `4*fy`
    square, angle step `4/rr` radians in ref space (contiguous blocks, ~134
    per band × 5 bands); band colors and order verbatim
    (`HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]`); skip blocks whose y
    exceeds `height`. Root opacity `0.72 * ramp`, updated on publish.
    Extract the block-geometry generator as a pure function
    (`rainbowBlocks(width, horizonY) → {x,y,size,band}[]`) and test it:
    contiguity (neighbor gap ≤ block size), all five bands present,
    determinism.
- The umbrella logic in `update()` is untouched.
- Delete any test asserting the old SCALE_X/SCALE_Y/groundBandY behavior;
  add tests for the new mapping functions and `rainbowBlocks`.

**Definition of done:** typecheck + full suite green; no references to
`WORLD_W` remain in weather-layer.ts (`GROUND_TOP` only via the horizon
transform); every draw branch uses the three scaling classes.

## Task 2: Port the missing cloud branches

**Files:** `packages/web/src/scene/weather-layer.ts` (+ test),
`packages/web/src/theme/store.ts` (+ `store.test.ts`).

**2a. `isDawn` flag.** In store.ts, add `isDawn: boolean` to
`ResolvedTheme['flags']`, set from `dominantFrame === 'dawn'` in both the
journey and clock branches (it sits beside the existing
`isNight`/`isDusk` derivation — one line). The publish signature already
serializes `flags`, so no other change. Extend store.test.ts: at a weekday
06:20 (`?at=06:20&day=wed` equivalent via deps) `isDawn` is true and at
12:00 false.

**2b. Overcast cloud blobs** — the reference's `else if (overcast)` branch
(village-scene.js lines 296–304), for the four non-storm overcast kinds
(`cloudy`, `rain`, `snow`, `fog`). Currently `cloudy` draws NOTHING — the
sky grays with an empty sky. Verbatim geometry, five clusters in ref space:

```
(14,18,96,14) + (32,10,52,10)
(150,40,74,12)
(248,14,112,16) + (270,6,62,10)
(384,42,82,12)
```

Tone: `cloudy '#B4BABE'`, `rain '#9AA6AE'`, `snow '#C8D0D6'`,
`fog '#CFCCC0'`; at night `mix(cTone, '#1A2028', 0.5)`. Alpha `0.85 * ramp`.
Class-2 clusters (anchor = first rect's x through mapX; intra offsets and
sizes by fy). Draw them in the `cloudy`/`rain`/`snow`/`fog` branches BEFORE
the kind's precipitation so precip falls in front. (`storm` keeps its decks;
no blobs.)

**Plan-over-reference deviation — drift:** the reference's blobs are static;
a scrolling camera would pin them to the same screen spot forever. Give each
cluster a slow leftward drift in ref space: effective anchor
`((anchorX + 560 - tSec * 3) % 560) - 40` (3 ref px/s, wraps over 560).
Under reduced motion use the frozen `REDUCED_MOTION_T` clock as elsewhere.

**2c. Fair-weather clouds** — the reference's `else if (time==='day'||dawn)`
branch (lines 305–309). Two clusters, verbatim:

```
always:      (70,42,40,10) + (80,34,24,8)
day only:    (270,66,34,9) + (278,59,20,7)
```

Color `#FFF3E0` when `flags.isDawn`, else `#FFFFFF`; alpha 0.75 (NOT
ramp-scaled — these are sky furniture, present on clear days). Gate:
`!flags.overcast && !flags.isNight && !flags.isDusk` — this includes
`clear` and every non-overcast weather kind (wind, leaves, heat, rainbow),
matching the reference's else-chain. The "day only" second cluster draws
when `!flags.isDawn`. Same class-2 scaling and the same drift formula as 2b
but at 1.5 ref px/s.

**Guard restructure this requires:** `behind.onDraw` currently early-returns
on `kind === 'clear' || ramp <= 0.02`, which would suppress fair-weather
clouds. Restructure: bail only on `!cur`; draw fair-weather clouds first
under their own gate; THEN apply the old `kind === 'clear' || ramp <= 0.02`
return before the weather switch. `front.onDraw` keeps its existing guard.

**Tests:** pure spec-generators for both blob sets
(`overcastCloudSpecs(kind, night, tSec, width, horizonY)`,
`fairCloudSpecs(dawn, tSec, width, horizonY)` or similar) — assert tone
selection per kind, night mix, drift wrap determinism, dawn/day cluster
count (1 vs 2), and class-2 scaling (intra offsets ∝ fy).

**Definition of done:** typecheck + suite green; `?weather=cloudy` shows
gray blob clusters drifting; a clear weekday noon shows two white puffs;
dawn shows one warm puff.

## Task 3: Lightning redesign — seeded ~30s strikes, detailed bolt, no strobe

**File:** `packages/web/src/scene/weather-layer.ts` (+ test).

Delete `stormPhase`, `isFlashNow`, `isBoltOn`, the six hardcoded bolt rects,
and the old in-cloud flicker timing. Replace with, all exported and
TDD'd as pure functions:

**3a. Seeded scheduler.** `hash(n, salt) = frac(sin((n + salt * 77.7) *
12.9898) * 43758.5453)` (the sky.ts shooting-star idiom; no Date.now — the
caller passes `tSec` from `performance.now()/1000` as today).

- Strike slots of 32 s: `slot = floor(tSec / 32)`; strike start within the
  slot at `2 + hash(slot, 0) * 24` s; duration 0.7 s. One strike per slot →
  average cadence ≈ 30 s (user-directed; the old metronome was 4.5 s).
- `strikeParams(slot)`: anchor `x01 = 0.15 + hash(slot, 1) * 0.7`, variant
  `floor(hash(slot, 2) * 3)` (three shape variants).
- Flicker slots of 9 s: dim in-cloud flicker at `hash(slot9, 3) * 8.5` s
  into each 9 s slot, duration 0.18 s, SKIPPED while a strike envelope is
  active (the strike owns the sky).

**3b. Strike envelope.** `strikeEnvelope(dt)` for `dt` seconds since strike
start, returning `{bolt, flash, glow}` in [0,1]:

```
dt < 0 or dt ≥ 0.70 → {0, 0, 0}
0.00–0.08  pre-flicker   {bolt 0.35, flash 0, glow 0.5}
0.08–0.14  dark beat     {0, 0, 0}
0.14–0.38  main          {bolt 1, flash 1 − (dt−0.14)/0.24, glow 1}
0.38–0.70  afterglow     {bolt 1 − (dt−0.38)/0.32, flash 0, glow same as bolt}
```

The full-screen flash draws at `0.12 * envelope.flash * ramp` (the old code
snapped 0.22 on/off — the ramp-down is the anti-strobe). The in-cloud glow
rect (ref geometry `(ax−42, 12, 84, 34)` around the strike anchor
`ax = x01*480`, color `#E8DFA8`) draws at `0.3 * envelope.glow * ramp`.
Standalone flickers use the same rect at `0.18 * ramp` for their 0.18 s.

**3c. Bolt geometry.** `boltSegments(variant, x01)` → ref-space rects,
deterministic per (variant, x01):

- Trunk: from `(0, 38)` relative to anchor, 11 segments; segment i has
  `dy = 9 + hash(variant*31 + i, 4) * 4`, lateral step
  `dx = (i even ? +1 : −1) * (2 + hash(variant*31 + i, 5) * 5)` applied
  AFTER drawing; each segment is a rect `(x, y, 3, dy + 1)` (the +1 keeps
  the zigzag connected).
- Fork: from trunk segment 5's origin, 3 segments stepping the opposite
  lateral direction (`dx` sign flipped), `dy = 7 + hash(variant*31+i, 6)*2`,
  width 2.
- Glow: one rect per trunk segment at `(x − 3, y, 9, dy + 1)`.
- Colors: trunk `#FFE896` with the first two segments `#FFF6C8`; fork
  `#FFE896`; glow `#FFEFA0` at `0.16 * envelope.bolt * ramp`; trunk/fork at
  `envelope.bolt * ramp`.
- Draw as a class-2 cluster: anchor screen x = `x01 * width`, every segment
  offset and size × `fy(horizonY)`, y through mapY.

**3d. Reduced motion:** a static bolt — variant 0, `x01 = 0.65`, envelope
`{bolt 1, flash 0, glow 0.3}` — always on while storm is active; no flash,
no flickers (extends the existing reduced-motion contract).

**Tests:** envelope piecewise values and boundary continuity at 0.38
(bolt 1 → decay start 1), flash reaching exactly 0 by 0.38; scheduler
determinism (same tSec → same strike state) and cadence (exactly one strike
window per 32 s slot); `boltSegments` determinism, segment count (11+3+11),
connectivity (each trunk segment starts where dy of the previous ended);
flicker suppression during a strike.

**Definition of done:** typecheck + suite green; storm shows a strike about
every half minute — pre-flicker, dark beat, bright forked bolt with interior
cloud glow and a softly decaying screen flash — and only dim cloud flickers
in between.
