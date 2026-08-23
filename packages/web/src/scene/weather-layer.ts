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
 * frame, same as sky.ts's own fixed objects.
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

interface CloudRectDef {
  dx: number;
  y: number;
  w: number;
  h: number;
}

interface CloudClusterDef {
  /** Reference-space x of the cluster's first rect — the class-2 anchor before drift. */
  baseX: number;
  rects: CloudRectDef[];
}

export interface CloudBlobSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
}

/**
 * Materializes a set of class-2 clusters at one instant: each cluster's
 * anchor drifts leftward in reference space at `speed` ref px/s, wrapping
 * over a 560 ref-px period into `[-40, 520)` — the same `(x % 560) - 40`
 * shape `drawWind`'s flecks use below, but wrapped with `wrap` instead of
 * raw `%`: `drawWind` always *adds* a `tSec` term (drift rightward), while
 * this drift *subtracts* an unbounded one (leftward), which would send a
 * plain `%` negative once `tSec * speed` outgrows the anchor. Plan-over-
 * reference deviation: the reference paints these clusters static; a
 * scrolling camera would pin them to one screen spot forever.
 */
function driftedClusterRects(
  clusters: readonly CloudClusterDef[],
  speed: number,
  tSec: number,
  width: number,
  horizonY: number,
): { x: number; y: number; w: number; h: number }[] {
  const s = fy(horizonY);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const cluster of clusters) {
    const driftedRefX = wrap(cluster.baseX + 560 - tSec * speed, 560) - 40;
    const anchorX = mapX(driftedRefX, width);
    for (const r of cluster.rects) {
      out.push({ x: anchorX + r.dx * s, y: r.y * s, w: r.w * s, h: r.h * s });
    }
  }
  return out;
}

/** The reference's four overcast clusters (village-scene.js lines 300–303), verbatim. */
const OVERCAST_CLOUD_CLUSTERS: readonly CloudClusterDef[] = [
  { baseX: 14, rects: [{ dx: 0, y: 18, w: 96, h: 14 }, { dx: 18, y: 10, w: 52, h: 10 }] },
  { baseX: 150, rects: [{ dx: 0, y: 40, w: 74, h: 12 }] },
  { baseX: 248, rects: [{ dx: 0, y: 14, w: 112, h: 16 }, { dx: 22, y: 6, w: 62, h: 10 }] },
  { baseX: 384, rects: [{ dx: 0, y: 42, w: 82, h: 12 }] },
];

/** Base (day) tone per overcast kind, verbatim from the reference's `cTone` ternary (`storm` excluded — it keeps its own deck clouds, no blobs). */
const OVERCAST_TONE: Record<'cloudy' | 'rain' | 'snow' | 'fog', string> = {
  cloudy: '#B4BABE', rain: '#9AA6AE', snow: '#C8D0D6', fog: '#CFCCC0',
};

/**
 * Overcast cloud blobs for the four non-storm overcast kinds — the
 * reference's `else if (overcast)` branch, under which `cloudy` previously
 * drew nothing. Alpha is the reference's flat 0.85; callers multiply by
 * `weather.ramp` themselves, since this function has no `ResolvedTheme` to
 * read it from.
 */
export function overcastCloudSpecs(
  kind: 'cloudy' | 'rain' | 'snow' | 'fog',
  night: boolean,
  tSec: number,
  width: number,
  horizonY: number,
): CloudBlobSpec[] {
  const tone = OVERCAST_TONE[kind];
  const color = night ? mix(tone, '#1A2028', 0.5) : tone;
  return driftedClusterRects(OVERCAST_CLOUD_CLUSTERS, 3, tSec, width, horizonY).map((r) => ({ ...r, color, alpha: 0.85 }));
}

/** The reference's always-on fair-weather cluster (village-scene.js line 307): present at both dawn and full day. */
const FAIR_CLOUD_ALWAYS: CloudClusterDef = { baseX: 70, rects: [{ dx: 0, y: 42, w: 40, h: 10 }, { dx: 10, y: 34, w: 24, h: 8 }] };

/** The reference's "day only" second cluster (village-scene.js line 308) — withheld at dawn. */
const FAIR_CLOUD_DAY_ONLY: CloudClusterDef = { baseX: 270, rects: [{ dx: 0, y: 66, w: 34, h: 9 }, { dx: 8, y: 59, w: 20, h: 7 }] };

/**
 * Fair-weather clouds — the reference's `else if (time==='day'||dawn)`
 * branch. Sky furniture, not weather: base alpha is 0.75, independent of the
 * weather switch's own `ramp` gate (present on every clear day).
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
  dawn: boolean,
  tSec: number,
  width: number,
  horizonY: number,
  overcastRamp: number,
): CloudBlobSpec[] {
  const color = dawn ? '#FFF3E0' : '#FFFFFF';
  const alpha = 0.75 * (1 - clamp01(overcastRamp));
  const clusters = dawn ? [FAIR_CLOUD_ALWAYS] : [FAIR_CLOUD_ALWAYS, FAIR_CLOUD_DAY_ONLY];
  return driftedClusterRects(clusters, 1.5, tSec, width, horizonY).map((r) => ({ ...r, color, alpha }));
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
// Storm timing — shared between the in-scene bolt and the front-of-screen flash.
// ---------------------------------------------------------------------------

function stormPhase(tSec: number): number {
  return tSec % 4.5;
}

/** The brief white full-screen flash: a short beat near the top of the cycle. */
function isFlashNow(tSec: number, reduced: boolean): boolean {
  return !reduced && stormPhase(tSec) < 0.14;
}

