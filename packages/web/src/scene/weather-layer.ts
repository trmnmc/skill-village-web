import type { KAPLAYCtx, GameObj } from 'kaplay';
import { HUES } from '@village/core/visual';
import type { ResolvedTheme } from '../theme/store.js';
import { mix } from '../theme/palettes.js';
import { OVERCAST } from '../theme/weather/kinds.js';
import { horizonScreenY } from './sky.js';

/**
 * Transcribed from `reference/palette-explorations/village-scene.js`'s
 * `drawScene` — the weather branches, from the `/* --- weather layers... *\/`
 * comment through the storm bolt and fog veil. That file is a 480x270
 * <canvas> preview with sky rows [0,182) and ground rows [182,270); this
 * layer paints entirely in **screen space** on `k.fixed()` objects, the same
 * pattern sky.ts already uses for its sun/moon/stars — the 480x270 reference
 * scene is scaled to whatever the viewport happens to be, not to the
 * WORLD_W-wide scrollable strip (of which the camera only ever shows a
 * slice).
 *
 * Coordinate contract — `fx`, `fy`, `mapX`, `mapY` below — and the three
 * scaling classes used throughout the draw functions:
 *  1. CONFETTI particles (rain streaks, snowflakes, splash ticks, wind
 *     flecks, leaves, heat dashes): positions through mapX/mapY, sizes stay
 *     literal pixels — the same choice sky.ts made for its stars.
 *  2. ASPECT-CRITICAL CLUSTERS (storm cloud decks + rims, the in-cloud
 *     flicker rect, the bolt): the cluster's anchor x goes through mapX;
 *     every intra-cluster x offset and every width/height scales by
 *     `fy(horizonY)` on BOTH axes, so the shape keeps its reference aspect
 *     instead of smearing sideways with the viewport's width. Y positions go
 *     through mapY.
 *  3. DIFFUSE VEILS (storm rain shafts, fog bands/overlay/front veil, the
 *     ground-mist band, wind gust streaks): x/width through mapX (full-width
 *     veils just use `k.width()`), y/height through mapY endpoints — a veil
 *     spanning reference y A..B becomes screen y `mapY(A,…)` with height
 *     `mapY(B,…) - mapY(A,…)`.
 *
 * Wrap/modulo arithmetic stays in reference space: periods and drift speeds
 * are computed on the reference-space value first, then mapped, so scaling a
 * wrapped value by a positive constant is the same as scaling the value and
 * its period before wrapping.
 *
 * `width`, `height`, and the live horizon screen y are re-derived at the top
 * of every `onDraw` call (see `horizonScreenY`, imported from sky.ts) — never
 * cached across frames, so a window resize self-corrects on the very next
 * frame. Contrast sky.ts's own fixed objects, whose positions are written in
 * `update()` and so only self-correct on the next resolved-theme publish.
 *
 * The rainbow is the one exception to "redraw every frame": its ~670 blocks
 * are built once into a retained `k.fixed()` object when the weather enters
 * `rainbow` (rebuilt only if the viewport moves by more than a pixel), not
 * regenerated from scratch every frame — see `rainbowBlocks` and its call
 * site in `update()` below.
 */

/** The reference painter's `staticFrame` instant — frozen time under reduced motion. */
const REDUCED_MOTION_T = 1.3;

// ---------------------------------------------------------------------------
// Pure particle math — no store reads, no KAPLAY. Tested in weather-layer.test.ts.
// ---------------------------------------------------------------------------

/** `x - Math.floor(x)`: always in [0, 1), including for negative `x`. */
export function frac(x: number): number {
  return x - Math.floor(x);
}

export interface RainDrop {
  x: number;
  y: number;
  len: number;
  alpha: number;
}

/**
 * One rain streak, in raw reference space (480x270), verbatim from the
 * reference's rain loop (`heavy` selects the storm variant: faster, longer,
 * steeper slant). `i` is the drop index (0..rn), `tSec` the animation clock.
 * Draw sites map `x`/`y` through mapX/mapY; `len` stays a literal pixel size.
 */
export function rainDrop(i: number, tSec: number, heavy: boolean): RainDrop {
  const r1 = frac(i * 0.6180339);
  const r2 = frac(i * 0.7548776);
  const r3 = frac(i * 0.5698402);
  const speed = (heavy ? 200 : 115) * (0.7 + r3 * 0.6);
  const len = (heavy ? 7 : 5) + r2 * 4;
  const refY = (((r1 * 900) + tSec * speed) % 290) - 12;
  const refX = r2 * 500 + (heavy ? -refY * 0.28 : -refY * 0.08);
  const alpha = 0.14 + r3 * 0.18;
  return { x: refX, y: refY, len, alpha };
}

/** Positive-safe modulo: wraps `x` into [0, m), including when `x` is deeply negative. Needed for the cloud drift below — unlike this file's other periodic motion (which only ever adds a `tSec` term), drift subtracts an unbounded one, so plain `%` would go negative once `tSec` grows past the anchor. */
function wrap(x: number, m: number): number {
  return ((x % m) + m) % m;
}

/** `x` clamped to [0, 1]. Used to turn an unbounded overcast ramp into a crossfade multiplier. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export interface SnowFlake {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

/** One snowflake, in raw reference space, verbatim from the reference's snow loop. */
export function snowFlake(i: number, tSec: number): SnowFlake {
  const s1 = frac(i * 0.6180339);
  const s2 = frac(i * 0.7548776);
  const s3 = frac(i * 0.5698402);
  const fall = 13 + s3 * 17;
  const refY = (((s1 * 900) + tSec * fall) % 285) - 5;
  const refX = s2 * 480 + Math.sin(tSec * (0.35 + s3 * 0.5) + i) * (6 + s1 * 10);
  const size = s1 < 0.15 ? 3 : 2;
  const alpha = 0.3 + s3 * 0.5;
  return { x: refX, y: refY, size, alpha };
}

// ---------------------------------------------------------------------------
// The coordinate contract: reference space (480x270, sky [0,182), ground
// [182,270)) to screen space. `horizonY` is always the *live* screen y of
// GROUND_TOP (see `horizonScreenY`), recomputed every frame by callers.
// ---------------------------------------------------------------------------

/** Horizontal scale: the viewport is `width` px wide where the reference is 480. */
export function fx(width: number): number {
  return width / 480;
}

/** Vertical scale for the sky band: the horizon sits at `horizonY` where the reference has it at 182. */
export function fy(horizonY: number): number {
  return horizonY / 182;
}

/** Maps a reference-space x (or an x-magnitude, e.g. a width) onto screen space. */
export function mapX(refX: number, width: number): number {
  return refX * fx(width);
}

/**
 * Maps a reference-space y onto screen space. Sky rows (`refY <= 182`) scale
 * linearly by `fy(horizonY)`; ground rows interpolate linearly from the live
 * horizon down to the bottom of the screen, so `mapY(182,h,H) === h` and
 * `mapY(270,h,H) === H` regardless of viewport size.
 */
