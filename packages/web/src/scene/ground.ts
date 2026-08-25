import type { KAPLAYCtx } from 'kaplay';
import { mix } from '../theme/palettes.js';
import type { Tokens, ResolvedTheme } from '../theme/store.js';
import { GROUND_TOP, GROUND_Y, GROUND_FRONT, WORLD_W, ZONES, signLeft, SIGN_W, SIGN_BASE_Y } from '../layout/zones.js';

/**
 * Ground texture: the field stops being a slab.
 *
 * The shipped look is preset `b` — Quiet Meadow mottling plus a soft trail —
 * picked from a live playtest of all three candidates (2026-08-25). The other
 * presets stay reachable behind `?ground=a|c|off` for comparison; `off` is
 * the old flat field.
 *
 * The load-bearing rule here is that NO texture colour is a new hex. Every one
 * is a `mix()` of palette tokens, recomputed on every theme publish from the
 * tokens the store hands us — and `theme/store.ts` has already folded the
 * weather tint into `tokens.ground`/`groundDark` by then (see `weatherGround`
 * at store.ts:273). So snow whitens the patches, storm darkens the path and
 * night pulls the whole field toward the tint, with no weather code in here at
 * all. Add a texture colour by adding a RECIPE, never by typing a hex.
 */

export type GroundPreset = 'off' | 'a' | 'b' | 'c';

/** Derived-colour recipes. Key doubles as the KAPLAY tag suffix. */
const RECIPES = {
  patchDark: (t: Tokens) => mix(t.ground, t.groundDark, 0.55),
  patchLite: (t: Tokens) => mix(t.ground, t.cream, 0.18),
  tuft: (t: Tokens) => mix(t.groundDark, t.foliage, 0.55),
  // The path blends rather than announces: 0.30 toward wood is one visible
  // step off the grass, and the edge at 0.15 is the halfway tone that lets
  // the band sit IN the field instead of on top of it. (0.45/0.28 read as a
  // gravel road on the first live playtest — "cute path that blends" is the
  // brief that set these.)
  path: (t: Tokens) => mix(t.ground, t.wood, 0.3),
  pathEdge: (t: Tokens) => mix(t.ground, t.wood, 0.15),
  pebble: (t: Tokens) => mix(t.groundDark, t.ink, 0.3),
  pebbleLite: (t: Tokens) => mix(t.groundDark, t.ink, 0.15),
  flower: (t: Tokens) => mix(t.accent, t.cream, 0.25),
  flowerAlt: (t: Tokens) => t.cream,
} as const;

export type GroundRecipe = keyof typeof RECIPES;
export const GROUND_RECIPES = Object.keys(RECIPES) as GroundRecipe[];

/** A KAPLAY tag naming which derived recipe a texture rect's fill follows. */
export function groundTexTag(recipe: GroundRecipe): string {
  return `groundtex:${recipe}`;
}

/**
 * A texture rect's fill: the recipe mixed from the (already weather-tinted)
 * tokens, then pulled toward the frame tint exactly as `sceneryColor` pulls a
 * plain token. Linear mixes commute, so deriving-then-tinting lands on the
 * same colour as tinting-then-deriving — this order is just the cheaper one.
 */
export function groundTexColor(recipe: GroundRecipe, t: ResolvedTheme): string {
  return mix(RECIPES[recipe](t.tokens), t.tint.col, t.tint.sceneryK);
}

/** `?ground=` overrides the shipped preset; anything unrecognised — including
 * no param at all, which is every normal visit — lands on `b`, the playtest
 * pick. */
export function groundPreset(search = typeof location === 'undefined' ? '' : location.search): GroundPreset {
  const v = new URLSearchParams(search).get('ground');
  return v === 'a' || v === 'b' || v === 'c' || v === 'off' ? v : 'b';
}

/** mulberry32 — the scatter must be identical on every reload, or a reload
 * would silently become a different design. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything lands on even world pixels — a half-pixel rect fringes under
 * `crisp` nearest-neighbour upscaling. */
const snap = (v: number) => Math.round(v / 2) * 2;

/** Top of the texture band: just below the dark horizon strip. */
const TEX_TOP = GROUND_TOP + 16;
/** Bottom: a little past the front row's feet, so the near edge never ends
 * mid-frame on a tall window. */
const TEX_BOT = GROUND_FRONT + 40;

/** 0 at the horizon, 1 at the front row — every size grades along it, which is
 * what turns a scatter into a field with depth. */
