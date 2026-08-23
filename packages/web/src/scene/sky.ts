import type { KAPLAYCtx, GameObj } from 'kaplay';
import type { ResolvedTheme } from '../theme/store.js';
import { themeStore } from '../theme/index.js';
import { mix } from '../theme/palettes.js';
import type { WeatherKind } from '../theme/weather/kinds.js';
import { ZONES, GROUND_TOP, GROUND_Y } from '../layout/zones.js';
import { tokenTag, sceneryColor } from './retint.js';

function hex(k: KAPLAYCtx, value: string) {
  return k.Color.fromHex(value);
}

// ---------------------------------------------------------------------------
// Pure helpers — no store reads, no KAPLAY. Tested directly in sky.test.ts.
// ---------------------------------------------------------------------------

export interface StarSpec {
  x01: number;
  y01: number;
  /** Every third star (by index) draws brighter — the reference's alpha rule. */
  major: boolean;
}

/**
 * Star positions, normalized to [0,1). Verbatim from the reference painter's
 * `(i*167+9)%470` / `(i*59+7)%148` (its 470x148 sky-band canvas), just
 * divided back down to a fraction so this scene can scale it to any canvas
 * size. Deterministic and index-stable: `starField(7)[i] === starField(24)[i]`
 * for every `i < 7`, so shrinking the visible count (a bright moon washing
 * out the faintest stars) never reshuffles the ones that stay.
 */
export function starField(count: number): StarSpec[] {
  const stars: StarSpec[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x01: ((i * 167 + 9) % 470) / 470,
      y01: ((i * 59 + 7) % 148) / 148,
      major: i % 3 === 0,
    });
  }
  return stars;
}

/**
 * A 6x6 pixel disc, corners cut, matching the reference moon's roundness —
 * 32 of the 36 cells belong to the disc, the 4 corners never draw.
 */
const MOON_DISC: readonly (readonly boolean[])[] = [
  [false, true, true, true, true, false],
  [true, true, true, true, true, true],
  [true, true, true, true, true, true],
  [true, true, true, true, true, true],
  [true, true, true, true, true, true],
  [false, true, true, true, true, false],
];

/** How many of the 6 columns are on the lit side, by phase shape. */
function litColumnCount(phaseName: string): number {
  const p = phaseName.toLowerCase();
  if (p === 'full') return 6;
  if (p === 'new') return 0;
  if (p.includes('crescent')) return 2;
  if (p.includes('quarter')) return 3;
  if (p.includes('gibbous')) return 5;
  return 3; // an unrecognized name reads as a half moon rather than exploding.
}

/**
 * One 6x6 moon grid, one row per string, one character per cell:
 *   '.' outside the disc (never drawn)
 *   'X' lit — render `#EEEADB`
 *   'o' the dark side of the disc — still drawn, render `mix('#EEEADB', sky0, 0.4)`
 *
 * `waxing` grows the lit side in from the right (toward `full`); waning
 * shrinks it away toward the left. `full` and `new` ignore `waxing` — there
 * is no side to a whole or an empty disc.
 */