export function mapY(refY: number, horizonY: number, height: number): number {
  return refY <= 182 ? refY * fy(horizonY) : horizonY + ((refY - 182) / 88) * (height - horizonY);
}

/**
 * Class-3 veil helper: maps a reference y-range [refY0, refY1] to a screen
 * [y, height] pair via mapY's endpoints, so a veil from ref y A to ref y B
 * spans exactly `mapY(A,…)` to `mapY(B,…)` on screen.
 */
function vSpan(refY0: number, refY1: number, horizonY: number, height: number): [y: number, h: number] {
  const y0 = mapY(refY0, horizonY, height);
  const y1 = mapY(refY1, horizonY, height);
  return [y0, y1 - y0];
}

export interface RainbowBlock {
  x: number;
  y: number;
  size: number;
  /** Band index 0..4, outermost to innermost; the caller maps this to a colour. */
  band: number;
}

/**
 * Geometry for the rainbow's retained arc: five concentric bands of square
 * blocks, angle-stepped in reference space (`4/rr` radians, `rr` the
 * reference-space band radius) so each band stays contiguous however many
 * blocks that works out to (~134 for the outermost band). Both the radius
 * and the block size scale uniformly by `fy(horizonY)` — a deliberate
 * departure from the mapX/mapY split used elsewhere in this file, so the arc
 * stays a true circle instead of stretching into an ellipse with the
 * viewport's aspect ratio. Center x is `width/2` (the reference's own centre,
 * 240, is exactly half of 480). This function has no `height` parameter —
 * clipping blocks that fall below the visible screen happens at the call
 * site, which has `k.height()`.
 */
export function rainbowBlocks(width: number, horizonY: number): RainbowBlock[] {
  const blocks: RainbowBlock[] = [];
  const scale = fy(horizonY);
  const centerX = width / 2;
  const centerY = 265 * scale;
  const size = 4 * scale;
  for (let band = 0; band < 5; band++) {
    const rr = 170 - band * 6;
    const step = 4 / rr;
    for (let a = Math.PI; a <= Math.PI * 2; a += step) {
      const x = centerX + Math.cos(a) * rr * scale;
      const y = centerY + Math.sin(a) * rr * scale;
      blocks.push({ x, y, size, band });
    }
  }
  return blocks;
}

/** [HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]] — the reference's exact band order. */
const RAINBOW_BAND_COLOURS = [HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]];

// ---------------------------------------------------------------------------
// Cloud blobs (overcast + fair-weather) — class-2 aspect-critical clusters,
// same convention as the storm decks above: a drifting reference-space
// anchor goes through mapX, every intra-cluster offset/size scales by
// fy(horizonY) on both axes. Every cluster rect here sits in the sky band
// (refY <= 182), so `r.y * fy(horizonY)` is mapY's sky-band formula inlined —
// no `height` parameter needed, matching these functions' pure (kind/dawn,
// night, tSec, width, horizonY) signatures.
// ---------------------------------------------------------------------------

/** Which of a cluster's rects this is — the caller maps tones to colours. */
type CloudTone = 'lit' | 'body' | 'belly';

interface CloudRectDef {
  dx: number;
  y: number;
  w: number;
  h: number;
  tone: CloudTone;
}

interface CloudClusterDef {
  /** Reference-space x of the cluster's first rect — the class-2 anchor before drift. */
  baseX: number;
  /** Index into CLOUD_LAYERS: 0 far, 1 mid, 2 near. */
  layer: number;
  /** Withheld outside full day, following the reference's dawn rule. */
  dayOnly?: boolean;
  rects: CloudRectDef[];
}

/** One cloud depth layer. Everything rises together toward the camera: near clouds follow the pan harder, drift faster, and draw brighter. */
export interface CloudLayer {
  /** Fraction of the camera's x this layer tracks — the parallax that makes the sky read deep. */
  parallax: number;
  /** Multiplier on the cloud set's base drift speed. */
  speed: number;
  /** Multiplier on the cloud set's base alpha. */
  alpha: number;
}

export const CLOUD_LAYERS: readonly CloudLayer[] = [
  { parallax: 0.1, speed: 0.6, alpha: 0.55 },
  { parallax: 0.18, speed: 1, alpha: 0.8 },
  { parallax: 0.3, speed: 1.6, alpha: 1 },
];

export interface CloudBlobSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
}

/**
 * Slow billow, one-sided: the authored size is the *floor* and the cloud
 * swells upward from it, oscillating between authored and ~1.35x on two
 * incommensurate sines (the same trick the village's wander uses), seeded
 * per rect so no two swell together. Slow enough that one frame's change is
 * invisible — a swell, never a morph or a jitter.
 */
function billow(tSec: number, seed: number): number {
  const wave = (Math.sin(tSec * 0.09 + seed * 7) + 0.5 * Math.sin(tSec * 0.157 + seed * 3)) / 1.5;
  return 1 + 0.35 * (wave + 1) / 2;
}

/**
 * Materializes clusters at one instant. Each cluster's anchor drifts
 * leftward in reference space at `baseSpeed` scaled by its layer's `speed`,
 * wrapping over a 700 ref-px period into `[-160, 540)` (wrapped with `wrap`,
 * not raw `%` — drift and parallax both *subtract* unbounded terms). The
 * window is deliberately wider than any cluster's maximum billowed extent
 * (~135 ref px right of the anchor at full swell, ~23 left), so a cluster
 * only ever crosses the wrap seam while fully off-screen — at a narrower
 * window, part of a visible cloud would teleport across the sky mid-frame.
 * Two plan-over-reference deviations, both deliberate: the reference paints
 * these static (a scrolling camera would pin them to one screen spot), and
 * it knows nothing of depth — the parallax term (`camRefX` scaled by the
 * layer's fraction) plus the per-layer drift speeds are what make the sky
 * read as volume instead of a backdrop. Output is ordered far layer first,
 * so painting in order stacks near clouds over far ones.
 */
function driftedClusterRects(
  clusters: readonly CloudClusterDef[],
  baseSpeed: number,
  tSec: number,
  camRefX: number,
  width: number,
  horizonY: number,
): { x: number; y: number; w: number; h: number; tone: CloudTone; layer: CloudLayer }[] {
  const s = fy(horizonY);
  const out: { x: number; y: number; w: number; h: number; tone: CloudTone; layer: CloudLayer }[] = [];
  const ordered = [...clusters].sort((a, b) => a.layer - b.layer);
  for (const cluster of ordered) {
    const layer = CLOUD_LAYERS[cluster.layer]!;
    const driftedRefX = wrap(
      cluster.baseX + 700 - tSec * baseSpeed * layer.speed - camRefX * layer.parallax,
      700,
    ) - 160;
    const anchorX = mapX(driftedRefX, width);
    cluster.rects.forEach((r, ri) => {
      const seed = frac(cluster.baseX * 0.317 + ri * 0.611);
      const bw = billow(tSec, seed);
      // Height swells on the same one-sided rule, gentler and on its own
      // phase, so a swelling cloud thickens rather than only stretching.
      const bh = 1 + 0.2 * (Math.sin(tSec * 0.11 + seed * 5) + 1) / 2;
      const sway = 3 * Math.sin(tSec * 0.073 + seed * 11);
      // Growth is centred: the rect swells in place instead of bulging
      // right- and downward off its authored anchor.
      out.push({
        x: anchorX + (r.dx + sway - (r.w * (bw - 1)) / 2) * s,
        y: (r.y - (r.h * (bh - 1)) / 2) * s,
        w: r.w * bw * s,
        h: r.h * bh * s,
        tone: r.tone,
        layer,
      });
    });
  }
  return out;
}

