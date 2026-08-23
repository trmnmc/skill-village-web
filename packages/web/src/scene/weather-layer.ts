import type { KAPLAYCtx } from 'kaplay';
import { HUES } from '@village/core/visual';
import type { ResolvedTheme } from '../theme/store.js';
import { mix } from '../theme/palettes.js';
import { WORLD_W, GROUND_TOP } from '../layout/zones.js';

/**
 * Transcribed from `reference/palette-explorations/village-scene.js`'s
 * `drawScene` — the weather branches, from the `/* --- weather layers... *\/`
 * comment through the storm bolt and fog veil. That file is a 480x270
 * <canvas> preview with sky rows [0,182) and ground rows [182,270); the game
 * draws a WORLD_W-wide strip with sky [0, GROUND_TOP) and ground below it.
 *
 * Scaling convention used throughout this file, matching the task brief:
 *  - POSITIONS scale: every x is multiplied by SCALE_X, every y by SCALE_Y
 *    (or, for the ground-band splash ticks, by the explicit groundBandY
 *    map) — computed on the *final* reference-space coordinate, after every
 *    modulo/formula constant has been applied verbatim, so speeds and
 *    periods carry through correctly for free (scaling a wrapped value by a
 *    positive constant is the same as scaling the value and its period
 *    before wrapping).
 *  - SIZES of individual "confetti" particles (a raindrop streak, a
 *    snowflake, a splash tick, a wind fleck, a leaf, a heat-shimmer dash)
 *    stay literal/unscaled — the same choice sky.ts already made for stars
 *    and fireflies, so a rain streak reads as a small fixed pixel mark
 *    regardless of how wide the world strip is.
 *  - SIZES of background "panel" shapes that are meant to span a proportion
 *    of the scene (storm cloud decks, rain shafts, fog bands, the ground
 *    mist strip, wind gust streaks) scale on both axes like a position, the
 *    same way village.ts's own sky/ground bands use WORLD_W directly.
 *
 * All numeric constants (speeds, alphas, phase windows, the rainbow's
 * radius steps) are ported verbatim except the rainbow arc's angle-step
 * (reference: 0.025 rad, ~630 rects/frame across 5 bands) — coarsened to
 * 0.12 rad to fit this layer's own "keep it under ~150 drawRect calls per
 * frame" budget; a blocky 4x4-pixel arc is not visibly different at this
 * lower sample density.
 */

const SCALE_X = WORLD_W / 480;
const SCALE_Y = GROUND_TOP / 182;

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
 * One rain streak, verbatim from the reference's rain loop (`heavy` selects
 * the storm variant: faster, longer, steeper slant). `i` is the drop index
 * (0..rn), `tSec` the animation clock.
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
  return { x: refX * SCALE_X, y: refY * SCALE_Y, len, alpha };
}