const depth = (y: number) => Math.max(0, Math.min(1, (y - GROUND_TOP) / (GROUND_FRONT - GROUND_TOP)));

interface Density {
  /** Counts per 1000 world px. */
  patches: number;
  lites: number;
  tufts: number;
  specks: number;
  flowers: number;
  pebbles: number;
  path: boolean;
}

const PRESETS: Record<Exclude<GroundPreset, 'off'>, Density> = {
  // Quiet Meadow — mottling only. Nothing competes with a villager.
  a: { patches: 18, lites: 6, tufts: 7, specks: 0, flowers: 0, pebbles: 0, path: false },
  // The playtest pick: Quiet Meadow plus the soft path — nothing else.
  b: { patches: 18, lites: 6, tufts: 9, specks: 0, flowers: 0, pebbles: 0, path: true },
  // Storybook Meadow — the full kit, depth-graded. Kept for comparison.
  c: { patches: 24, lites: 9, tufts: 20, specks: 9, flowers: 6, pebbles: 1.6, path: true },
};

const KPX = WORLD_W / 1000;
const count = (perKpx: number) => Math.round(perKpx * KPX);

/**
 * The path's centreline, as stepped segments across the world. A momentum
 * walk, not per-step jitter: the drift velocity changes slowly, so the trail
 * sweeps in long lazy curves through a ±24px corridor around GROUND_Y — a
 * ribbon that wanders, where the old independent-step wobble read as a
 * surveyed road with a shaky hand. Every zone sign still sits on it.
 */
const PATH_STEP = 60;
const PATH_HALF = 10;

export function pathCentres(): { x: number; c: number; half: number }[] {
  const r = rng(77);
  const out: { x: number; c: number; half: number }[] = [];
  let c = GROUND_Y;
  let v = 0;
  for (let x = 0; x < WORLD_W; x += PATH_STEP) {
    v += [-2, 0, 0, 2][Math.floor(r() * 4)]!;
    v = Math.max(-4, Math.min(4, v));
    c = Math.max(GROUND_Y - 24, Math.min(GROUND_Y + 24, c + v));
    // Width breathes a little as it goes — a constant-width band is the
    // single strongest "drawn with a ruler" signal.
    const half = PATH_HALF + [0, 0, 2, 2][Math.floor(r() * 4)]!;
    out.push({ x, c: snap(c), half });
  }
  return out;
}

function bandAt(segs: { x: number; c: number; half: number }[], x: number) {
  const seg = segs[Math.max(0, Math.min(segs.length - 1, Math.floor(x / PATH_STEP)))]!;
  return { top: seg.c - seg.half, bot: seg.c + seg.half };
}

interface Spot {
  x: number;
  y: number;
  r1: number;
  r2: number;
  r3: number;
}

function scatter(
  seed: number,
  n: number,
  opts: { avoid?: (x: number, y: number) => boolean; top?: number; bot?: number } = {},
): Spot[] {
  const r = rng(seed);
  const top = opts.top ?? TEX_TOP;
  const bot = opts.bot ?? TEX_BOT;
  const out: Spot[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const x = snap(r() * WORLD_W);
    const y = snap(top + r() * (bot - top));
    if (opts.avoid?.(x, y)) continue;
    out.push({ x, y, r1: r(), r2: r(), r3: r() });
  }
  return out;
}

function rect(
  k: KAPLAYCtx,
  theme: ResolvedTheme,
  x: number,
  y: number,
  w: number,
  h: number,
  recipe: GroundRecipe,
) {
  return k.add([
    k.rect(w, h),
    k.pos(x, y),
    k.color(k.Color.fromHex(groundTexColor(recipe, theme))),
    k.z(0),
    groundTexTag(recipe),
  ]);
}

/**
 * Build the texture for a preset. Returns how many objects it added — the
 * caller logs it, because this is the one thing in the scene whose cost scales
 * with WORLD_W rather than with the villager count.
 */