/**
 * The reference's four overcast clusters (village-scene.js lines 300–303) —
 * geometry verbatim, each grown a tone role and a depth layer: the two big
 * low-y clusters read as the near deck (lit caps, new belly strips), the two
 * small high-y ones hang back as the far layer. Exported so the test suite
 * can pin the reference-verbatim members against the painter's literals.
 */
export const OVERCAST_CLOUD_CLUSTERS: readonly CloudClusterDef[] = [
  {
    baseX: 14, layer: 2,
    rects: [
      { dx: 0, y: 18, w: 96, h: 14, tone: 'body' },
      { dx: 18, y: 10, w: 52, h: 10, tone: 'lit' },
      { dx: 8, y: 32, w: 78, h: 4, tone: 'belly' },
    ],
  },
  { baseX: 150, layer: 0, rects: [{ dx: 0, y: 40, w: 74, h: 12, tone: 'body' }] },
  {
    baseX: 248, layer: 2,
    rects: [
      { dx: 0, y: 14, w: 112, h: 16, tone: 'body' },
      { dx: 22, y: 6, w: 62, h: 10, tone: 'lit' },
      { dx: 10, y: 30, w: 92, h: 4, tone: 'belly' },
    ],
  },
  { baseX: 384, layer: 0, rects: [{ dx: 0, y: 42, w: 82, h: 12, tone: 'body' }] },
];

/** Base (day) tone per overcast kind, verbatim from the reference's `cTone` ternary (`storm` excluded — it keeps its own deck clouds, no blobs). */
const OVERCAST_TONE: Record<'cloudy' | 'rain' | 'snow' | 'fog', string> = {
  cloudy: '#B4BABE', rain: '#9AA6AE', snow: '#C8D0D6', fog: '#CFCCC0',
};

/** A kind's body tone shaded into the three-tone set that reads as mass. */
function cloudTones(body: string): Record<CloudTone, string> {
  return { lit: mix(body, '#FFFFFF', 0.3), body, belly: mix(body, '#1A2028', 0.28) };
}

/**
 * Overcast cloud blobs for the four non-storm overcast kinds — the
 * reference's `else if (overcast)` branch, under which `cloudy` previously
 * drew nothing. The reference's flat 0.85 alpha is now the *near layer's*
 * alpha; far clusters dim by their layer. Callers multiply by `weather.ramp`
 * themselves, since this function has no `ResolvedTheme` to read it from.
 */
export function overcastCloudSpecs(
  kind: 'cloudy' | 'rain' | 'snow' | 'fog',
  night: boolean,
  tSec: number,
  camRefX: number,
  width: number,
  horizonY: number,
): CloudBlobSpec[] {
  const tones = cloudTones(OVERCAST_TONE[kind]);
  return driftedClusterRects(OVERCAST_CLOUD_CLUSTERS, 3, tSec, camRefX, width, horizonY).map((r) => ({
    x: r.x, y: r.y, w: r.w, h: r.h,
    color: night ? mix(tones[r.tone], '#1A2028', 0.5) : tones[r.tone],
    alpha: 0.85 * r.layer.alpha,
  }));
}

/**
 * The fair-weather sky: the reference's two clusters (village-scene.js lines
 * 307–308, geometry recognizable in the near and mid entries) grown into a
 * three-layer ambient set — small far puffs low near the horizon, mid
 * clusters, the big near cluster riding high. `dayOnly` keeps the
 * reference's dawn rule: the second cluster sits out everything but full
 * day. Exported so the test suite can pin the reference-verbatim members.
 */
export const FAIR_CLOUD_CLUSTERS: readonly CloudClusterDef[] = [
  {
    baseX: 70, layer: 2,
    rects: [
      { dx: 0, y: 42, w: 40, h: 10, tone: 'body' },
      { dx: 10, y: 34, w: 24, h: 8, tone: 'lit' },
      { dx: 6, y: 52, w: 30, h: 3, tone: 'belly' },
    ],
  },
  {
    baseX: 270, layer: 1, dayOnly: true,
    rects: [
      { dx: 0, y: 66, w: 34, h: 9, tone: 'body' },
      { dx: 8, y: 59, w: 20, h: 7, tone: 'lit' },
      { dx: 5, y: 75, w: 24, h: 3, tone: 'belly' },
    ],
  },
  {
    baseX: 470, layer: 1,
    rects: [
      { dx: 0, y: 78, w: 30, h: 8, tone: 'body' },
      { dx: 7, y: 72, w: 18, h: 6, tone: 'lit' },
      { dx: 4, y: 86, w: 22, h: 2, tone: 'belly' },
    ],
  },
  {
    baseX: 180, layer: 0,
    rects: [
      { dx: 0, y: 118, w: 30, h: 7, tone: 'body' },
      { dx: 8, y: 113, w: 16, h: 5, tone: 'lit' },
    ],
  },
  { baseX: 420, layer: 0, rects: [{ dx: 0, y: 138, w: 26, h: 6, tone: 'body' }] },
];

/** The sky phase fair clouds are drawn under — derived from the theme flags by the caller. */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Fair-cloud tone sets per phase. Day and dawn bodies keep the reference's
 * exact colours; dusk and night are new — ambient clouds no longer vanish
 * outside daylight, they dim into embers and moonlit slate (design delta to
 * spec §5: sky furniture is always on).
 */
const FAIR_TONES: Record<SkyPhase, Record<CloudTone, string>> = {
  day: { lit: '#FFFFFF', body: '#F5F8FA', belly: '#D9E3EB' },
  dawn: { lit: '#FFFAF0', body: '#FFF3E0', belly: '#EAD9C4' },
  dusk: { lit: '#F3DFCE', body: '#E2C9B4', belly: '#C7AD97' },
  night: { lit: '#4A5666', body: '#37414D', belly: '#252D37' },
};

/** Base alpha per phase — night clouds are company for the moon, not a ceiling. */
const FAIR_ALPHA: Record<SkyPhase, number> = { day: 0.75, dawn: 0.75, dusk: 0.6, night: 0.45 };