export function moonPixels(phaseName: string, waxing: boolean): string[] {
  const lit = litColumnCount(phaseName);
  const litFrom = waxing ? 6 - lit : 0;
  const litTo = waxing ? 6 : lit;
  const rows: string[] = [];
  for (let r = 0; r < 6; r++) {
    let row = '';
    for (let c = 0; c < 6; c++) {
      if (!MOON_DISC[r]![c]) { row += '.'; continue; }
      row += c >= litFrom && c < litTo ? 'X' : 'o';
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// mountSky — the stateful KAPLAY layer.
// ---------------------------------------------------------------------------

/** Weather kinds clear enough for fireflies/moths — the reference's clearNight rule. */
const CLEARISH: ReadonlySet<WeatherKind> = new Set(['clear', 'heat', 'wind', 'leaves', 'rainbow']);

/** Screen-space x for a 0..1 fraction, margined so nothing clips the edge. */
function screenX(k: KAPLAYCtx, x01: number): number {
  return 40 + x01 * (k.width() - 80);
}

/** Screen-space y for a 0..1 arc fraction (1 = zenith/high, 0 = the horizon). */
function arcY(y01: number): number {
  const hi = GROUND_TOP * 0.15;
  const lo = GROUND_TOP * 0.75;
  return lo - y01 * (lo - hi);
}

const MOON_CELL = 10;
const MOON_SIZE = MOON_CELL * 6;

const MAX_STARS = 24;
const MAX_FIREFLIES = 9;

export interface SkyLayer {
  update(t: ResolvedTheme): void;
}

export function mountSky(k: KAPLAYCtx): SkyLayer {
  const homes = ZONES.find((z) => z.id === 'homes')!;

  // A MediaQueryList is cheap to poll every frame; re-creating one every
  // frame with `matchMedia(...)` is not. Node/test environments have no
  // `window` at all, so this stays a static `false` there.
  const reducedMotionMQL =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reducedMotion = () => reducedMotionMQL?.matches ?? false;

  // --- Sun: two stacked rects, fixed to the screen. ---------------------
  const sunOuter = k.add([
    k.rect(52, 52),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, '#F5D66B')),
    k.fixed(),
    k.z(-20),
  ]);
  const sunInner = k.add([
    k.rect(32, 32),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, '#FBE9A5')),
    k.fixed(),
    k.z(-19),
  ]);
  sunOuter.hidden = true;
  sunInner.hidden = true;

  // --- Moon: rebuilt from moonPixels() whenever phase/waxing changes. ---
  let moonRoot: GameObj | null = null;
  let moonKey: string | null = null;

  function rebuildMoon(phaseName: string, waxing: boolean, sky0: string): void {
    moonRoot?.destroy();
    const root = k.add([k.pos(0, 0), k.fixed(), k.z(-18)]);
    const grid = moonPixels(phaseName, waxing);
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]!;
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const colour = ch === 'X' ? '#EEEADB' : mix('#EEEADB', sky0, 0.4);
        root.add([
          k.rect(MOON_CELL, MOON_CELL),
          k.pos(c * MOON_CELL, r * MOON_CELL),
          k.color(hex(k, colour)),
        ]);
      }
    }
    moonRoot = root;
  }

  // --- Stars: pre-allocated, toggled/twinkled in place. ------------------
  const starSpecs = starField(MAX_STARS);
  const starDots = starSpecs.map((s) =>
    k.add([
      k.rect(2, 2),
      k.pos(0, 0),
      k.color(hex(k, '#FFFFFF')),
      k.opacity(0),
      k.fixed(),
      k.z(-17),
    ]),
  );
  // Each star's *steady* alpha, set by `update()` below; the per-frame
  // twinkle in the next `onUpdate` oscillates around this rather than the
  // object's own `.opacity`, which would otherwise compound frame over frame
  // instead of settling into a fixed twinkle band.
  const starBaseAlpha = new Array<number>(starDots.length).fill(0);
  for (let i = 0; i < starDots.length; i++) {
    const s = starSpecs[i]!;
    starDots[i]!.pos.x = s.x01 * k.width();
    starDots[i]!.pos.y = s.y01 * GROUND_TOP;
    starDots[i]!.hidden = true;
  }
  k.onUpdate(() => {
    const time = k.time();
    for (let i = 0; i < starDots.length; i++) {
      const dot = starDots[i]!;
      if (dot.hidden) continue;
      const base = starBaseAlpha[i]!;
      dot.opacity = reducedMotion() ? base : Math.max(0.1, Math.min(1, base + Math.sin(time * 1.6 + i) * 0.12));
    }
  });

  // --- Shooting star: a brief streak, every few minutes, clear nights only. ---
  const streak = k.add([
    k.rect(3, 2),
    k.pos(0, 0),
    k.color(hex(k, '#FFFFFF')),
    k.opacity(0),
    k.fixed(),
    k.z(-16),
  ]);
  streak.hidden = true;

  function seededInterval(): number {
    const minute = Math.floor(Date.now() / 60000);
    const x = Math.sin(minute * 12.9898) * 43758.5453;
    const frac = x - Math.floor(x);
    return 180 + frac * 240; // 180..420s
  }

  let nextShotAt = k.time() + seededInterval();
  let shooting = false;
  // Whether the *current* theme allows a shooting star to fire; the timer
  // below ticks continuously (it does not know about theme updates on its
  // own), so `update()` just flips this flag rather than resetting the
  // clock — a weather flip does not reset how long we have been waiting.
  let wantsShootingStar = false;

  k.onUpdate(() => {
    if (shooting || reducedMotion()) return;
    if (k.time() < nextShotAt) return;
    nextShotAt = k.time() + seededInterval();
    if (!wantsShootingStar) return;
    shooting = true;
    const startX = k.width() * 0.2;
    const startY = GROUND_TOP * 0.15;
    const endX = startX + k.width() * 0.35;
    const endY = startY + GROUND_TOP * 0.25;
    streak.pos.x = startX;
    streak.pos.y = startY;
    streak.opacity = 0.9;
    streak.hidden = false;
    k.tween(k.vec2(startX, startY), k.vec2(endX, endY), 0.5, (p) => {
      streak.pos.x = p.x;
      streak.pos.y = p.y;
    });
    k.wait(0.5, () => {
      streak.hidden = true;
      shooting = false;
    });
  });

  // --- Fireflies: world-space, drifting near Homes. ----------------------
  const fireflyBase = starSpecs.slice(0, MAX_FIREFLIES).map((_, i) => ({
    // Deterministic spread across Homes, independent of starField's own
    // sequence (a different stride keeps the two from lining up).
    x: homes.x + 120 + ((i * 331 + 47) % (homes.w - 240)),
    y: GROUND_Y - 40 - ((i * 97 + 23) % 160),
    phase: i * 0.9,
  }));
  const fireflies = fireflyBase.map((f) => {
    const root = k.add([k.pos(f.x, f.y), k.z(30)]);
    root.add([k.rect(10, 10), k.pos(-4, -4), k.color(hex(k, '#FFE896')), k.opacity(0.25)]);
    root.add([k.rect(3, 3), k.pos(-1, -1), k.color(hex(k, '#FFE896'))]);
    root.hidden = true;
    root.onUpdate(() => {
      if (reducedMotion()) return; // stays put, but visible
      const time = k.time();
      root.pos.x = f.x + Math.sin(time * 0.6 + f.phase) * 14;
      root.pos.y = f.y + Math.cos(time * 0.5 + f.phase) * 10;
    });
    return root;
  });

  // --- Lantern + window glow + moths, beside house 1. ---------------------
  const lanternX = homes.x + 360;
  const lanternTopY = GROUND_Y - 40;

  // The post is an ordinary wood-token prop — tagging it lets village.ts's
  // own retint walker keep it in step with every other piece of scenery,
  // without this module needing to recompute that mix itself. The initial
  // colour is struck from the *current* theme, same as village.ts's own
  // `block()`; the walker corrects it on the next publish either way.
  const initial = themeStore.current();
  k.add([
    k.rect(6, 40),
    k.pos(lanternX - 3, lanternTopY),
    k.color(hex(k, sceneryColor(initial.tokens, initial.tint, 'wood'))),
    k.z(5),
    tokenTag('wood'),
  ]);
  const lanternHalo = k.add([
    k.rect(22, 22),
    k.pos(lanternX - 11, lanternTopY - 13),
    k.color(hex(k, '#FFD98A')),
    k.opacity(0.25),
    k.z(5),
  ]);
  const lanternLamp = k.add([
    k.rect(12, 12),
    k.pos(lanternX - 6, lanternTopY - 8),
    k.color(hex(k, '#FFDF9E')),
    k.z(6),
  ]);

  const mothSpecs = [
    { dx: -11, dy: -6, phase: 0 },
    { dx: 8, dy: 2, phase: 1.4 },
    { dx: 2, dy: -11, phase: 2.7 },
  ];
  const moths = mothSpecs.map((m) => {
    const x = lanternX + m.dx;
    const y = lanternTopY + m.dy;
    const obj = k.add([k.rect(2, 2), k.pos(x, y), k.color(hex(k, '#E8E3D2')), k.z(6)]);
    obj.onUpdate(() => {
      if (reducedMotion()) return;
      const time = k.time();
      obj.pos.x = x + Math.sin(time * 1.3 + m.phase) * 3;
      obj.pos.y = y + Math.cos(time * 1.1 + m.phase) * 3;
    });
    return obj;
  });

  return {
    update(t: ResolvedTheme) {
      // Sun.
      const sunVisible = t.sun.visible && !t.flags.overcast;
      sunOuter.hidden = !sunVisible;
      sunInner.hidden = !sunVisible;
      if (sunVisible) {
        const x = screenX(k, t.sun.x01);
        const y = arcY(t.sun.y01);
        sunOuter.pos.x = x; sunOuter.pos.y = y;
        sunInner.pos.x = x; sunInner.pos.y = y;
      }

      // Moon.
      const moonVisible = t.moonSky.visible;
      const key = `${t.moonSky.phaseName}|${t.moonSky.waxing}`;
      if (moonVisible && key !== moonKey) {
        rebuildMoon(t.moonSky.phaseName, t.moonSky.waxing, t.tokens.sky0);
        moonKey = key;
      }
      if (moonRoot) {
        moonRoot.hidden = !moonVisible;
        if (moonVisible) {
          moonRoot.pos.x = screenX(k, t.moonSky.x01) - MOON_SIZE / 2;
          moonRoot.pos.y = arcY(t.moonSky.y01) - MOON_SIZE / 2;
        }
      }

      // Stars: night or dusk, never overcast.
      const starsOn = (t.flags.isNight || t.flags.isDusk) && !t.flags.overcast;
      const nightCount = 24 - Math.round(8 * (1 - t.moonSky.darkness));
      const count = starsOn ? (t.flags.isNight ? nightCount : 7) : 0;
      for (let i = 0; i < starDots.length; i++) {
        const dot = starDots[i]!;
        const visible = i < count;
        dot.hidden = !visible;
        if (!visible) continue;
        const spec = starSpecs[i]!;
        const base = t.flags.isNight ? (spec.major ? 0.9 : 0.5) : 0.3;
        starBaseAlpha[i] = base;
        dot.opacity = base;
      }

      // Shooting star eligibility (the timer itself free-runs above).
      wantsShootingStar = t.flags.isNight && !t.flags.overcast && t.weather.kind === 'clear';

      // Fireflies.
      const fliesOn = t.flags.lanternsOn && !t.flags.overcast && CLEARISH.has(t.weather.kind);
      const fireflyCount = fliesOn
        ? t.flags.isNight
          ? Math.round(9 * (0.6 + 0.4 * t.moonSky.darkness))
          : Math.min(4, Math.round(9 * (0.6 + 0.4 * t.moonSky.darkness)))
        : 0;
      for (let i = 0; i < fireflies.length; i++) {
        fireflies[i]!.hidden = i >= fireflyCount;
      }

      // Lantern + window glow + moths. The lamp and halo are fixed lit
      // colours, same as the reference (never tinted toward night) — only
      // their visibility follows `windowsGlow`.
      const glow = t.flags.windowsGlow;
      lanternHalo.hidden = !glow;
      lanternLamp.hidden = !glow;
      const mothsOn = glow && !t.flags.overcast;
      for (const m of moths) m.hidden = !mothsOn;

      // House windows: lit lamp-glow colour when glowing, else the ordinary
      // themed sky1 scenery colour — set explicitly both ways so this holds
      // regardless of whether village.ts's own retint walker (which also
      // touches every `themed:sky1` object, windows included) runs before or
      // after this update.
      const windowColour = glow ? hex(k, '#FFDF9E') : hex(k, sceneryColor(t.tokens, t.tint, 'sky1'));
      for (const obj of k.get('themed:window', { recursive: true })) {
        (obj as unknown as { color: unknown }).color = windowColour;
      }
    },
  };
}