export function buildGroundTexture(k: KAPLAYCtx, preset: GroundPreset, theme: ResolvedTheme): number {
  if (preset === 'off') return 0;
  const d = PRESETS[preset];
  const segs = pathCentres();
  const onPath = (x: number, y: number) => {
    if (!d.path) return false;
    const b = bandAt(segs, x);
    return y >= b.top - 4 && y <= b.bot + 4;
  };
  let n = 0;
  const add = (...args: Parameters<typeof rect> extends [unknown, unknown, ...infer R] ? R : never) => {
    rect(k, theme, ...args);
    n++;
  };

  // Mottling first — everything else sits on top of it.
  for (const p of scatter(11, count(d.patches))) {
    const t = depth(p.y);
    const w = snap(16 + 44 * t * (0.7 + p.r1 * 0.6));
    const h = snap(4 + 9 * t);
    add(p.x, p.y, w, h, 'patchDark');
    // A satellite lobe: one rect reads as a stamp, two read as a patch.
    add(p.x + snap(w * (p.r2 - 0.3)), p.y + (p.r3 > 0.5 ? h : -Math.min(4, h)), snap(w * 0.5), Math.min(4, h), 'patchDark');
  }
  for (const p of scatter(23, count(d.lites))) {
    const t = depth(p.y);
    add(p.x, p.y, snap(12 + 30 * t), snap(4 + 6 * t), 'patchLite');
  }

  if (d.path) {
    // Edge bands on BOTH sides in the halfway tone, then the trail proper:
    // the two-step gradient is what lets the path sit in the grass instead
    // of on it. Edges stretch a segment past each end so a width change
    // between neighbours never shows a raw corner.
    for (const [i, seg] of segs.entries()) {
      const prev = segs[i - 1] ?? seg;
      const top = Math.min(seg.c - seg.half, prev.c - prev.half);
      const bot = Math.max(seg.c + seg.half, prev.c + prev.half);
      add(seg.x, top - 2, PATH_STEP, bot - top + 4, 'pathEdge');
      add(seg.x, seg.c - seg.half, PATH_STEP, seg.half * 2, 'path');
    }
    // A worn spur from each sign post's base down to the trail, so the path
    // visibly *serves* the signs rather than merely passing them. The wander
    // corridor is ±24 around GROUND_Y while a post base sits at SIGN_BASE_Y,
    // so the gap is real at some signs and absent at others — bridge only
    // what's actually open.
    for (const zone of ZONES) {
      const post = signLeft(zone) + SIGN_W / 2;
      const b = bandAt(segs, post);
      const from = SIGN_BASE_Y - 2;
      if (b.top > from) {
        add(snap(post - 16), from - 2, 32, b.top - from + 4, 'pathEdge');
        add(snap(post - 14), from, 28, b.top - from + 2, 'path');
      }
    }
  }

  // Tufts: 2-3 blades, taller toward the viewer.
  for (const p of scatter(37, count(d.tufts), { avoid: onPath })) {
    const t = depth(p.y);
    const h = 3 + Math.round(3 * t);
    add(p.x, p.y - h, 2, h, 'tuft');
    add(p.x + 3, p.y - h + 1, 2, h - 1, 'tuft');
    if (t > 0.7 && p.r1 > 0.4) add(p.x - 3, p.y - h + 2, 2, h - 2, 'tuft');
  }
  // Specks: what a tuft becomes at distance. Only near the horizon, where a
  // full tuft would be bigger than the villagers standing behind it.
  for (const p of scatter(41, count(d.specks), { bot: GROUND_Y - 90 })) {
    add(p.x, p.y, 2, 2, 'tuft');
  }

  // Flowers only in the front half: a 4px bloom at the horizon is noise.
  for (const [i, p] of scatter(53, count(d.flowers), { avoid: onPath, top: GROUND_Y - 20 }).entries()) {
    add(p.x + 1, p.y - 4, 2, 4, 'tuft');
    add(p.x, p.y - 8, 4, 4, i % 3 === 2 ? 'flowerAlt' : 'flower');
    add(p.x + 1, p.y - 7, 2, 2, i % 3 === 2 ? 'flower' : 'flowerAlt');
  }

  for (const p of scatter(67, count(d.pebbles))) {
    add(p.x, p.y, 6, 4, 'pebble');
    add(p.x, p.y, 2, 2, 'pebbleLite');
  }

  return n;
}

/** Repaint every texture rect from a freshly resolved theme. Called from
 * village.ts's `applyTheme` walker, alongside the per-token pass. */
export function retintGroundTexture(k: KAPLAYCtx, theme: ResolvedTheme): void {
  for (const recipe of GROUND_RECIPES) {
    const colour = k.Color.fromHex(groundTexColor(recipe, theme));
    for (const obj of k.get(groundTexTag(recipe), { recursive: true })) {
      (obj as unknown as { color: unknown }).color = colour;
    }
  }
}