/**
 * Fair-weather clouds — sky furniture, not weather: always present, at every
 * phase of the sky, independent of the weather switch's own `ramp` gate.
 *
 * `overcastRamp` (the current weather's `ramp` when its kind is in
 * `OVERCAST`, else 0 — see the caller in `mountWeather`) crossfades these out
 * as overcast blobs (`overcastCloudSpecs`) fade in, instead of the old binary
 * `flags.overcast` gate (`ramp > 0.5`) which let both blob sets render at
 * once during journey-mode transitions and then popped the fair clouds out
 * in a single frame at the 0.5 threshold. At `overcastRamp >= 1` this
 * resolves to alpha 0 (fully replaced by overcast blobs).
 */
export function fairCloudSpecs(
  phase: SkyPhase,
  tSec: number,
  camRefX: number,
  width: number,
  horizonY: number,
  overcastRamp: number,
): CloudBlobSpec[] {
  const tones = FAIR_TONES[phase];
  const alpha = FAIR_ALPHA[phase] * (1 - clamp01(overcastRamp));
  const clusters = phase === 'day' ? FAIR_CLOUD_CLUSTERS : FAIR_CLOUD_CLUSTERS.filter((c) => !c.dayOnly);
  return driftedClusterRects(clusters, 1.5, tSec, camRefX, width, horizonY).map((r) => ({
    x: r.x, y: r.y, w: r.w, h: r.h,
    color: tones[r.tone],
    alpha: alpha * r.layer.alpha,
  }));
}

// ---------------------------------------------------------------------------
// Tint helpers — mirror the reference's own `sc`/`cc` closures.
// ---------------------------------------------------------------------------

function sc(cur: ResolvedTheme, hex: string): string {
  return cur.tint.sceneryK ? mix(hex, cur.tint.col, cur.tint.sceneryK) : hex;
}

function cc(cur: ResolvedTheme, hex: string): string {
  return cur.tint.creatureK ? mix(hex, cur.tint.col, cur.tint.creatureK) : hex;
}

function rect(k: KAPLAYCtx, x: number, y: number, w: number, h: number, colorHex: string, alpha: number): void {
  if (alpha <= 0) return;
  k.drawRect({ pos: k.vec2(x, y), width: w, height: h, color: k.Color.fromHex(colorHex), opacity: alpha });
}

// ---------------------------------------------------------------------------
// Storm lightning — a seeded strike about every 30s (not the old 4.5s
// metronome), a detailed forked bolt, and no strobe: the flash and glow ramp
// rather than snap on/off. Shared by the in-scene bolt (`drawLightning`,
// beside the other per-weather draws below) and the front-of-screen flash
// object (`flash.onDraw` in `mountWeather`).
// ---------------------------------------------------------------------------

/** Strike slots: one candidate strike per 32s slot, average cadence ≈ 30s. */
const STRIKE_SLOT_S = 32;
/** A strike starts 2..26s into its slot (`STRIKE_WINDOW_MIN_S + hash*STRIKE_WINDOW_SPAN_S`). */
const STRIKE_WINDOW_MIN_S = 2;
const STRIKE_WINDOW_SPAN_S = 24;
const STRIKE_DURATION_S = 0.7;
/** Dim in-cloud flickers between strikes: one candidate per 9s slot. */
const FLICKER_SLOT_S = 9;
const FLICKER_WINDOW_SPAN_S = 8.5;
const FLICKER_DURATION_S = 0.18;

/** Trunk/fork/glow segment counts for `boltSegments` — see its own comment. */
const BOLT_TRUNK_SEGMENTS = 11;
const BOLT_FORK_SEGMENTS = 3;
const BOLT_FORK_BRANCH_INDEX = 5;

/**
 * Seeded hash into [0, 1) — the sky.ts shooting-star idiom
 * (`frac(sin(n * 12.9898) * 43758.5453)`), generalized with a `salt` so
 * multiple independent draws (a strike's anchor, its variant, a bolt
 * segment's dy vs. its dx) can share the same index `n` without
 * correlating. No `Date.now`/`performance.now` inside — callers pass
 * `tSec`-derived slot indices, so results replay deterministically.
 */
export function hash(n: number, salt: number): number {
  return frac(Math.sin((n + salt * 77.7) * 12.9898) * 43758.5453);
}

export interface StrikeParams {
  /** Strike anchor, 0..1 across the viewport width (0.15..0.85 — kept off the screen edges). */
  x01: number;
  /** Bolt shape variant, 0..2 — see `boltSegments`. */
  variant: number;
}

/** The strike anchor/variant for slot `slot` — stable for the whole slot, so re-deriving it mid-strike (every draw frame) is stable too. */
export function strikeParams(slot: number): StrikeParams {
  return {
    x01: 0.15 + hash(slot, 1) * 0.7,
    variant: Math.floor(hash(slot, 2) * 3),
  };
}

export interface ActiveStrike {
  /** Seconds since this strike started; always in [0, STRIKE_DURATION_S). */
  dt: number;
  x01: number;
  variant: number;
}

/**
 * The strike active at `tSec`, or `null` if no strike is currently firing.
 * One strike is scheduled per 32s slot, starting 2..26s in and lasting 0.7s
 * — comfortably shorter than the gap to the next slot's earliest possible
 * start, so slots never need to look at their neighbors.
 */
export function activeStrike(tSec: number): ActiveStrike | null {
  const slot = Math.floor(tSec / STRIKE_SLOT_S);
  const start = slot * STRIKE_SLOT_S + STRIKE_WINDOW_MIN_S + hash(slot, 0) * STRIKE_WINDOW_SPAN_S;
  const dt = tSec - start;
  if (dt < 0 || dt >= STRIKE_DURATION_S) return null;
  const { x01, variant } = strikeParams(slot);
  return { dt, x01, variant };
}

export interface StrikeEnvelope {
  /** Bolt + in-cloud glow rect brightness, 0..1. */
  bolt: number;
  /** Full-screen flash brightness, 0..1. */
  flash: number;
  /** In-cloud glow rect brightness (independent of `bolt` during the pre-flicker beat), 0..1. */
  glow: number;
}

/**
 * The strike's brightness envelope `dt` seconds after it started: a dim
 * pre-flicker, a dark beat, a bright forked bolt with a flash that ramps
 * down (not snaps off — the anti-strobe fix), then a decaying afterglow.
 * Continuous at the 0.38s main→afterglow boundary (`bolt` is 1 on both
 * sides) and at 0.70s the flash has already reached exactly 0.
 */
export function strikeEnvelope(dt: number): StrikeEnvelope {
  if (dt < 0 || dt >= 0.7) return { bolt: 0, flash: 0, glow: 0 };
  if (dt < 0.08) return { bolt: 0.35, flash: 0, glow: 0.5 };
  if (dt < 0.14) return { bolt: 0, flash: 0, glow: 0 };
  if (dt < 0.38) return { bolt: 1, flash: 1 - (dt - 0.14) / 0.24, glow: 1 };
  const bolt = 1 - (dt - 0.38) / 0.32;
  return { bolt, flash: 0, glow: bolt };
}