export interface SnowFlake {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

/** One snowflake, verbatim from the reference's snow loop. */
export function snowFlake(i: number, tSec: number): SnowFlake {
  const s1 = frac(i * 0.6180339);
  const s2 = frac(i * 0.7548776);
  const s3 = frac(i * 0.5698402);
  const fall = 13 + s3 * 17;
  const refY = (((s1 * 900) + tSec * fall) % 285) - 5;
  const refX = s2 * 480 + Math.sin(tSec * (0.35 + s3 * 0.5) + i) * (6 + s1 * 10);
  const size = s1 < 0.15 ? 3 : 2;
  const alpha = 0.3 + s3 * 0.5;
  return { x: refX * SCALE_X, y: refY * SCALE_Y, size, alpha };
}

/**
 * Reference y 194..264 (the splash band, just below the ground line) mapped
 * onto world y [GROUND_TOP+14, GROUND_TOP+250] — the brief's explicit
 * ground-band mapping, distinct from the constant SCALE_Y used for
 * sky-space effects.
 */
function groundBandY(refY: number): number {
  const t = (refY - 194) / (264 - 194);
  return GROUND_TOP + 14 + t * (250 - 14);
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
// Per-weather draw branches — behind the creatures.
// ---------------------------------------------------------------------------

function drawRainAndSplashes(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number, reduced: boolean): void {
  const { weather, tokens, flags } = cur;
  const ramp = weather.ramp;
  const heavy = weather.kind === 'storm';
  const rn = heavy ? 100 : 70;
  const dropColour = flags.isNight ? '#AEC2D2' : mix(tokens.sky1, '#FFFFFF', 0.45);
  for (let i = 0; i < rn; i++) {
    const d = rainDrop(i, tSec, heavy);
    rect(k, d.x, d.y, 2, d.len, dropColour, d.alpha * ramp);
  }

  const splashColour = flags.isNight ? '#C3D4E2' : mix(tokens.sky1, '#FFFFFF', 0.55);
  const sn = heavy ? 14 : 8;
  for (let i = 0; i < sn; i++) {
    const cyc = frac(tSec * 1.3 + i * 0.37);
    if (cyc > 0.28 && !reduced) continue;
    const sxRef = frac(i * 0.6180339) * 466 + 4;
    const syRef = 194 + frac(i * 0.7548776) * 70;
    const alpha = (reduced ? 0.35 : 0.4 * (1 - cyc / 0.28)) * ramp;
    const sy = groundBandY(syRef);
    rect(k, (sxRef - 3) * SCALE_X, sy, 2, 2, splashColour, alpha);
    rect(k, (sxRef + 3) * SCALE_X, sy, 2, 2, splashColour, alpha);
  }
}

function drawStormClouds(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number, reduced: boolean): void {
  const { weather, flags } = cur;
  const ramp = weather.ramp;
  const night = flags.isNight;
  const deckFar = night ? '#2C343C' : '#68727A';
  const deckNear = night ? '#20272E' : '#4A545C';
  const deckRim = night ? '#39424B' : '#7E888F';
  const drift1 = (tSec * 3) % 520;
  const drift2 = (tSec * 6) % 520;

  for (let cf = 0; cf < 3; cf++) {
    const cfx = ((cf * 190 + drift1) % 660) - 90;
    rect(k, cfx * SCALE_X, 2 * SCALE_Y, 168 * SCALE_X, 20 * SCALE_Y, deckFar, ramp);
    rect(k, (cfx + 24) * SCALE_X, 20 * SCALE_Y, 120 * SCALE_X, 8 * SCALE_Y, deckFar, ramp);
  }

  const shaftColour = night ? '#4A5862' : '#8C9AA4';
  for (let sh = 0; sh < 3; sh++) {
    const shx = ((sh * 176 + drift1 * 0.6) % 520) - 20;
    for (let sk = 0; sk < 5; sk++) {
      const alpha = (0.1 - sk * 0.016) * ramp;
      rect(k, (shx + sk * 3) * SCALE_X, 30 * SCALE_Y, (30 - sk * 4) * SCALE_X, 150 * SCALE_Y, shaftColour, alpha);
    }
  }

  const ph2 = tSec % 4.5;
  if (!reduced && ph2 > 1.7 && ph2 < 1.88) {
    rect(k, 96 * SCALE_X, 12 * SCALE_Y, 84 * SCALE_X, 34 * SCALE_Y, '#E8DFA8', 0.3 * ramp);
  }

  for (let cn = 0; cn < 4; cn++) {
    const cnx = ((cn * 150 + drift2) % 640) - 100;
    const cny = 24 + (cn % 2) * 12;
    rect(k, (cnx + 8) * SCALE_X, (cny - 3) * SCALE_Y, 118 * SCALE_X, 3 * SCALE_Y, deckRim, ramp);
    rect(k, cnx * SCALE_X, cny * SCALE_Y, 134 * SCALE_X, 24 * SCALE_Y, deckNear, ramp);
    rect(k, (cnx + 18) * SCALE_X, (cny + 24) * SCALE_Y, 96 * SCALE_X, 9 * SCALE_Y, deckNear, ramp);
  }

  rect(k, 0, 172 * SCALE_Y, WORLD_W, 16 * SCALE_Y, '#FFFFFF', 0.08 * ramp);

  if (isBoltOn(tSec, reduced)) {
    rect(k, 312 * SCALE_X, 14 * SCALE_Y, 16 * SCALE_X, 110 * SCALE_Y, '#FFEFA0', 0.18 * ramp);
    rect(k, 318 * SCALE_X, 14 * SCALE_Y, 5 * SCALE_X, 28 * SCALE_Y, '#FFE896', ramp);
    rect(k, 312 * SCALE_X, 40 * SCALE_Y, 5 * SCALE_X, 22 * SCALE_Y, '#FFE896', ramp);
    rect(k, 320 * SCALE_X, 60 * SCALE_Y, 5 * SCALE_X, 26 * SCALE_Y, '#FFE896', ramp);
    rect(k, 315 * SCALE_X, 84 * SCALE_Y, 4 * SCALE_X, 18 * SCALE_Y, '#FFE896', ramp);
    rect(k, 326 * SCALE_X, 46 * SCALE_Y, 8 * SCALE_X, 4 * SCALE_Y, '#FFE896', ramp);
  }
}

function drawSnow(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number): void {
  const ramp = cur.weather.ramp;
  for (let i = 0; i < 60; i++) {
    const f = snowFlake(i, tSec);
    rect(k, f.x, f.y, f.size, f.size, '#FFFFFF', f.alpha * ramp);
  }
}

function drawFogBehind(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number): void {
  const ramp = cur.weather.ramp;
  const fogTone = cur.flags.isNight ? '#8E8C80' : '#EDEBDF';
  const bandAlphas = [0.09, 0.18, 0.24, 0.18, 0.09];
  for (let fb = 0; fb < 3; fb++) {
    const fsp = 6 + fb * 4;
    const fby = 132 + fb * 38;
    const fbx = ((tSec * fsp + fb * 210) % 760) - 260;
    for (let fs = 0; fs < 5; fs++) {
      const x = fbx + Math.sin(fb * 3 + fs * 1.7) * 14;
      rect(k, x * SCALE_X, (fby + fs * 5) * SCALE_Y, 500 * SCALE_X, 6 * SCALE_Y, fogTone, bandAlphas[fs]! * ramp);
    }
  }
  rect(k, 0, 60 * SCALE_Y, WORLD_W, 210 * SCALE_Y, fogTone, 0.13 * ramp);
}

/** The one front-of-creatures touch: a faint veil low in the frame. */
function drawFogFront(k: KAPLAYCtx, cur: ResolvedTheme): void {
  const ramp = cur.weather.ramp;
  const fogTone = cur.flags.isNight ? '#8E8C80' : '#EDEBDF';
  const alpha = (cur.flags.isNight ? 0.1 : 0.08) * ramp;
  rect(k, 0, 150 * SCALE_Y, WORLD_W, 120 * SCALE_Y, fogTone, alpha);
}

function drawWind(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number): void {
  const ramp = cur.weather.ramp;
  const foliage = sc(cur, cur.tokens.foliage);
  const foliageLite = sc(cur, cur.tokens.foliageLite);
  for (let i = 0; i < 20; i++) {
    const w1 = frac(i * 0.6180339);
    const w2 = frac(i * 0.7548776);
    const colour = i % 2 ? foliageLite : foliage;
    const wx = ((w1 * 560 + tSec * (120 + w2 * 70)) % 560) - 40;
    const wy = 54 + w2 * 170 + Math.sin(tSec * 2 + i) * 6;
    rect(k, wx * SCALE_X, wy * SCALE_Y, 6, 3, colour, 0.85 * ramp);
  }
  const base = (tSec * 150) % 480;
  rect(k, base * SCALE_X, 90 * SCALE_Y, 70 * SCALE_X, 3 * SCALE_Y, '#FFFFFF', 0.16 * ramp);
  rect(k, ((base + 200) % 480) * SCALE_X, 140 * SCALE_Y, 54 * SCALE_X, 3 * SCALE_Y, '#FFFFFF', 0.16 * ramp);
  rect(k, ((base + 340) % 480) * SCALE_X, 200 * SCALE_Y, 60 * SCALE_X, 3 * SCALE_Y, '#FFFFFF', 0.16 * ramp);
}

function drawLeaves(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number): void {
  const ramp = cur.weather.ramp;
  const lc = ['#D97757', '#E2B45E', '#C96A4A', '#E58C68'];
  for (let i = 0; i < 20; i++) {
    const l1 = frac(i * 0.6180339);
    const l2 = frac(i * 0.7548776);
    const colour = cc(cur, lc[i % 4]!);
    const lx = l1 * 480 + Math.sin(tSec * (0.5 + l2 * 0.4) + i) * 18;
    const ly = (((l2 * 900) + tSec * (18 + l1 * 22)) % 300) - 10;
    const w = i % 3 ? 6 : 5;
    rect(k, lx * SCALE_X, ly * SCALE_Y, w, 3, colour, 0.9 * ramp);
  }
}

/** [HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]] — the reference's exact band order. */
function rainbowBands(): string[] {
  return [HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]];
}

/**
 * Angle step coarsened from the reference's 0.025 rad to 0.12 rad — see the
 * file header comment on the rect-count budget.
 */
const RAINBOW_STEP = 0.12;

function drawRainbow(k: KAPLAYCtx, cur: ResolvedTheme): void {
  if (cur.flags.isNight) return;
  const ramp = cur.weather.ramp;
  const alpha = 0.72 * ramp;
  const bands = rainbowBands();
  for (let b = 0; b < 5; b++) {
    const rr = 170 - b * 6;
    for (let a = Math.PI; a <= Math.PI * 2; a += RAINBOW_STEP) {
      const ax = 240 + Math.cos(a) * rr;
      const ay = 265 + Math.sin(a) * rr;
      if (ay < 0) continue;
      const px = Math.round(ax / 4) * 4;
      const py = Math.round(ay / 4) * 4;
      rect(k, px * SCALE_X, py * SCALE_Y, 4, 4, bands[b]!, alpha);
    }
  }
}

function drawHeatShimmer(k: KAPLAYCtx, cur: ResolvedTheme, tSec: number): void {
  if (cur.flags.isNight) return;
  const ramp = cur.weather.ramp;
  for (let hl = 0; hl < 3; hl++) {
    for (let hxp = 0; hxp < 480; hxp += 12) {
      const hy = 170 - hl * 13 + Math.sin(hxp * 0.08 + tSec * 2.5 + hl * 2) * 3;
      rect(k, hxp * SCALE_X, hy * SCALE_Y, 7, 2, '#FFF6D8', 0.3 * ramp);
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
 * Two world-space draw objects (`behind` the creatures, `front` of them) plus
 * one fixed screen-space object for the storm's white flash. `onDraw` is the
 * one deliberately per-frame path in this scene — everywhere else prefers
 * retained KAPLAY objects — so each branch below is kept to a modest handful
 * of `k.drawRect` calls; see the file header for the rect-count budget.
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

  const behind = k.add([k.pos(0, 0), k.z(5)]);
  behind.onDraw(() => {
    const cur = current;
    if (!cur || cur.weather.kind === 'clear' || cur.weather.ramp <= 0.02) return;
    const t = liveT();
    const reduced = reducedMotion();
    switch (cur.weather.kind) {
      case 'rain':
        drawRainAndSplashes(k, cur, t, reduced);
        break;
      case 'storm':
        drawRainAndSplashes(k, cur, t, reduced);
        drawStormClouds(k, cur, t, reduced);
        break;
      case 'snow':
        drawSnow(k, cur, t);
        break;
      case 'fog':
        drawFogBehind(k, cur, t);
        break;
      case 'wind':
        drawWind(k, cur, t);
        break;
      case 'leaves':
        drawLeaves(k, cur, t);
        break;
      case 'rainbow':
        drawRainbow(k, cur);
        break;
      case 'heat':
        drawHeatShimmer(k, cur, t);
        break;
      default:
        break;
    }
  });

  const front = k.add([k.pos(0, 0), k.z(10000)]);
  front.onDraw(() => {
    const cur = current;
    if (!cur || cur.weather.kind === 'clear' || cur.weather.ramp <= 0.02) return;
    if (cur.weather.kind === 'fog') drawFogFront(k, cur);
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

  return {
    update(t: ResolvedTheme) {
      current = t;

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