/** The bolt graphic itself: on during the flash, plus a longer afterglow window. */
function isBoltOn(tSec: number, reduced: boolean): boolean {
  if (reduced) return true;
  const ph = stormPhase(tSec);
  return isFlashNow(tSec, reduced) || (ph > 0.22 && ph < 0.3);
}

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
  reduced: boolean,
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

  // In-cloud flicker on its own beat, offset from the bolt: class-2 cluster.
  const ph2 = tSec % 4.5;
  if (!reduced && ph2 > 1.7 && ph2 < 1.88) {
    rect(k, mapX(96, width), mapY(12, horizonY, height), 84 * s, 34 * s, '#E8DFA8', 0.3 * ramp);
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

  // The bolt: unchanged timing/rect count from before this wave (Task 3
  // replaces the whole mechanism); only its coordinates move through the
  // class-2 rules, anchored at mapX(312, width).
  if (isBoltOn(tSec, reduced)) {
    const anchorX = mapX(312, width);
    rect(k, anchorX, mapY(14, horizonY, height), 16 * s, 110 * s, '#FFEFA0', 0.18 * ramp);
    rect(k, anchorX + 6 * s, mapY(14, horizonY, height), 5 * s, 28 * s, '#FFE896', ramp);
    rect(k, anchorX, mapY(40, horizonY, height), 5 * s, 22 * s, '#FFE896', ramp);
    rect(k, anchorX + 8 * s, mapY(60, horizonY, height), 5 * s, 26 * s, '#FFE896', ramp);
    rect(k, anchorX + 3 * s, mapY(84, horizonY, height), 4 * s, 18 * s, '#FFE896', ramp);
    rect(k, anchorX + 14 * s, mapY(46, horizonY, height), 8 * s, 4 * s, '#FFE896', ramp);
  }
}

/** Overcast cloud blobs for `cloudy`/`rain`/`snow`/`fog` — drawn before the kind's own precipitation so precip falls in front. `storm` keeps its decks instead (see `drawStormClouds`); no blobs there. */
function drawOvercastCloudBlobs(
  k: KAPLAYCtx,
  kind: 'cloudy' | 'rain' | 'snow' | 'fog',
  night: boolean,
  ramp: number,
  tSec: number,
  width: number,
  horizonY: number,
): void {
  for (const b of overcastCloudSpecs(kind, night, tSec, width, horizonY)) {
    rect(k, b.x, b.y, b.w, b.h, b.color, b.alpha * ramp);
  }
}

/** Fair-weather clouds — sky furniture, crossfading out via `overcastRamp` (see `fairCloudSpecs`). */
function drawFairClouds(
  k: KAPLAYCtx,
  dawn: boolean,
  tSec: number,
  width: number,
  horizonY: number,
  overcastRamp: number,
): void {
  if (overcastRamp >= 1) return; // fully replaced by overcast blobs — alpha would be 0 anyway
  for (const b of fairCloudSpecs(dawn, tSec, width, horizonY, overcastRamp)) {
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

    // Fair-weather clouds are sky furniture, not weather — they draw
    // whenever the sky itself isn't night/dusk, which is a wider gate than
    // the ramp-driven weather switch below (and must run even when
    // `kind === 'clear'`, which that switch bails out of entirely). They
    // crossfade out via `overcastRamp` rather than gating on
    // `flags.overcast` (`ramp > 0.5`): in journey mode `ramp` is continuous,
    // so a binary gate let overcast blobs (drawn below, from `ramp > 0.02`)
    // render simultaneously with fair clouds below 0.5 and then pop the fair
    // clouds out in a single frame at the 0.5 crossing.
    if (!cur.flags.isNight && !cur.flags.isDusk) {
      const overcastRamp = OVERCAST.has(cur.weather.kind) ? cur.weather.ramp : 0;
      drawFairClouds(k, cur.flags.isDawn, t, width, horizonY, overcastRamp);
    }

    if (cur.weather.kind === 'clear' || cur.weather.ramp <= 0.02) return;
    switch (cur.weather.kind) {
      case 'rain':
        drawOvercastCloudBlobs(k, 'rain', cur.flags.isNight, cur.weather.ramp, t, width, horizonY);
        drawRainAndSplashes(k, cur, t, reduced, width, height, horizonY);
        break;
      case 'storm':
        drawRainAndSplashes(k, cur, t, reduced, width, height, horizonY);
        drawStormClouds(k, cur, t, reduced, width, height, horizonY);
        break;
      case 'snow':
        drawOvercastCloudBlobs(k, 'snow', cur.flags.isNight, cur.weather.ramp, t, width, horizonY);
        drawSnow(k, cur, t, width, height, horizonY);
        break;
      case 'fog':
        drawOvercastCloudBlobs(k, 'fog', cur.flags.isNight, cur.weather.ramp, t, width, horizonY);
        drawFogBehind(k, cur, t, width, height, horizonY);
        break;
      case 'cloudy':
        drawOvercastCloudBlobs(k, 'cloudy', cur.flags.isNight, cur.weather.ramp, t, width, horizonY);
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

  // The storm flash is a screen effect, not a world one — a bolt should
  // whiten the whole viewport for an instant, not just the strip currently
  // in frame, so this object is `k.fixed()` unlike `behind`/`front` above.
  const flash = k.add([k.pos(0, 0), k.z(10000), k.fixed()]);
  flash.onDraw(() => {
    const cur = current;
    if (!cur || cur.weather.kind !== 'storm' || cur.weather.ramp <= 0.02) return;
    const t = liveT();
    if (!isFlashNow(t, reducedMotion())) return;
    k.drawRect({
      pos: k.vec2(0, 0),
      width: k.width(),
      height: k.height(),
      color: k.Color.fromHex('#FFFFFF'),
      opacity: 0.22 * cur.weather.ramp,
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