/**
 * Whether a dim standalone in-cloud flicker (not a full strike) fires at
 * `tSec`: one candidate per 9s slot, `hash*8.5`s in, lasting 0.18s —
 * suppressed whenever a strike is currently active, since the strike owns
 * the sky for its 0.7s window.
 */
export function flickerActive(tSec: number): boolean {
  if (activeStrike(tSec)) return false;
  const slot9 = Math.floor(tSec / FLICKER_SLOT_S);
  const start = slot9 * FLICKER_SLOT_S + hash(slot9, 3) * FLICKER_WINDOW_SPAN_S;
  const dt = tSec - start;
  return dt >= 0 && dt < FLICKER_DURATION_S;
}

export interface BoltSegment {
  /** Reference-space x, offset from the strike's screen anchor (`x01 * width`). */
  x: number;
  /** Reference-space y, absolute — the anchor sits at ref y 38, same axis mapY uses. */
  y: number;
  w: number;
  h: number;
  color: string;
  kind: 'trunk' | 'fork' | 'glow';
}

/**
 * Deterministic bolt geometry for shape `variant` (0..2), in reference space
 * relative to the strike anchor. The anchor's screen x (`x01 * width`)
 * doesn't change this shape at all — only where it's drawn — so this pure
 * function takes just `variant`; the draw site anchors and scales it (see
 * `drawBolt`).
 *
 * Trunk: 11 segments zigzagging down from ref (0, 38); segment `i`'s height
 * is `dy+1` (the `+1` keeps consecutive segments visually connected) and its
 * lateral step `dx` (sign alternating by parity) is applied *after* it's
 * drawn, so segment `i+1` starts exactly where segment `i` ended. The first
 * two segments are the brighter `#FFF6C8`, the rest `#FFE896`.
 *
 * Fork: 3 segments branching from trunk segment 5's origin, alternating the
 * *opposite* lateral direction from the trunk's own parity-based pattern,
 * narrower than the trunk (width 2 vs. 3).
 *
 * Glow: one soft `#FFEFA0` rect per trunk segment, centered on it
 * (`x-3, y, 9, dy+1`) — drawn first (returned first) so the sharp trunk/fork
 * lines render on top of it.
 */
export function boltSegments(variant: number): BoltSegment[] {
  const trunk: BoltSegment[] = [];
  const origins: { x: number; y: number }[] = [];
  let x = 0;
  let y = 38;
  for (let i = 0; i < BOLT_TRUNK_SEGMENTS; i++) {
    origins.push({ x, y });
    const dy = 9 + hash(variant * 31 + i, 4) * 4;
    const dx = (i % 2 === 0 ? 1 : -1) * (2 + hash(variant * 31 + i, 5) * 5);
    trunk.push({ x, y, w: 3, h: dy + 1, color: i < 2 ? '#FFF6C8' : '#FFE896', kind: 'trunk' });
    x += dx;
    y += dy;
  }

  const fork: BoltSegment[] = [];
  const branch = origins[BOLT_FORK_BRANCH_INDEX]!;
  let bx = branch.x;
  let by = branch.y;
  for (let j = 0; j < BOLT_FORK_SEGMENTS; j++) {
    const dy = 7 + hash(variant * 31 + j, 6) * 2;
    const dx = (j % 2 === 0 ? -1 : 1) * (2 + hash(variant * 31 + j, 5) * 5);
    fork.push({ x: bx, y: by, w: 2, h: dy + 1, color: '#FFE896', kind: 'fork' });
    bx += dx;
    by += dy;
  }

  const glow: BoltSegment[] = trunk.map((seg) => ({ x: seg.x - 3, y: seg.y, w: 9, h: seg.h, color: '#FFEFA0', kind: 'glow' }));

  return [...glow, ...trunk, ...fork];
}

/** Reduced motion (3d of the lightning redesign): a static bolt, always on while the storm is active — no flash, no flickers (see `drawLightning`). */
const REDUCED_MOTION_BOLT_VARIANT = 0;
const REDUCED_MOTION_BOLT_X01 = 0.65;
const REDUCED_MOTION_ENVELOPE: StrikeEnvelope = { bolt: 1, flash: 0, glow: 0.3 };

/** Anchor for standalone in-cloud flickers (no strike is active to anchor to): reproduces the previous flicker's screen position, ref x 96 = this x01*480 minus the glow rect's own -42 offset. */
const FLICKER_GLOW_X01 = 138 / 480;

// ---------------------------------------------------------------------------
// Per-weather draw branches — behind the creatures. Each takes the frame's
// `width`/`height`/`horizonY`, re-derived once by the caller (see onDraw
// below), never cached across frames.
// ---------------------------------------------------------------------------

function drawRainAndSplashes(
  k: KAPLAYCtx,
  cur: ResolvedTheme,
  tSec: number,
  reduced: boolean,
  width: number,
  height: number,
  horizonY: number,
): void {
  const { weather, tokens, flags } = cur;
  const ramp = weather.ramp;
  const heavy = weather.kind === 'storm';
  const rn = heavy ? 100 : 70;
  const dropColour = flags.isNight ? '#AEC2D2' : mix(tokens.sky1, '#FFFFFF', 0.45);
  for (let i = 0; i < rn; i++) {
    const d = rainDrop(i, tSec, heavy);
    rect(k, mapX(d.x, width), mapY(d.y, horizonY, height), 2, d.len, dropColour, d.alpha * ramp);
  }

  const splashColour = flags.isNight ? '#C3D4E2' : mix(tokens.sky1, '#FFFFFF', 0.55);
  const sn = heavy ? 14 : 8;
  for (let i = 0; i < sn; i++) {
    const cyc = frac(tSec * 1.3 + i * 0.37);
    if (cyc > 0.28 && !reduced) continue;
    const sxRef = frac(i * 0.6180339) * 466 + 4;
    const syRef = 194 + frac(i * 0.7548776) * 70;
    const alpha = (reduced ? 0.35 : 0.4 * (1 - cyc / 0.28)) * ramp;
    const sy = mapY(syRef, horizonY, height);
    rect(k, mapX(sxRef - 3, width), sy, 2, 2, splashColour, alpha);
    rect(k, mapX(sxRef + 3, width), sy, 2, 2, splashColour, alpha);
  }
}

function drawStormClouds(
  k: KAPLAYCtx,
  cur: ResolvedTheme,
  tSec: number,
  width: number,
  height: number,
  horizonY: number,
): void {
  const { weather, flags } = cur;
  const ramp = weather.ramp;
  const night = flags.isNight;
  const deckFar = night ? '#2C343C' : '#68727A';
  const deckNear = night ? '#20272E' : '#4A545C';
  const deckRim = night ? '#39424B' : '#7E888F';
  const drift1 = (tSec * 3) % 520;
  const drift2 = (tSec * 6) % 520;
  const s = fy(horizonY);

  // Far deck: class-2 clusters, anchor cfx.
  for (let cf = 0; cf < 3; cf++) {
    const cfx = ((cf * 190 + drift1) % 660) - 90;
    const anchorX = mapX(cfx, width);
    rect(k, anchorX, mapY(2, horizonY, height), 168 * s, 20 * s, deckFar, ramp);
    rect(k, anchorX + 24 * s, mapY(20, horizonY, height), 120 * s, 8 * s, deckFar, ramp);
  }

  // Distant rain shafts hanging from the far deck: class-3 veils.
  const shaftColour = night ? '#4A5862' : '#8C9AA4';
  const [shaftY, shaftH] = vSpan(30, 180, horizonY, height);
  for (let sh = 0; sh < 3; sh++) {
    const shx = ((sh * 176 + drift1 * 0.6) % 520) - 20;
    for (let sk = 0; sk < 5; sk++) {
      const alpha = (0.1 - sk * 0.016) * ramp;
      rect(k, mapX(shx + sk * 3, width), shaftY, mapX(30 - sk * 4, width), shaftH, shaftColour, alpha);
    }
  }

  // Near deck: heavier, lower, lit rims on top — class-2 clusters, anchor cnx.
  for (let cn = 0; cn < 4; cn++) {
    const cnx = ((cn * 150 + drift2) % 640) - 100;
    const anchorX = mapX(cnx, width);
    const cny = 24 + (cn % 2) * 12;
    rect(k, anchorX + 8 * s, mapY(cny - 3, horizonY, height), 118 * s, 3 * s, deckRim, ramp);
    rect(k, anchorX, mapY(cny, horizonY, height), 134 * s, 24 * s, deckNear, ramp);
    rect(k, anchorX + 18 * s, mapY(cny + 24, horizonY, height), 96 * s, 9 * s, deckNear, ramp);
  }

  // Low ground mist whipped up by the rain: class-3 full-width veil.
  const [mistY, mistH] = vSpan(172, 188, horizonY, height);
  rect(k, 0, mistY, width, mistH, '#FFFFFF', 0.08 * ramp);
}

/** The in-cloud glow rect (ref 84x34) around a strike anchor `x01`, or a standalone flicker's fixed anchor — class-2 cluster, see the file header's scaling classes. */
function drawCloudGlow(k: KAPLAYCtx, x01: number, alpha: number, width: number, height: number, horizonY: number): void {
  if (alpha <= 0) return;
  const s = fy(horizonY);
  const anchorX = x01 * width;
  rect(k, anchorX - 42 * s, mapY(12, horizonY, height), 84 * s, 34 * s, '#E8DFA8', alpha);
}

/** The bolt's trunk/fork/glow segments (`boltSegments`) as a class-2 cluster anchored at `x01 * width`. */
function drawBolt(
  k: KAPLAYCtx,
  variant: number,
  x01: number,
  env: StrikeEnvelope,
  ramp: number,
  width: number,
  height: number,
  horizonY: number,
): void {
  if (env.bolt <= 0) return;
  const s = fy(horizonY);
  const anchorX = x01 * width;
  for (const seg of boltSegments(variant)) {
    const alpha = (seg.kind === 'glow' ? 0.16 : 1) * env.bolt * ramp;
    rect(k, anchorX + seg.x * s, mapY(seg.y, horizonY, height), seg.w * s, seg.h * s, seg.color, alpha);
  }
}

/**
 * The storm's lightning: a seeded strike about every 30s (pre-flicker, dark
 * beat, forked bolt with in-cloud glow, a screen flash that ramps down
 * instead of snapping off) plus dim standalone in-cloud flickers between
 * strikes, suppressed while a strike is active (`flickerActive` already
 * checks this). Reduced motion shows one static bolt the whole time the
 * storm is active — no flash, no flickers.
 */
function drawLightning(
  k: KAPLAYCtx,
  cur: ResolvedTheme,
  tSec: number,
  reduced: boolean,
  width: number,
  height: number,
  horizonY: number,
): void {
  const ramp = cur.weather.ramp;

  if (reduced) {
    drawBolt(k, REDUCED_MOTION_BOLT_VARIANT, REDUCED_MOTION_BOLT_X01, REDUCED_MOTION_ENVELOPE, ramp, width, height, horizonY);
    drawCloudGlow(k, REDUCED_MOTION_BOLT_X01, 0.3 * REDUCED_MOTION_ENVELOPE.glow * ramp, width, height, horizonY);
    return;
  }

  const strike = activeStrike(tSec);
  if (strike) {
    const env = strikeEnvelope(strike.dt);
    drawBolt(k, strike.variant, strike.x01, env, ramp, width, height, horizonY);
    drawCloudGlow(k, strike.x01, 0.3 * env.glow * ramp, width, height, horizonY);
  } else if (flickerActive(tSec)) {
    drawCloudGlow(k, FLICKER_GLOW_X01, 0.18 * ramp, width, height, horizonY);
  }
}

/** Overcast cloud blobs for `cloudy`/`rain`/`snow`/`fog` — drawn before the kind's own precipitation so precip falls in front. `storm` keeps its decks instead (see `drawStormClouds`); no blobs there. */
function drawOvercastCloudBlobs(
  k: KAPLAYCtx,
  kind: 'cloudy' | 'rain' | 'snow' | 'fog',
  night: boolean,
  ramp: number,
  tSec: number,
  camRefX: number,
  width: number,
  horizonY: number,
): void {
  for (const b of overcastCloudSpecs(kind, night, tSec, camRefX, width, horizonY)) {
    rect(k, b.x, b.y, b.w, b.h, b.color, b.alpha * ramp);
  }
}

/** Fair-weather clouds — ambient sky furniture at every phase, crossfading out via `overcastRamp` (see `fairCloudSpecs`). */
function drawFairClouds(
  k: KAPLAYCtx,
  phase: SkyPhase,
  tSec: number,
  camRefX: number,
  width: number,
  horizonY: number,
  overcastRamp: number,
): void {
  if (overcastRamp >= 1) return; // fully replaced by overcast blobs — alpha would be 0 anyway
  for (const b of fairCloudSpecs(phase, tSec, camRefX, width, horizonY, overcastRamp)) {
    rect(k, b.x, b.y, b.w, b.h, b.color, b.alpha);
  }
}

function drawSnow(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number, width: number, height: number, horizonY: number): void {
  const ramp = cur.weather.ramp;
  for (let i = 0; i < 60; i++) {
    const f = snowFlake(i, tSec);
    rect(k, mapX(f.x, width), mapY(f.y, horizonY, height), f.size, f.size, '#FFFFFF', f.alpha * ramp);
  }
}

function drawFogBehind(
  k: KAPLAYCtx,
  cur: ResolvedTheme,
  tSec: number,
  width: number,
  height: number,
  horizonY: number,
): void {
  const ramp = cur.weather.ramp;
  const fogTone = cur.flags.isNight ? '#8E8C80' : '#EDEBDF';
  const bandAlphas = [0.09, 0.18, 0.24, 0.18, 0.09];
  for (let fb = 0; fb < 3; fb++) {
    const fsp = 6 + fb * 4;
    const fby = 132 + fb * 38;
    const fbx = ((tSec * fsp + fb * 210) % 760) - 260;
    for (let fs = 0; fs < 5; fs++) {
      const x = fbx + Math.sin(fb * 3 + fs * 1.7) * 14;
      const [y, h] = vSpan(fby + fs * 5, fby + fs * 5 + 6, horizonY, height);
      rect(k, mapX(x, width), y, mapX(500, width), h, fogTone, bandAlphas[fs]! * ramp);
    }
  }
  const [overlayY, overlayH] = vSpan(60, 270, horizonY, height);
  rect(k, 0, overlayY, width, overlayH, fogTone, 0.13 * ramp);
}

/** The one front-of-creatures touch: a faint veil low in the frame. */
function drawFogFront(k: KAPLAYCtx, cur: ResolvedTheme, width: number, height: number, horizonY: number): void {
  const ramp = cur.weather.ramp;
  const fogTone = cur.flags.isNight ? '#8E8C80' : '#EDEBDF';
  const alpha = (cur.flags.isNight ? 0.1 : 0.08) * ramp;
  const [y, h] = vSpan(150, 270, horizonY, height);
  rect(k, 0, y, width, h, fogTone, alpha);
}

function drawWind(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number, width: number, height: number, horizonY: number): void {
  const ramp = cur.weather.ramp;
  const foliage = sc(cur, cur.tokens.foliage);
  const foliageLite = sc(cur, cur.tokens.foliageLite);
  for (let i = 0; i < 20; i++) {
    const w1 = frac(i * 0.6180339);
    const w2 = frac(i * 0.7548776);
    const colour = i % 2 ? foliageLite : foliage;
    const wx = ((w1 * 560 + tSec * (120 + w2 * 70)) % 560) - 40;
    const wy = 54 + w2 * 170 + Math.sin(tSec * 2 + i) * 6;
    rect(k, mapX(wx, width), mapY(wy, horizonY, height), 6, 3, colour, 0.85 * ramp);
  }
  const base = (tSec * 150) % 480;
  const [gy1, gh1] = vSpan(90, 93, horizonY, height);
  rect(k, mapX(base, width), gy1, mapX(70, width), gh1, '#FFFFFF', 0.16 * ramp);
  const [gy2, gh2] = vSpan(140, 143, horizonY, height);
  rect(k, mapX((base + 200) % 480, width), gy2, mapX(54, width), gh2, '#FFFFFF', 0.16 * ramp);
  const [gy3, gh3] = vSpan(200, 203, horizonY, height);
  rect(k, mapX((base + 340) % 480, width), gy3, mapX(60, width), gh3, '#FFFFFF', 0.16 * ramp);
}

function drawLeaves(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number, width: number, height: number, horizonY: number): void {
  const ramp = cur.weather.ramp;
  const lc = ['#D97757', '#E2B45E', '#C96A4A', '#E58C68'];
  for (let i = 0; i < 20; i++) {
    const l1 = frac(i * 0.6180339);
    const l2 = frac(i * 0.7548776);
    const colour = cc(cur, lc[i % 4]!);
    const lx = l1 * 480 + Math.sin(tSec * (0.5 + l2 * 0.4) + i) * 18;
    const ly = (((l2 * 900) + tSec * (18 + l1 * 22)) % 300) - 10;
    const w = i % 3 ? 6 : 5;
    rect(k, mapX(lx, width), mapY(ly, horizonY, height), w, 3, colour, 0.9 * ramp);
  }
}

function drawHeatShimmer(
  k: KAPLAYCtx,
  cur: ResolvedTheme,
  tSec: number,
  width: number,
  height: number,
  horizonY: number,
): void {
  if (cur.flags.isNight) return;
  const ramp = cur.weather.ramp;
  for (let hl = 0; hl < 3; hl++) {
    for (let hxp = 0; hxp < 480; hxp += 12) {
      const hy = 170 - hl * 13 + Math.sin(hxp * 0.08 + tSec * 2.5 + hl * 2) * 3;
      rect(k, mapX(hxp, width), mapY(hy, horizonY, height), 7, 2, '#FFF6D8', 0.3 * ramp);
    }
  }
}

// ---------------------------------------------------------------------------
// mountWeather — the stateful KAPLAY layer.
// ---------------------------------------------------------------------------

export interface WeatherLayer {
  update(t: ResolvedTheme): void;
}

/**
 * Two screen-fixed draw objects (`behind` the creatures, `front` of them)
 * plus one fixed screen-space object for the storm's white flash, plus the
 * rainbow's own retained root (built/destroyed from `update()`, see below).
 * `onDraw` is the one deliberately per-frame path in this scene — everywhere
 * else prefers retained KAPLAY objects — so each branch below is kept to a
 * modest handful of `k.drawRect` calls; see the file header for the
 * coordinate contract and scaling classes each branch uses.
 *
 * `update()` is called from village.ts's `applyTheme` walker, which only
 * runs when the resolved theme actually changes (a tick crossing a minute, a
 * weather override flip) — not every frame. Per-frame motion instead reads
 * `performance.now()` live inside each `onDraw`, the same split sky.ts uses
 * between its own `update()` (positions/visibility) and its `onUpdate`
 * twinkle loops.
 */
export function mountWeather(k: KAPLAYCtx): WeatherLayer {
  // Cheap to poll every frame; re-creating the MediaQueryList every frame
  // would not be. No `window` at all in the node test environment, hence the
  // guard — mirrors sky.ts's own `mountSky`.
  const reducedMotionMQL =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reducedMotion = () => reducedMotionMQL?.matches ?? false;

  const liveT = () => (reducedMotion() ? REDUCED_MOTION_T : performance.now() / 1000);

  let current: ResolvedTheme | null = null;

  const behind = k.add([k.pos(0, 0), k.z(5), k.fixed()]);
  behind.onDraw(() => {
    const cur = current;
    if (!cur) return;
    const t = liveT();
    const reduced = reducedMotion();
    const width = k.width();
    const height = k.height();
    const horizonY = horizonScreenY(k);
    // The camera's x expressed in reference px — the parallax input. Screen-
    // fixed objects never move with the camera on their own, so this is the
    // one place the world's pan reaches the sky, scaled per depth layer
    // inside the cloud materializer.
    const camRefX = k.getCamPos().x / fx(width);

    // Fair-weather clouds are ambient sky furniture, not weather — they draw
    // at every phase of the sky (design delta to spec §5: dusk gets embers,
    // night gets moonlit slate, instead of a cloudless void), which is a
    // wider gate than the ramp-driven weather switch below (and must run
    // even when `kind === 'clear'`, which that switch bails out of
    // entirely). They crossfade out via `overcastRamp` rather than gating on
    // `flags.overcast` (`ramp > 0.5`): in journey mode `ramp` is continuous,
    // so a binary gate let overcast blobs (drawn below, from `ramp > 0.02`)
    // render simultaneously with fair clouds below 0.5 and then pop the fair
    // clouds out in a single frame at the 0.5 crossing.
    {
      const phase: SkyPhase = cur.flags.isNight
        ? 'night'
        : cur.flags.isDusk
          ? 'dusk'
          : cur.flags.isDawn
            ? 'dawn'
            : 'day';
      const overcastRamp = OVERCAST.has(cur.weather.kind) ? cur.weather.ramp : 0;
      drawFairClouds(k, phase, t, camRefX, width, horizonY, overcastRamp);
    }

    if (cur.weather.kind === 'clear' || cur.weather.ramp <= 0.02) return;
    switch (cur.weather.kind) {
      case 'rain':
        drawOvercastCloudBlobs(k, 'rain', cur.flags.isNight, cur.weather.ramp, t, camRefX, width, horizonY);
        drawRainAndSplashes(k, cur, t, reduced, width, height, horizonY);
        break;
      case 'storm':
        drawRainAndSplashes(k, cur, t, reduced, width, height, horizonY);
        drawStormClouds(k, cur, t, width, height, horizonY);
        drawLightning(k, cur, t, reduced, width, height, horizonY);
        break;
      case 'snow':
        drawOvercastCloudBlobs(k, 'snow', cur.flags.isNight, cur.weather.ramp, t, camRefX, width, horizonY);
        drawSnow(k, cur, t, width, height, horizonY);
        break;
      case 'fog':
        drawOvercastCloudBlobs(k, 'fog', cur.flags.isNight, cur.weather.ramp, t, camRefX, width, horizonY);
        drawFogBehind(k, cur, t, width, height, horizonY);
        break;
      case 'cloudy':
        drawOvercastCloudBlobs(k, 'cloudy', cur.flags.isNight, cur.weather.ramp, t, camRefX, width, horizonY);
        break;
      case 'wind':
        drawWind(k, cur, t, width, height, horizonY);
        break;
      case 'leaves':
        drawLeaves(k, cur, t, width, height, horizonY);
        break;
      case 'heat':
        drawHeatShimmer(k, cur, t, width, height, horizonY);
        break;
      default:
        break;
    }
  });

  const front = k.add([k.pos(0, 0), k.z(10000), k.fixed()]);
  front.onDraw(() => {
    const cur = current;
    if (!cur || cur.weather.kind === 'clear' || cur.weather.ramp <= 0.02) return;
    if (cur.weather.kind === 'fog') {
      drawFogFront(k, cur, k.width(), k.height(), horizonScreenY(k));
    }
  });

  // The storm flash is screen-space like the rest of this layer (`behind`
  // and `front` above are `k.fixed()` too, since the screen-space rescale) —
  // what sets it apart is being a full-viewport overlay: a bolt should
  // whiten the whole screen for an instant, not just wherever the other two
  // objects happen to be drawing.
  const flash = k.add([k.pos(0, 0), k.z(10000), k.fixed()]);
  flash.onDraw(() => {
    const cur = current;
    if (!cur || cur.weather.kind !== 'storm' || cur.weather.ramp <= 0.02) return;
    if (reducedMotion()) return; // no flash under reduced motion (3d)
    const strike = activeStrike(liveT());
    if (!strike) return;
    const env = strikeEnvelope(strike.dt);
    if (env.flash <= 0) return;
    k.drawRect({
      pos: k.vec2(0, 0),
      width: k.width(),
      height: k.height(),
      color: k.Color.fromHex('#FFFFFF'),
      opacity: 0.12 * env.flash * cur.weather.ramp,
    });
  });

  // --- Rainbow: retained object, rebuilt only when the weather enters
  // `rainbow` or the viewport moves. KAPLAY does not cascade a parent's
  // opacity down to its children (only pos/scale/rotation compose through
  // the render transform stack), so each block's own opacity is what gets
  // updated on publish, even though conceptually this is "the root's
  // opacity."
  let rainbowRoot: GameObj | null = null;
  let rainbowBlockObjs: GameObj[] = [];
  let rainbowBuiltWidth = 0;
  let rainbowBuiltHorizonY = 0;

  function rebuildRainbow(width: number, height: number, horizonY: number): void {
    rainbowRoot?.destroy();
    const root = k.add([k.pos(0, 0), k.z(5), k.fixed()]);
    rainbowBlockObjs = [];
    for (const blk of rainbowBlocks(width, horizonY)) {
      if (blk.y > height) continue;
      const obj = root.add([
        k.rect(blk.size, blk.size),
        k.pos(blk.x, blk.y),
        k.color(k.Color.fromHex(RAINBOW_BAND_COLOURS[blk.band]!)),
        k.opacity(1),
      ]);
      rainbowBlockObjs.push(obj);
    }
    rainbowRoot = root;
  }

  return {
    update(t: ResolvedTheme) {
      current = t;

      // Rainbow: built/destroyed here (not in onDraw) per the retained-object
      // design — the arc is expensive to regenerate every frame and doesn't
      // need to be, since it only depends on the weather kind, night flag,
      // and viewport geometry, all of which only change on a publish.
      const wantsRainbow = t.weather.kind === 'rainbow' && !t.flags.isNight;
      if (wantsRainbow) {
        const width = k.width();
        const height = k.height();
        const horizonY = horizonScreenY(k);
        if (!rainbowRoot || Math.abs(width - rainbowBuiltWidth) > 1 || Math.abs(horizonY - rainbowBuiltHorizonY) > 1) {
          rebuildRainbow(width, height, horizonY);
          rainbowBuiltWidth = width;
          rainbowBuiltHorizonY = horizonY;
        }
        const alpha = 0.72 * t.weather.ramp;
        for (const obj of rainbowBlockObjs) obj.opacity = alpha;
      } else if (rainbowRoot) {
        rainbowRoot.destroy();
        rainbowRoot = null;
        rainbowBlockObjs = [];
      }

      // Umbrellas: creature.ts seeds ownership per id and creates the 5
      // rects (1 stick + 4 canopy) hidden by default, all tagged
      // 'themed:umbrella' for visibility here. The stick also carries the
      // ordinary 'themed:wood' tag so village.ts's generic per-token walker
      // keeps its colour in step with every other wood-token prop; the
      // canopy rects carry no generic token tag; the 'themed:umbrella:canopy'
      // sub-tag makes this the *sole* colour owner for those 4, the same
      // "one owner per tag" rule house windows use in village.ts.
      const rainOn = (t.weather.kind === 'rain' || t.weather.kind === 'storm') && t.weather.ramp > 0.5;
      for (const obj of k.get('themed:umbrella', { recursive: true })) {
        (obj as unknown as { hidden: boolean }).hidden = !rainOn;
      }
      const canopyColour = k.Color.fromHex(cc(t, t.tokens.accent));
      for (const obj of k.get('themed:umbrella:canopy', { recursive: true })) {
        (obj as unknown as { color: unknown }).color = canopyColour;
      }
    },
  };
}
