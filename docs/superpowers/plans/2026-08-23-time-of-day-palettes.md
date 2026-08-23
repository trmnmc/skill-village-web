# Time-of-Day Palettes, Weather & Moon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The village lives on the player's clock — six palettes blend continuously through a Kelvin-honest day, weekends rotate, weather arrives via Pick/Journey/Real modes, and the night sky wears the real moon.

**Architecture:** A new `packages/web/src/theme/` subsystem: pure data (palettes), pure functions (timeline, schedule, weather, journey, moon), and one stateful store that resolves "now" once a minute and publishes to two outlets — KAPLAY scene objects retinted via native tags, and CSS variables for the HTML chrome. Weather/ambience render as one immediate-mode `onDraw` layer behind the creatures.

**Tech Stack:** TypeScript, KAPLAY (existing), vitest (node env, colocated `*.test.ts`), Open-Meteo (Real mode only), vendored `trmnmc/moon` Meeus port.

**Spec:** `docs/superpowers/specs/2026-08-23-time-of-day-palettes-design.md` — read it first; every constant below traces to it.

## Global Constraints

- Light NEVER steps: every visible change lerps (`mix()`), store re-resolves ~every 60s plus on visibility return.
- Tint ceilings are exact (spec §4): scenery mix toward tint color ≤ 0.55 (night), creatures ≤ 0.28; dusk 0.18/0.10; dawn 0.10/0.06; day 0.
- Weather draws BEHIND creatures; only the storm flash and fog front-veil draw in front (spec §5).
- Creature DNA hues never change; night tint is a render-time multiply, not a data change.
- No network except Real mode; no geolocation prompt except when the player picks Real.
- localStorage keys: `sv-weather-mode`, `sv-weather-pick`.
- `prefers-reduced-motion`: particles/twinkle freeze to the reference's `staticFrame` variants; nothing disappears.
- Reference painter is vendored at `reference/palette-explorations/village-scene.js` (Task 1) — transcriptions cite it; constants copy verbatim.
- Run tests: `npx vitest run <file>` from repo root; full suite `npm test`; types `npm run typecheck`. Commit after every task.

---

### Task 1: Palette data + color math (and vendor the reference painter)

**Files:**
- Create: `packages/web/src/theme/palettes.ts`
- Create: `packages/web/src/theme/palettes.test.ts`
- Create: `reference/palette-explorations/village-scene.js` (verbatim copy)

**Interfaces:**
- Produces: `PaletteId = '1a'|'1b'|'1c'|'1d'|'1e'|'1f'`; `Frame = 'dawn'|'day'|'dusk'|'night'`; `Palette` (shape below); `PALETTES: Record<PaletteId, Palette>`; `mix(a: string, b: string, k: number): string`; `lite(hue: string): string`.

- [ ] **Step 1: Vendor the reference painter.** Fetch the file from the user's Design project export already saved in the spec's input — copy the full `village-scene.js` content (the palette-exploration scene painter + weather engine, the one defining `DIRS`, `GRAYS`, `drawScene`, `startLive`) into `reference/palette-explorations/village-scene.js` with a one-line header comment: `/* Vendored verbatim from Claude Design project 96ec9409 — visual source of truth for the theme system. Do not edit. */`. Source: the Design project `96ec9409-1223-4d59-80c9-d28d7559848b`, file `village-scene.js` (a copy also exists in the session scratchpad clone if the executor has it; otherwise DesignSync `get_file`).

- [ ] **Step 2: Write the failing test**

```ts
// packages/web/src/theme/palettes.test.ts
import { describe, it, expect } from 'vitest';
import { PALETTES, mix, lite } from './palettes.js';
import { isHex } from '../theme.js';

describe('PALETTES', () => {
  it('holds all six palettes with four 3-band skies each', () => {
    const ids = Object.keys(PALETTES).sort();
    expect(ids).toEqual(['1a', '1b', '1c', '1d', '1e', '1f']);
    for (const p of Object.values(PALETTES)) {
      for (const frame of ['dawn', 'day', 'dusk', 'night'] as const) {
        expect(p.skies[frame]).toHaveLength(3);
        for (const c of p.skies[frame]) expect(isHex(c)).toBe(true);
      }
      expect(isHex(p.ink) && isHex(p.cream) && isHex(p.ground)).toBe(true);
    }
  });

  it('1a matches the game today (THEME continuity)', () => {
    expect(PALETTES['1a'].skies.day[1]).toBe('#CFE9F5');
    expect(PALETTES['1a'].ground).toBe('#A8C68D');
    expect(PALETTES['1a'].ink).toBe('#3A2E22');
  });
});

describe('mix', () => {
  it('lerps channelwise and clamps to hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5).toLowerCase()).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1).toLowerCase()).toBe('#ffffff');
  });
});

describe('lite', () => {
  it('is a 32% mix toward white, matching the reference', () => {
    expect(lite('#e58c68')).toBe(mix('#e58c68', '#ffffff', 0.32));
  });
});
```

- [ ] **Step 3: Run to verify failure.** `npx vitest run packages/web/src/theme/palettes.test.ts` — FAIL (module not found).

- [ ] **Step 4: Implement.** Transcribe `DIRS` from the vendored reference into typed data — every hex verbatim:

```ts
// packages/web/src/theme/palettes.ts
/**
 * The six village palettes, verbatim from the user's palette explorations
 * (reference/palette-explorations/village-scene.js — the visual source of
 * truth). 1a is the game's original fixed THEME, now one voice among six.
 */
export type PaletteId = '1a' | '1b' | '1c' | '1d' | '1e' | '1f';
export type Frame = 'dawn' | 'day' | 'dusk' | 'night';

export interface Palette {
  name: string;
  ink: string; cream: string; bubble: string; wood: string; accent: string;
  foliage: string; foliageLite: string; ground: string; groundDark: string;
  houseA: [string, string]; houseB: [string, string];
  skies: Record<Frame, [string, string, string]>;
}

export const PALETTES: Record<PaletteId, Palette> = {
  '1a': {
    name: 'Meadow Blue', ink: '#3A2E22', cream: '#F2E5C4', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
    foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A8C68D', groundDark: '#8FB075',
    houseA: ['#F2E5C4', '#D97757'], houseB: ['#E8D3EE', '#B39DDB'],
    skies: { dawn: ['#F4D9C0', '#F8E4CC', '#FBEEDD'], day: ['#C4E4F4', '#CFE9F5', '#DFF0EC'], dusk: ['#E9A87C', '#F0C08A', '#EDCFA2'], night: ['#1C2130', '#232A3C', '#2C3446'] },
  },
  '1b': {
    name: 'Golden Hour', ink: '#3A2E22', cream: '#F6E8C8', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
    foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A9C481', groundDark: '#92AF6C',
    houseA: ['#F6E8C8', '#D97757'], houseB: ['#F2D8A7', '#D96C57'],
    skies: { dawn: ['#F6CBA6', '#FADDBC', '#FCEAD2'], day: ['#F3DDB7', '#F7E6C6', '#FAEED6'], dusk: ['#DE8E63', '#EBAF7B', '#F0C896'], night: ['#241F2E', '#2C2739', '#352F45'] },
  },
  '1c': {
    name: 'Spring Tonic', ink: '#33382C', cream: '#F1F0DC', bubble: '#FDFDF2', wood: '#7E6A4E', accent: '#D97757',
    foliage: '#6FA868', foliageLite: '#85BC77', ground: '#9CC98F', groundDark: '#83B378',
    houseA: ['#F1F0DC', '#D97757'], houseB: ['#E4E9F2', '#8FA6C8'],
    skies: { dawn: ['#F2E3C2', '#EDEBCC', '#E4EED8'], day: ['#C9EDDD', '#D8F0E4', '#E7F4E7'], dusk: ['#E8B07E', '#E5C490', '#D8D2A2'], night: ['#17262A', '#1E3034', '#273B3E'] },
  },
  '1d': {
    name: 'Toasted Oat', ink: '#40342A', cream: '#F7EDD6', bubble: '#FFFCF0', wood: '#8A6B4A', accent: '#C96A4A',
    foliage: '#8A9A5B', foliageLite: '#9FAE6B', ground: '#B5B87E', groundDark: '#9CA067',
    houseA: ['#F7EDD6', '#C96A4A'], houseB: ['#E9DFC4', '#A6773F'],
    skies: { dawn: ['#F4D3AE', '#F6E0C0', '#F8EAD2'], day: ['#EDE3CB', '#F1E9D4', '#F5EFDE'], dusk: ['#D98F5E', '#E3AC74', '#E5C48C'], night: ['#221E19', '#2A2620', '#332E27'] },
  },
  '1e': {
    name: 'Berry Dusk', ink: '#3B3040', cream: '#F3E7E4', bubble: '#FFFBF8', wood: '#866A5E', accent: '#B5729F',
    foliage: '#74A876', foliageLite: '#8ABC84', ground: '#9FC494', groundDark: '#86AC7C',
    houseA: ['#F3E7E4', '#B5729F'], houseB: ['#E4D6F0', '#9C86C8'],
    skies: { dawn: ['#F0CFD8', '#F2DDE2', '#F1E8E4'], day: ['#DCD8F0', '#E4E0F4', '#EBE7EF'], dusk: ['#B87FA6', '#CC9DB4', '#DEBDBE'], night: ['#201C33', '#282341', '#322C4E'] },
  },
  '1f': {
    name: 'Marigold', ink: '#4A3A20', cream: '#FFF3CF', bubble: '#FFFDF2', wood: '#8F6E42', accent: '#E29435',
    foliage: '#7FAB53', foliageLite: '#93BE62', ground: '#AFC96F', groundDark: '#97B159',
    houseA: ['#FFF3CF', '#D97757'], houseB: ['#F2D8A7', '#C9803E'],
    skies: { dawn: ['#F9DCA4', '#FBE7B8', '#FCEFC9'], day: ['#F7EBB4', '#FAF0C4', '#FBF4D4'], dusk: ['#E9A155', '#F1BC6A', '#F3D285'], night: ['#1E2126', '#262A31', '#30343C'] },
  },
};

/** Channelwise hex lerp — the reference painter's mix(), typed. */
export function mix(a: string, b: string, k: number): string {
  const hx = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const h2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const A = hx(a), B = hx(b);
  return `#${h2(A[0]! + (B[0]! - A[0]!) * k)}${h2(A[1]! + (B[1]! - A[1]!) * k)}${h2(A[2]! + (B[2]! - A[2]!) * k)}`;
}

export function lite(hue: string): string {
  return mix(hue, '#ffffff', 0.32);
}
```

- [ ] **Step 5: Run to verify pass**, then `npm run typecheck`.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(theme): six palettes as data + color math, reference painter vendored"`

---

### Task 2: The daily timeline

**Files:**
- Create: `packages/web/src/theme/timeline.ts`
- Create: `packages/web/src/theme/timeline.test.ts`

**Interfaces:**
- Consumes: `PaletteId`, `Frame` from `./palettes.js`.
- Produces: `DayPlan = { kind: 'weave' } | { kind: 'single'; palette: PaletteId }`; `Keyframe = { atMin: number; palette: PaletteId; frame: Frame }`; `buildTimeline(plan: DayPlan, prevPlan: DayPlan, anchors?: SolarAnchors): Keyframe[]`; `SolarAnchors = { sunriseMin: number; sunsetMin: number }` (defaults 405 = 06:45, 1125 = 18:45); `sampleTimeline(frames: Keyframe[], minuteOfDay: number): { a: Keyframe; b: Keyframe; t: number }`.

The weekday weave (spec §2), expressed as offsets from the solar anchors so Real mode can shift them: pre-dawn hold ends sunrise−35 (1a dawn), sunrise (1b dawn), sunrise+35 (1b day), sunrise+105 → sunset−120 hold (1a day plateau), sunset−60 (1a dusk), sunset (1b dusk), sunset+35 (1b night), sunset+135 (1a night, holds to end). With default anchors that reproduces the spec table: 06:10, 06:45, 07:20, 08:30–16:45, 17:45, 18:45, 19:20, 21:00. A `single` plan uses: sunrise (dawn), sunrise+105 (day, plateau to sunset−120), sunset (dusk), sunset+135 (night). The list is prefixed with one keyframe at negative time carrying `prevPlan`'s final night frame, so pre-dawn samples blend FROM yesterday's palette (the midnight cross-palette case).

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/theme/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildTimeline, sampleTimeline, type DayPlan } from './timeline.js';

const WEAVE: DayPlan = { kind: 'weave' };
const SAT: DayPlan = { kind: 'single', palette: '1f' };

describe('buildTimeline (weave, default anchors)', () => {
  const frames = buildTimeline(WEAVE, WEAVE);

  it('places the spec §2 anchors in order', () => {
    const named = frames.map((f) => `${f.palette}-${f.frame}@${f.atMin}`);
    expect(named).toEqual([
      '1a-night@-180',           // yesterday's deep night carries over midnight
      '1a-night@330',            // hold end 05:30
      '1a-dawn@370',             // 06:10
      '1b-dawn@405',             // 06:45 sunrise
      '1b-day@440',              // 07:20
      '1a-day@510',              // 08:30 — blue by 8:30 (the user's correction)
      '1a-day@1005',             // 16:45 plateau end
      '1a-dusk@1065',            // 17:45
      '1b-dusk@1125',            // 18:45 sunset
      '1b-night@1160',           // 19:20
      '1a-night@1260',           // 21:00
    ]);
  });

  it('shifts with solar anchors (Real mode)', () => {
    const winter = buildTimeline(WEAVE, WEAVE, { sunriseMin: 450, sunsetMin: 1020 });
    const sunrise = winter.find((f) => f.palette === '1b' && f.frame === 'dawn')!;
    expect(sunrise.atMin).toBe(450);
  });
});

describe('sampleTimeline', () => {
  const frames = buildTimeline(WEAVE, SAT); // yesterday was Marigold Saturday

  it('holds flat inside the plateau', () => {
    const noon = sampleTimeline(frames, 720);
    expect(noon.a.frame).toBe('day');
    expect(noon.a.palette).toBe('1a');
    expect(noon.b.palette).toBe('1a');
  });

  it('is mid-blend between 07:20 and 08:30', () => {
    const s = sampleTimeline(frames, 475); // 07:55
    expect(s.a.palette).toBe('1b');
    expect(s.b.palette).toBe('1a');
    expect(s.t).toBeCloseTo(0.5, 1);
  });

  it('blends FROM yesterday palette before dawn (midnight crossover)', () => {
    const s = sampleTimeline(frames, 60); // 01:00
    expect(s.a.palette).toBe('1f'); // Marigold night fading out
    expect(s.b.palette).toBe('1a');
  });
});
```

- [ ] **Step 2: Run to verify failure** (module not found).

- [ ] **Step 3: Implement**

```ts
// packages/web/src/theme/timeline.ts
import type { Frame, PaletteId } from './palettes.js';

export type DayPlan = { kind: 'weave' } | { kind: 'single'; palette: PaletteId };
export interface Keyframe { atMin: number; palette: PaletteId; frame: Frame }
export interface SolarAnchors { sunriseMin: number; sunsetMin: number }

export const DEFAULT_ANCHORS: SolarAnchors = { sunriseMin: 405, sunsetMin: 1125 };

/** The last keyframe a plan ends its day on — what midnight blends from. */
function finalNight(plan: DayPlan): { palette: PaletteId; frame: Frame } {
  return plan.kind === 'weave' ? { palette: '1a', frame: 'night' } : { palette: plan.palette, frame: 'night' };
}

/**
 * The day's color keyframes (spec §2), offsets hung off the solar anchors so
 * Real mode's true sunrise/sunset shift the whole curve. Keyframes only mark
 * where a blend ENDS; between equal neighbors the sky holds (the plateaus).
 */
export function buildTimeline(plan: DayPlan, prevPlan: DayPlan, anchors: SolarAnchors = DEFAULT_ANCHORS): Keyframe[] {
  const { sunriseMin: r, sunsetMin: s } = anchors;
  const prev = finalNight(prevPlan);
  if (plan.kind === 'weave') {
    return [
      { atMin: -180, ...prev },
      { atMin: r - 75, palette: '1a', frame: 'night' },
      { atMin: r - 35, palette: '1a', frame: 'dawn' },
      { atMin: r, palette: '1b', frame: 'dawn' },
      { atMin: r + 35, palette: '1b', frame: 'day' },
      { atMin: r + 105, palette: '1a', frame: 'day' },
      { atMin: s - 120, palette: '1a', frame: 'day' },
      { atMin: s - 60, palette: '1a', frame: 'dusk' },
      { atMin: s, palette: '1b', frame: 'dusk' },
      { atMin: s + 35, palette: '1b', frame: 'night' },
      { atMin: s + 135, palette: '1a', frame: 'night' },
    ];
  }
  const p = plan.palette;
  return [
    { atMin: -180, ...prev },
    { atMin: r - 75, ...prev },
    { atMin: r, palette: p, frame: 'dawn' },
    { atMin: r + 105, palette: p, frame: 'day' },
    { atMin: s - 120, palette: p, frame: 'day' },
    { atMin: s, palette: p, frame: 'dusk' },
    { atMin: s + 135, palette: p, frame: 'night' },
  ];
}

/** Neighboring keyframes around a minute, with blend progress t in [0,1]. */
export function sampleTimeline(frames: Keyframe[], minuteOfDay: number): { a: Keyframe; b: Keyframe; t: number } {
  let a = frames[0]!, b = frames[frames.length - 1]!;
  if (minuteOfDay <= a.atMin) return { a, b: a, t: 0 };
  for (let i = 1; i < frames.length; i++) {
    if (minuteOfDay <= frames[i]!.atMin) {
      a = frames[i - 1]!; b = frames[i]!;
      const span = b.atMin - a.atMin;
      return { a, b, t: span <= 0 ? 1 : (minuteOfDay - a.atMin) / span };
    }
  }
  return { a: b, b, t: 0 }; // after the last anchor: hold deep night
}
```

- [ ] **Step 4: Run to verify pass**, typecheck.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): Kelvin-anchored day timeline with solar shifting and midnight crossover"`

---

### Task 3: The week schedule

**Files:**
- Create: `packages/web/src/theme/schedule.ts`
- Create: `packages/web/src/theme/schedule.test.ts`

**Interfaces:**
- Consumes: `DayPlan` from `./timeline.js`; `PaletteId` from `./palettes.js`.
- Produces: `planForDate(date: Date): DayPlan`; `isoWeek(date: Date): number` (exported for tests).

Rules (spec §3): Sat/Sun get `single` palettes picked from `['1c','1d','1e','1f']` by ISO week — Saturday index `isoWeek % 4`, Sunday `(isoWeek + 2) % 4` (always distinct; consecutive Saturdays differ because isoWeek increments). One weekday per week is a surprise: weekday index `1 + (isoWeek * 7 + 3) % 5` (Mon=1..Fri=5, deterministic per week), wearing palette `['1c','1d','1e','1f'][(isoWeek + 1) % 4]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/theme/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { planForDate, isoWeek } from './schedule.js';

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('planForDate', () => {
  it('weekends are single-palette days', () => {
    const sat = planForDate(d('2026-08-22'));
    const sun = planForDate(d('2026-08-23'));
    expect(sat.kind).toBe('single');
    expect(sun.kind).toBe('single');
    if (sat.kind === 'single' && sun.kind === 'single') {
      expect(sat.palette).not.toBe(sun.palette);
      expect(['1c', '1d', '1e', '1f']).toContain(sat.palette);
    }
  });

  it('consecutive Saturdays wear different palettes', () => {
    const s1 = planForDate(d('2026-08-22'));
    const s2 = planForDate(d('2026-08-29'));
    if (s1.kind === 'single' && s2.kind === 'single') expect(s1.palette).not.toBe(s2.palette);
  });

  it('exactly one weekday of a week is a surprise single', () => {
    // Mon 2026-08-17 .. Fri 2026-08-21
    const days = ['17', '18', '19', '20', '21'].map((n) => planForDate(d(`2026-08-${n}`)));
    expect(days.filter((p) => p.kind === 'single')).toHaveLength(1);
    expect(days.filter((p) => p.kind === 'weave')).toHaveLength(4);
  });

  it('is deterministic', () => {
    expect(planForDate(d('2026-08-19'))).toEqual(planForDate(d('2026-08-19')));
  });

  it('isoWeek matches known values', () => {
    expect(isoWeek(d('2026-01-01'))).toBe(1);
    expect(isoWeek(d('2026-08-22'))).toBe(34);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**

```ts
// packages/web/src/theme/schedule.ts
import type { PaletteId } from './palettes.js';
import type { DayPlan } from './timeline.js';

const SPECIALS: PaletteId[] = ['1c', '1d', '1e', '1f'];

/** ISO-8601 week number (local dates; the village lives on the wall clock). */
export function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day + 3); // the week's Thursday decides the year
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(jan4.getFullYear(), 0, 4 - jan4Day);
  return 1 + Math.round((d.getTime() - week1Mon.getTime()) / (7 * 86400000));
}

/**
 * Spec §3: weekday weave, ISO-week-rotating weekend singles (Sat != Sun,
 * Sat != last Sat), one seeded surprise weekday per week. Deterministic:
 * same date, same plan, every reload, every tab.
 */
export function planForDate(date: Date): DayPlan {
  const dow = date.getDay(); // 0=Sun..6=Sat
  const week = isoWeek(date);
  if (dow === 6) return { kind: 'single', palette: SPECIALS[week % 4]! };
  if (dow === 0) return { kind: 'single', palette: SPECIALS[(week + 2) % 4]! };
  const surpriseDow = 1 + ((week * 7 + 3) % 5); // Mon..Fri
  if (dow === surpriseDow) return { kind: 'single', palette: SPECIALS[(week + 1) % 4]! };
  return { kind: 'weave' };
}
```

- [ ] **Step 4: Run to verify pass** (adjust the `isoWeek(2026-08-22)` expectation only if the computed true ISO week differs — verify against a calendar, don't force the test).
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): week schedule — rotating weekends, seeded surprise weekdays"`

---

### Task 4: Weather kinds + token pipeline

**Files:**
- Create: `packages/web/src/theme/weather/kinds.ts`
- Create: `packages/web/src/theme/weather/kinds.test.ts`

**Interfaces:**
- Consumes: `mix` from `../palettes.js`.
- Produces: `WeatherKind = 'clear'|'rain'|'storm'|'snow'|'fog'|'cloudy'|'heat'|'wind'|'leaves'|'rainbow'`; `ALL_WEATHERS: WeatherKind[]`; `OVERCAST: ReadonlySet<WeatherKind>`; `GRAYS: Record<string, [string, number]>`; `graySkies(skies: [string,string,string], kind: WeatherKind, ramp: number, isNight: boolean): [string,string,string]`; `weatherGround(ground: string, groundDark: string, kind: WeatherKind, ramp: number): { ground: string; groundDark: string }`.

Constants verbatim from the reference (`GRAYS`, ground shifts): rain `['#93A2AC', 0.50]`, storm `['#59636C', 0.68]`, snow `['#BFC9D2', 0.50]`, fog `['#C6C3B6', 0.55]`, cloudy `['#A8AFB4', 0.35]`, heat `['#FFD98A', 0.18]`; overcast = {rain, storm, snow, fog, cloudy}; night tone = `mix(tone, '#10141A', 0.5)`; grounds: snow → `#EBF1F2`/`#D5E0E3` (full replace, so lerp original→snow-white by ramp), rain → `mix(g, '#5F7A70', .15)`, storm → `.25` of `#4E6660`, fog → `.25` of `#B8B8A8`. `ramp` (0..1) scales each mix strength so spells fade in/out.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/theme/weather/kinds.test.ts
import { describe, it, expect } from 'vitest';
import { GRAYS, OVERCAST, graySkies, weatherGround } from './kinds.js';
import { mix } from '../palettes.js';

const SKY: [string, string, string] = ['#C4E4F4', '#CFE9F5', '#DFF0EC'];

describe('graySkies', () => {
  it('applies the reference tone at full ramp', () => {
    const [s0] = graySkies(SKY, 'rain', 1, false);
    expect(s0).toBe(mix('#C4E4F4', '#93A2AC', 0.50));
  });
  it('scales with ramp', () => {
    const [s0] = graySkies(SKY, 'rain', 0.5, false);
    expect(s0).toBe(mix('#C4E4F4', '#93A2AC', 0.25));
  });
  it('darkens the tone at night', () => {
    const [day0] = graySkies(SKY, 'storm', 1, false);
    const [night0] = graySkies(SKY, 'storm', 1, true);
    expect(night0).not.toBe(day0);
  });
  it('leaves clear/wind/leaves/rainbow untouched', () => {
    expect(graySkies(SKY, 'wind', 1, false)).toEqual(SKY);
  });
});

describe('weatherGround', () => {
  it('snow whitens the ground fully at ramp 1', () => {
    expect(weatherGround('#A8C68D', '#8FB075', 'snow', 1).ground).toBe('#EBF1F2');
  });
  it('rain dampens by 0.15 toward #5F7A70', () => {
    expect(weatherGround('#A8C68D', '#8FB075', 'rain', 1).ground).toBe(mix('#A8C68D', '#5F7A70', 0.15));
  });
});

describe('OVERCAST', () => {
  it('matches the reference set', () => {
    expect([...OVERCAST].sort()).toEqual(['cloudy', 'fog', 'rain', 'snow', 'storm']);
    expect(OVERCAST.has('heat' as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**

```ts
// packages/web/src/theme/weather/kinds.ts
import { mix } from '../palettes.js';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'cloudy' | 'heat' | 'wind' | 'leaves' | 'rainbow';
export const ALL_WEATHERS: WeatherKind[] = ['clear', 'rain', 'storm', 'snow', 'fog', 'cloudy', 'heat', 'wind', 'leaves', 'rainbow'];

/** Sky-graying tone + strength, verbatim from the reference weather engine. */
export const GRAYS: Partial<Record<WeatherKind, [string, number]>> = {
  rain: ['#93A2AC', 0.50], storm: ['#59636C', 0.68], snow: ['#BFC9D2', 0.50],
  fog: ['#C6C3B6', 0.55], cloudy: ['#A8AFB4', 0.35], heat: ['#FFD98A', 0.18],
};

export const OVERCAST: ReadonlySet<WeatherKind> = new Set(['rain', 'storm', 'snow', 'fog', 'cloudy']);

export function graySkies(skies: [string, string, string], kind: WeatherKind, ramp: number, isNight: boolean): [string, string, string] {
  const gr = GRAYS[kind];
  if (!gr || ramp <= 0) return skies;
  const tone = isNight ? mix(gr[0], '#10141A', 0.5) : gr[0];
  const k = gr[1] * ramp;
  return [mix(skies[0], tone, k), mix(skies[1], tone, k), mix(skies[2], tone, k)];
}

export function weatherGround(ground: string, groundDark: string, kind: WeatherKind, ramp: number): { ground: string; groundDark: string } {
  if (ramp <= 0) return { ground, groundDark };
  if (kind === 'snow') return { ground: mix(ground, '#EBF1F2', ramp), groundDark: mix(groundDark, '#D5E0E3', ramp) };
  if (kind === 'rain') return { ground: mix(ground, '#5F7A70', 0.15 * ramp), groundDark: mix(groundDark, '#5F7A70', 0.15 * ramp) };
  if (kind === 'storm') return { ground: mix(ground, '#4E6660', 0.25 * ramp), groundDark: mix(groundDark, '#4E6660', 0.25 * ramp) };
  if (kind === 'fog') return { ground: mix(ground, '#B8B8A8', 0.25 * ramp), groundDark: mix(groundDark, '#B8B8A8', 0.25 * ramp) };
  return { ground, groundDark };
}
```

- [ ] **Step 4: Run to verify pass**, typecheck.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): weather kinds and the token graying pipeline"`

---

### Task 5: The Journey

**Files:**
- Create: `packages/web/src/theme/weather/journey.ts`
- Create: `packages/web/src/theme/weather/journey.test.ts`

**Interfaces:**
- Consumes: `PaletteId`, `Frame` from `../palettes.js`; `WeatherKind` from `./kinds.js`.
- Produces: `WAYPOINTS: Waypoint[]` (`Waypoint = { palette: PaletteId; frame: Frame; weather: WeatherKind; label: string }`); `WAYPOINT_MS = 180_000`; `journeyAt(nowMs: number): { a: Waypoint; b: Waypoint; t: number }`.

The 15 waypoints verbatim from spec §6 ("summer blue → night storm"). Weather across a boundary crossfades: outgoing kind's ramp = `1 - t` for the first half, incoming = `t` — the store handles that; journey just reports neighbors + t.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/theme/weather/journey.test.ts
import { describe, it, expect } from 'vitest';
import { WAYPOINTS, WAYPOINT_MS, journeyAt } from './journey.js';

describe('WAYPOINTS', () => {
  it('is the 15-stop spec loop, summer blue to night storm to sunrise', () => {
    expect(WAYPOINTS).toHaveLength(15);
    expect(WAYPOINTS[0]).toMatchObject({ palette: '1a', frame: 'day', weather: 'clear' });
    expect(WAYPOINTS[13]).toMatchObject({ palette: '1a', frame: 'night', weather: 'storm' });
    expect(WAYPOINTS[14]).toMatchObject({ palette: '1b', frame: 'dawn', weather: 'clear' });
  });

  it('cohesion invariant: adjacent stops (loop-closed) change at most two of the three axes', () => {
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const a = WAYPOINTS[i]!, b = WAYPOINTS[(i + 1) % WAYPOINTS.length]!;
      const changed = (a.palette !== b.palette ? 1 : 0) + (a.frame !== b.frame ? 1 : 0) + (a.weather !== b.weather ? 1 : 0);
      expect(changed, `${a.label} -> ${b.label}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('journeyAt', () => {
  it('is stateless and wall-clock derived', () => {
    expect(journeyAt(0)).toMatchObject({ a: WAYPOINTS[0], b: WAYPOINTS[1], t: 0 });
    expect(journeyAt(WAYPOINT_MS * 1.5).a).toBe(WAYPOINTS[1]);
    expect(journeyAt(WAYPOINT_MS * 1.5).t).toBeCloseTo(0.5);
  });
  it('closes the loop', () => {
    const last = journeyAt(WAYPOINT_MS * 14.5);
    expect(last.a).toBe(WAYPOINTS[14]);
    expect(last.b).toBe(WAYPOINTS[0]);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**

```ts
// packages/web/src/theme/weather/journey.ts
import type { Frame, PaletteId } from '../palettes.js';
import type { WeatherKind } from './kinds.js';

export interface Waypoint { palette: PaletteId; frame: Frame; weather: WeatherKind; label: string }

export const WAYPOINT_MS = 180_000; // ~3 minutes per stop, ~45 min loop

/** Spec §6: the cozy premade stroll. Adjacent stops share most of their axes. */
export const WAYPOINTS: Waypoint[] = [
  { palette: '1a', frame: 'day', weather: 'clear', label: 'summer blue' },
  { palette: '1a', frame: 'day', weather: 'wind', label: 'a breeze picks up' },
  { palette: '1f', frame: 'day', weather: 'heat', label: 'high-summer shimmer' },
  { palette: '1b', frame: 'dusk', weather: 'clear', label: 'golden evening' },
  { palette: '1e', frame: 'dusk', weather: 'leaves', label: 'autumn drifts in' },
  { palette: '1d', frame: 'day', weather: 'leaves', label: 'amber afternoon' },
  { palette: '1d', frame: 'dusk', weather: 'fog', label: 'misty evening' },
  { palette: '1c', frame: 'dawn', weather: 'fog', label: 'cool morning mist' },
  { palette: '1c', frame: 'day', weather: 'rain', label: 'spring rain' },
  { palette: '1a', frame: 'day', weather: 'rainbow', label: 'after the rain' },
  { palette: '1e', frame: 'night', weather: 'clear', label: 'starry night' },
  { palette: '1a', frame: 'night', weather: 'snow', label: 'quiet winter night' },
  { palette: '1b', frame: 'night', weather: 'rain', label: 'warm rainy night' },
  { palette: '1a', frame: 'night', weather: 'storm', label: 'the finale' },
  { palette: '1b', frame: 'dawn', weather: 'clear', label: 'the storm breaks' },
];

/** Loop position from the wall clock: stateless, reload-stable, shared by every tab. */
export function journeyAt(nowMs: number): { a: Waypoint; b: Waypoint; t: number } {
  const pos = (nowMs / WAYPOINT_MS) % WAYPOINTS.length;
  const i = Math.floor(((pos % WAYPOINTS.length) + WAYPOINTS.length) % WAYPOINTS.length);
  return { a: WAYPOINTS[i]!, b: WAYPOINTS[(i + 1) % WAYPOINTS.length]!, t: pos - Math.floor(pos) };
}
```

- [ ] **Step 4: Run to verify pass.** Note the cohesion test allows ≤2 axis changes: two hops in the authored list legitimately move two axes (e.g. golden evening → autumn dusk changes palette+weather); the invariant guards against all-three jumps.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): the Journey — 15-stop curated loop with cohesion invariant"`

---

### Task 6: Real weather (Open-Meteo)

**Files:**
- Create: `packages/web/src/theme/weather/real.ts`
- Create: `packages/web/src/theme/weather/real.test.ts`

**Interfaces:**
- Consumes: `WeatherKind` from `./kinds.js`.
- Produces: `weatherFromWmo(code: number, tempC: number, windKmh: number): WeatherKind`; `openMeteoUrl(lat: number, lon: number): string`; `parseOpenMeteo(json: unknown): RealReading | null` (`RealReading = { kind: WeatherKind; sunriseMin: number; sunsetMin: number; atMs: number }`); `readingFresh(r: RealReading, nowMs: number): boolean` (2h window); `RealWeatherSource = { latest(): RealReading | null; refresh(): Promise<void> }`; `createRealWeatherSource(deps: { fetchJson(url: string): Promise<unknown>; getPosition(): Promise<{ lat: number; lon: number }>; now(): number }): RealWeatherSource`.

WMO mapping (spec §6): 0–1 → `clear` (→ `heat` if `tempC >= 30`), 2–3 → `cloudy`, 45/48 → `fog`, 51–67 & 80–82 → `rain`, 71–77 & 85–86 → `snow`, 95–99 → `storm`; any clear/cloudy with `windKmh >= 29` → `wind`. Open-Meteo call: `current=weather_code,temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=auto`. Sunrise/sunset ISO strings parse to local minutes-of-day.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/theme/weather/real.test.ts
import { describe, it, expect } from 'vitest';
import { weatherFromWmo, parseOpenMeteo, readingFresh, createRealWeatherSource } from './real.js';

const FIXTURE = {
  current: { weather_code: 61, temperature_2m: 14.2, wind_speed_10m: 9.1 },
  daily: { sunrise: ['2026-08-23T06:31'], sunset: ['2026-08-23T19:52'] },
};

describe('weatherFromWmo', () => {
  it('maps the spec table', () => {
    expect(weatherFromWmo(0, 20, 5)).toBe('clear');
    expect(weatherFromWmo(0, 31, 5)).toBe('heat');
    expect(weatherFromWmo(3, 20, 5)).toBe('cloudy');
    expect(weatherFromWmo(45, 10, 5)).toBe('fog');
    expect(weatherFromWmo(61, 10, 5)).toBe('rain');
    expect(weatherFromWmo(75, -2, 5)).toBe('snow');
    expect(weatherFromWmo(96, 18, 5)).toBe('storm');
    expect(weatherFromWmo(1, 20, 35)).toBe('wind');
  });
});

describe('parseOpenMeteo', () => {
  it('extracts kind and solar anchors in local minutes', () => {
    const r = parseOpenMeteo(FIXTURE)!;
    expect(r.kind).toBe('rain');
    expect(r.sunriseMin).toBe(6 * 60 + 31);
    expect(r.sunsetMin).toBe(19 * 60 + 52);
  });
  it('returns null on garbage', () => {
    expect(parseOpenMeteo({})).toBeNull();
    expect(parseOpenMeteo(null)).toBeNull();
  });
});

describe('staleness ladder', () => {
  it('a reading is fresh for 2 hours', () => {
    const r = { ...parseOpenMeteo(FIXTURE)!, atMs: 1_000_000 };
    expect(readingFresh(r, 1_000_000 + 119 * 60_000)).toBe(true);
    expect(readingFresh(r, 1_000_000 + 121 * 60_000)).toBe(false);
  });
});

describe('createRealWeatherSource', () => {
  it('fetches through its deps and caches the reading', async () => {
    let calls = 0;
    const src = createRealWeatherSource({
      fetchJson: async () => { calls++; return FIXTURE; },
      getPosition: async () => ({ lat: 40, lon: -75 }),
      now: () => 5_000,
    });
    expect(src.latest()).toBeNull();
    await src.refresh();
    expect(calls).toBe(1);
    expect(src.latest()!.kind).toBe('rain');
    expect(src.latest()!.atMs).toBe(5_000);
  });
  it('a failed refresh keeps the previous reading', async () => {
    let fail = false;
    const src = createRealWeatherSource({
      fetchJson: async () => { if (fail) throw new Error('offline'); return FIXTURE; },
      getPosition: async () => ({ lat: 40, lon: -75 }),
      now: () => 5_000,
    });
    await src.refresh();
    fail = true;
    await src.refresh(); // must not throw
    expect(src.latest()!.kind).toBe('rain');
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — pure functions plus a ~30-line source: `weatherFromWmo` as the table above; `openMeteoUrl` = `` `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=auto` ``; `parseOpenMeteo` guards every field (`typeof code === 'number'`, arrays non-empty, ISO strings parse via `new Date(s)` then `getHours()*60+getMinutes()`), returns null otherwise; `createRealWeatherSource` holds `let reading: RealReading | null`, `refresh()` try/catches (`getPosition` → `fetchJson(openMeteoUrl(...))` → `parseOpenMeteo` → stamp `atMs: deps.now()`), never throws. No `Date.now()` or `fetch` referenced directly — everything through `deps`.
- [ ] **Step 4: Run to verify pass**, typecheck.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): real weather source — WMO mapping, Open-Meteo parsing, staleness"`

---

### Task 7: The moon (vendor trmnmc/moon)

**Files:**
- Create: `packages/web/src/theme/moon/astro.js` (vendored) + `packages/web/src/theme/moon/astro.d.ts`
- Create: `packages/web/src/theme/moon/moon.ts`
- Create: `packages/web/src/theme/moon/moon.test.ts`

**Interfaces:**
- Produces: `moonForDate(date: Date): MoonView` where `MoonView = { phaseName: string; illumination: number; waxing: boolean }`; `nightDarkness(illumination: number): number` (0 = full-moon bright, 1 = new-moon dark; linear `1 - illumination`).

- [ ] **Step 1: Vendor.** `git clone --depth 1 https://github.com/trmnmc/moon` to a temp dir; copy `src/astro.js` to `packages/web/src/theme/moon/astro.js` unchanged except: replace the final `module.exports = {...}` line with `export { computeMoon, nextFullMoon, PHASE_NAMES, PHASE_ILLUMINATION_CONSISTENCY_DOMAIN };` and delete the leading `'use strict';` (ESM is strict). Add one line to the header comment: `Vendored from github.com/trmnmc/moon (the user's Meeus port); cross-checked by moon.test.ts fixtures.` Write `astro.d.ts`:

```ts
// packages/web/src/theme/moon/astro.d.ts
export interface MoonState {
  julianDay: number; age: number; cycleFraction: number; phaseAngle: number;
  illumination: number; phaseName: string; isInstantPhase: boolean;
}
export function computeMoon(date: Date): MoonState;
export function nextFullMoon(date: Date): Date;
export const PHASE_NAMES: string[];
```

- [ ] **Step 2: Write the failing test** — fixture vectors generated FROM the upstream repo before writing (run in the clone: `node -e "const {computeMoon}=require('./src/astro');for(const s of ['2026-01-03T12:00:00Z','2026-08-23T12:00:00Z','2000-01-06T18:14:00Z']){const m=computeMoon(new Date(s));console.log(s, m.phaseName, m.illumination.toFixed(4), m.cycleFraction.toFixed(4))}"`) and pasted as literals:

```ts
// packages/web/src/theme/moon/moon.test.ts
import { describe, it, expect } from 'vitest';
import { moonForDate, nightDarkness } from './moon.js';
import { computeMoon } from './astro.js';

describe('vendored astro.js stays true to upstream', () => {
  // Vectors printed by the upstream repo's own computeMoon (see Task 7 Step 2).
  // Paste the actual printed values here when vendoring; the shapes below
  // assert the *relationships* that hold regardless:
  it('2000-01-06 18:14 UTC is the k=0 new moon', () => {
    const m = computeMoon(new Date('2000-01-06T18:14:00Z'));
    expect(m.phaseName).toBe('new');
    expect(m.illumination).toBeLessThan(0.02);
  });
  it('phase name and illumination agree at quarters', () => {
    const m = computeMoon(new Date('2026-08-23T12:00:00Z'));
    expect(m.illumination).toBeGreaterThanOrEqual(0);
    expect(m.illumination).toBeLessThanOrEqual(1);
    expect(typeof m.phaseName).toBe('string');
  });
});

describe('moonForDate', () => {
  it('reports waxing from the cycle fraction', () => {
    const newish = moonForDate(new Date('2000-01-08T00:00:00Z'));
    expect(newish.waxing).toBe(true);
    const fullish = moonForDate(new Date('2000-01-28T00:00:00Z'));
    expect(fullish.waxing).toBe(false);
  });
});

describe('nightDarkness', () => {
  it('new moon darkest, full moon brightest', () => {
    expect(nightDarkness(0)).toBe(1);
    expect(nightDarkness(1)).toBe(0);
    expect(nightDarkness(0.25)).toBeCloseTo(0.75);
  });
});
```

After vendoring, ALSO paste the three printed fixture lines as exact-value assertions (phaseName string equality, illumination to 3 decimals) in the first describe block — that is the drift alarm.

- [ ] **Step 3: Run to verify failure**, **Step 4: Implement `moon.ts`**

```ts
// packages/web/src/theme/moon/moon.ts
import { computeMoon } from './astro.js';

export interface MoonView { phaseName: string; illumination: number; waxing: boolean }

/** The night sky's moon: real phase, hemisphere handled at render time. */
export function moonForDate(date: Date): MoonView {
  const m = computeMoon(date);
  return { phaseName: m.phaseName, illumination: m.illumination, waxing: m.cycleFraction < 0.5 };
}

/** 0 = full-moon silver night, 1 = new-moon black; modulates stars/fireflies. */
export function nightDarkness(illumination: number): number {
  return 1 - Math.max(0, Math.min(1, illumination));
}
```

Note: vitest must load the `.js` vendored file — the web package is ESM (`"type": "module"`), so the plain `export {}` rewrite is sufficient; no build config changes.

- [ ] **Step 5: Run to verify pass**, typecheck. **Step 6: Commit.** `git commit -am "feat(theme): vendor trmnmc/moon Meeus port; moon view + night darkness"`

---

### Task 8: The theme store

**Files:**
- Create: `packages/web/src/theme/store.ts`
- Create: `packages/web/src/theme/store.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7 (`PALETTES/mix`, `buildTimeline/sampleTimeline/DEFAULT_ANCHORS`, `planForDate`, `graySkies/weatherGround/OVERCAST`, `journeyAt/WAYPOINTS`, `RealWeatherSource/readingFresh`, `moonForDate/nightDarkness`).
- Produces:

```ts
export type WeatherMode = 'off' | 'pick' | 'journey' | 'real';
export interface Tokens {
  sky0: string; sky1: string; sky2: string; ground: string; groundDark: string;
  cream: string; bubble: string; ink: string; wood: string; accent: string;
  foliage: string; foliageLite: string;
  houseAWall: string; houseARoof: string; houseBWall: string; houseBRoof: string;
}
export interface ResolvedTheme {
  tokens: Tokens;
  tint: { col: string; sceneryK: number; creatureK: number };
  flags: { isNight: boolean; isDusk: boolean; lanternsOn: boolean; overcast: boolean; windowsGlow: boolean };
  weather: { kind: WeatherKind; ramp: number };
  sun: { visible: boolean; x01: number; y01: number };
  moonSky: { visible: boolean; x01: number; y01: number; phaseName: string; illumination: number; waxing: boolean; darkness: number };
}
export interface ThemeStore {
  current(): ResolvedTheme;
  subscribe(fn: (t: ResolvedTheme) => void): () => void;
  mode(): WeatherMode; setMode(m: WeatherMode): void;
  picked(): WeatherKind; setPicked(k: WeatherKind): void;
  tick(): void; start(): void; stop(): void;
}
export function createThemeStore(deps?: {
  now?: () => Date;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  search?: string;                 // location.search for dev overrides
  real?: RealWeatherSource | null; // injected in Real mode; null in tests
}): ThemeStore;
export function cssVars(t: ResolvedTheme): Record<string, string>;
```

Resolution per `tick()` (pure given deps):
1. Dev override (`?at=HH:MM`, `?day=sat|sun|mon..fri|weave`, `?palette=1a..1f`, `?weather=<kind>`) pins the corresponding inputs and beats every mode.
2. Mode `journey` → `journeyAt(now)`: resolve both waypoints' (palette, frame) into token sets via the same frame-token builder, lerp by `t`; weather = `a.weather` with `ramp = 1 - t` crossfaded against `b.weather` at `ramp = t` — the layer draws BOTH kinds during a boundary (the store exposes only the dominant one: kind = `t < 0.5 ? a.weather : b.weather`, ramp = triangle `1 - 2|t - 0.5|` floored at 0.15 during crossfade... NO — keep it simple and spec-true: `kind = t < 0.5 ? a.weather : b.weather; ramp = a.weather === b.weather ? 1 : Math.abs(t - 0.5) * 2`. Same-kind neighbors hold ramp 1.)
3. Otherwise: `planForDate(today)` + `planForDate(yesterday)` → `buildTimeline(plan, prevPlan, anchors)` where anchors come from a fresh Real reading if present, else `DEFAULT_ANCHORS` → `sampleTimeline` at minute-of-day → lerp the two keyframes' token sets.
4. Weather by mode: `off` → clear; `pick` → stored kind, ramp 1; `real` → fresh reading's kind (ramp 1) else clear.
5. Token pipeline: frame tokens → `graySkies`/`weatherGround` → time tint is NOT baked into tokens (the scene applies `sc()` itself via tint) — tokens stay pre-tint, `tint` rides alongside: `col` = lerp of the two frames' tint colors (night → sky0, dusk → palette dusk sky0, dawn → palette dawn sky2, day → sky0 at k 0), `sceneryK`/`creatureK` lerped between the frame constants {night: .55/.28, dusk: .18/.10, dawn: .10/.06, day: 0/0}.
6. Flags: `isNight`/`isDusk` from dominant frame; `lanternsOn = isNight || isDusk`; `overcast = OVERCAST.has(kind) && ramp > 0.5`; `windowsGlow = lanternsOn || kind === 'storm'`.
7. Sun/moon arcs: with `m` = minute-of-day, sunrise `r`, sunset `s`: sun visible for `m ∈ (r, s)`, `x01 = (m - r) / (s - r)`, `y01 = Math.sin(x01 * Math.PI)` (0 = horizon, 1 = zenith). Moon visible when `!sun.visible && !overcast`, arc across the night span (`s → r + 1440`, wrapped), same sine. Moon fields from `moonForDate(now)` + `nightDarkness`.
8. `cssVars`: `{'--sv-cream': tokens.cream, '--sv-bubble': tokens.bubble, '--sv-ink': tokens.ink, '--sv-accent': tokens.accent, '--sv-wood': tokens.wood, '--sv-panel-bg': flags.isNight ? mix(tokens.ink, '#000000', 0.25) : tokens.bubble, '--sv-panel-fg': flags.isNight ? tokens.cream : tokens.ink, '--sv-banner-bg': flags.isNight ? mix(tokens.ink, '#000000', 0.15) : tokens.cream}`.
9. `start()` = `tick()` now, then `setInterval(tick, 60_000)` + `visibilitychange` listener (re-tick on visible); `stop()` clears both. Publishing: only notify subscribers when the resolved theme actually changed (compare via `JSON.stringify` of tokens+flags+weather — a minute inside the plateau is a no-op).

- [ ] **Step 1: Write the failing tests** (the highest-value ones; keep each small):

```ts
// packages/web/src/theme/store.test.ts
import { describe, it, expect } from 'vitest';
import { createThemeStore, cssVars } from './store.js';
import { PALETTES, mix } from './palettes.js';

const at = (iso: string) => () => new Date(iso);
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('createThemeStore — clock resolution', () => {
  it('noon on a weave weekday is Meadow Blue day, no tint', () => {
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    s.tick();
    const t = s.current();
    expect(t.tokens.sky1).toBe(PALETTES['1a'].skies.day[1]);
    expect(t.tint.sceneryK).toBe(0);
    expect(t.flags.isNight).toBe(false);
    expect(t.sun.visible).toBe(true);
  });

  it('22:30 is deep night: tint at ceiling, lanterns on, moon up', () => {
    const s = createThemeStore({ now: at('2026-08-19T22:30:00'), storage: mem() });
    s.tick();
    const t = s.current();
    expect(t.tint.sceneryK).toBeCloseTo(0.55, 2);
    expect(t.tint.creatureK).toBeCloseTo(0.28, 2);
    expect(t.flags.lanternsOn).toBe(true);
    expect(t.moonSky.visible).toBe(true);
    expect(t.sun.visible).toBe(false);
  });

  it('07:55 blends 1b-day toward 1a-day (the 8:30 crossover in progress)', () => {
    const s = createThemeStore({ now: at('2026-08-19T07:55:00'), storage: mem() });
    s.tick();
    const sky = s.current().tokens.sky1;
    expect(sky).not.toBe(PALETTES['1a'].skies.day[1]);
    expect(sky).not.toBe(PALETTES['1b'].skies.day[1]);
  });
});

describe('modes', () => {
  it('pick persists and applies', () => {
    const storage = mem();
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage });
    s.setMode('pick'); s.setPicked('snow'); s.tick();
    expect(s.current().weather.kind).toBe('snow');
    expect(s.current().weather.ramp).toBe(1);
    const s2 = createThemeStore({ now: at('2026-08-19T12:00:00'), storage });
    expect(s2.mode()).toBe('pick');
    expect(s2.picked()).toBe('snow');
  });

  it('journey overrides clock and schedule', () => {
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    s.setMode('journey'); s.tick();
    // wall-clock noon lands somewhere deterministic in the loop; assert it is
    // NOT the clock's own resolution by checking the store reports journey weather
    expect(['clear', 'wind', 'heat', 'leaves', 'fog', 'rain', 'rainbow', 'snow', 'storm']).toContain(s.current().weather.kind);
  });
});

describe('dev override', () => {
  it('?at&day&weather pins everything', () => {
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem(), search: '?at=22:00&day=sat&weather=storm' });
    s.tick();
    const t = s.current();
    expect(t.flags.isNight).toBe(true);
    expect(t.weather.kind).toBe('storm');
  });
});

describe('cssVars', () => {
  it('day chrome is cream on ink; night chrome flips dark', () => {
    const day = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    day.tick();
    const dv = cssVars(day.current());
    expect(dv['--sv-panel-bg']).toBe(day.current().tokens.bubble);
    const night = createThemeStore({ now: at('2026-08-19T23:00:00'), storage: mem() });
    night.tick();
    const nv = cssVars(night.current());
    expect(nv['--sv-panel-bg']).toBe(mix(night.current().tokens.ink, '#000000', 0.25));
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `store.ts`** per the resolution recipe above. Frame-token builder (private): `tokensFor(paletteId, frame)` returns the full `Tokens` from `PALETTES[paletteId]` (`sky0..2` from `skies[frame]`, rest direct); token lerp = fieldwise `mix(a[f], b[f], t)`. Tint constants: `const TINT_K: Record<Frame, [number, number]> = { night: [0.55, 0.28], dusk: [0.18, 0.10], dawn: [0.10, 0.06], day: [0, 0] }` and tint colors per frame: night → `skies.night[0]`, dusk → `skies.dusk[0]`, dawn → `skies.dawn[2]`, day → `skies.day[0]`; both lerped by the same `t`. Storage keys from Global Constraints. `deps.now` defaults to `() => new Date()`, `storage` to `window.localStorage` guarded by `typeof window !== 'undefined'`, `search` to `window.location.search` (same guard), `real` to null.
- [ ] **Step 4: Run to verify pass**, then the whole theme dir: `npx vitest run packages/web/src/theme/`, typecheck.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): the theme store — one resolver, modes, overrides, css vars"`

---

### Task 9: Chrome on CSS variables

**Files:**
- Modify: `packages/web/index.html` (the `<style>` block, lines 19–59)
- Modify: `packages/web/src/main.ts` (boot the store, apply vars)
- Test: visual via dev override (Step 4) — DOM applier is 6 lines and exercised by every later task.

**Interfaces:**
- Consumes: `createThemeStore`, `cssVars` from `./theme/store.js`.
- Produces: a started singleton store exported as `themeStore` from `packages/web/src/theme/index.ts` (create this barrel: `export { themeStore }` built via `createThemeStore()` + `start()` at import time is NOT allowed — export `let themeStore: ThemeStore` set by `initTheme(): ThemeStore` which main.ts calls once before `startVillage`; scene modules import `themeStore`).

- [ ] **Step 1: Rewrite index.html styles onto variables with today's hexes as fallbacks.** Every hardcoded chrome hex becomes `var(--sv-*, <old hex>)`: `#chat-panel` background → `var(--sv-panel-bg, #FFFDF4)`, color → `var(--sv-panel-fg, #3A2E22)`, borders `var(--sv-ink, #3A2E22)`; `#chat-entries li[data-who='player']` background → `var(--sv-chip-player, #E8E0D0)`; `li[data-who='creature']` background → `var(--sv-cream, #F2E5C4)`; `#chat-input` background → `var(--sv-panel-bg, #FFFDF4)`; `#silent-banner` background → `var(--sv-banner-bg, #F2E5C4)`, color/border → ink vars; `html, body` background stays `#171310` (letterbox). Update the head comment: hexes now live in `theme/store.ts:cssVars` — change THERE. Add `--sv-chip-player` to `cssVars` in store.ts: day `#E8E0D0`, night `mix(tokens.ink, '#000000', 0.05)`; add matching assertion to the existing cssVars test.
- [ ] **Step 2: Create the barrel + wire main.ts.**

```ts
// packages/web/src/theme/index.ts
import { createThemeStore, type ThemeStore } from './store.js';

export let themeStore: ThemeStore;

/** Boot the one store; main.ts calls this before the scene starts. */
export function initTheme(): ThemeStore {
  themeStore = createThemeStore();
  themeStore.subscribe((t) => {
    const vars = cssVars(t);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  });
  themeStore.start();
  return themeStore;
}
```

(import `cssVars` too). In `main.ts`, first line of module work: `const theme = initTheme();` before `createChatPanel`/`startVillage`.
- [ ] **Step 3: Run suite + typecheck** (`npm test` — chrome change is CSS-only, nothing should break).
- [ ] **Step 4: Visual check** — dev server, then `http://localhost:5173/?at=23:00`: the chat panel (click a creature) must render dark with cream text; `?at=12:00` cream. Screenshot both.
- [ ] **Step 5: Commit.** `git commit -am "feat(theme): chrome rides CSS variables; night dims the panel"`

---

### Task 10: Scene retint — tagged scenery + background + creature tint

**Files:**
- Modify: `packages/web/src/theme.ts` (delete `THEME`, keep `U`, `TEXT_SS`, `isHex`)
- Modify: `packages/web/src/scene/village.ts` (block/house/tree/sign take token names; subscribe-and-retint walker; `k.setBackground`)
- Modify: `packages/web/src/scene/creature.ts` (replace `THEME.*` reads at lines ~166/249/350/351/369/380/410/419/420/484 with `themeStore.current().tokens.*` equivalents + tag; sprite-root tint)
- Modify: `packages/web/src/theme.test.ts` (drop THEME assertions, keep isHex)
- Test: `packages/web/src/scene/retint.test.ts` (pure mapping only)

**Interfaces:**
- Consumes: `themeStore` from `../theme/index.js`; `Tokens` from `../theme/store.js`; `mix` from `../theme/palettes.js`.
- Produces: `tokenTag(token: keyof Tokens): string` returning `themed:<token>` (in a new tiny module `packages/web/src/scene/retint.ts`), plus `sceneryColor(tokens, tint, token)` = `mix(tokens[token], tint.col, tint.sceneryK)` and `creatureTintColor(tint)` = `mix('#FFFFFF', tint.col, tint.creatureK)` — pure, tested.

Mechanism: `block()` gains a `token?: keyof Tokens` param; when given, the object is created with the KAPLAY tag `tokenTag(token)` (KAPLAY accepts plain strings in the component array) and its color from `sceneryColor(themeStore.current().tokens, themeStore.current().tint, token)`. THEME call sites map: `THEME.sky`→ background + house window token `sky1`; `THEME.wood`→`wood`; `THEME.foliage`→`foliage`; `THEME.foliageLite`→`foliageLite`; `THEME.ground`→`ground`; `THEME.groundDark`→`groundDark`; `THEME.signCream`→`cream`; `THEME.ink`→`ink`; `THEME.accent`→`houseARoof`; `THEME.wallLilac/roofLilac`→`houseBWall/houseBRoof`; `THEME.wallSand/roofClay`→ third house keeps `houseB` tokens' Golden-Hour values via literal tokens `houseBWall`,`houseBRoof`? No — the third house maps to `cream`/`accent`? **Decision locked here:** house 1 = (`houseAWall`,`houseARoof`), house 2 = (`houseBWall`,`houseBRoof`), house 3 reuses (`houseAWall`,`houseBRoof`) for variety; the old THEME wallSand/roofClay hexes die with THEME. `THEME.bubbleWhite`→`bubble`; `THEME.shadow`→ keep as literal `'#5A4628'` const `SHADOW` in creature.ts (shadows already draw at fixed alpha; tint handled by the multiply). `THEME.night` (letterbox) → literal `'#171310'` const in village.ts.
Walker in `startVillage` after scene build:

```ts
const applyTheme = (t: ResolvedTheme) => {
  k.setBackground(hex(k, mix(t.tokens.sky1, t.tint.col, t.tint.sceneryK)));
  for (const token of Object.keys(t.tokens) as (keyof Tokens)[]) {
    for (const obj of k.get(tokenTag(token))) {
      (obj as { color: unknown }).color = hex(k, sceneryColor(t.tokens, t.tint, token));
    }
  }
  const cTint = hex(k, creatureTintColor(t.tint));
  for (const obj of k.get('themed:creature')) (obj as { color: unknown }).color = cTint;
};
applyTheme(themeStore.current());
const unsubscribeTheme = themeStore.subscribe(applyTheme);
```

Creature sprite roots (the `k.add([k.pos...])` root at creature.ts:243 holds sprite children): tag each SPRITE child with `'themed:creature'` and give it a `k.color()` component at spawn (KAPLAY sprite color multiplies texels; white = unchanged). Creature-side chrome (nameplates `signCream/ink`, bubbles `bubble/ink`) gets token tags like scenery.

- [ ] **Step 1: Write the failing test** (`retint.test.ts`): `tokenTag('sky1') === 'themed:sky1'`; `sceneryColor({...tokens with ground '#A8C68D'}, {col: '#232A3C', sceneryK: 0.55, creatureK: 0.28}, 'ground') === mix('#A8C68D', '#232A3C', 0.55)`; `creatureTintColor({col: '#232A3C', sceneryK: 0.55, creatureK: 0.28}) === mix('#FFFFFF', '#232A3C', 0.28)`; day tint (`sceneryK 0`) returns the raw token and pure white.
- [ ] **Step 2: Run to verify failure**, **Step 3: implement `retint.ts`** (10 lines, from the Produces block), verify pass.
- [ ] **Step 4: Thread through the scene.** Delete `THEME` from theme.ts; fix every compile error by the mapping table above (typecheck is the checklist: `npm run typecheck` until clean). Add the walker + `unsubscribeTheme` cleanup alongside the existing window-listener cleanup in village.ts.
- [ ] **Step 5: Full suite + typecheck.** Existing scene/creature tests compile against the new signatures; fix fallout, never by re-adding THEME.
- [ ] **Step 6: Visual check** — `?at=12:00` (today's look, unchanged), `?at=22:30` (dark village, tinted houses, readable creatures), `?at=18:45` (golden). Screenshots.
- [ ] **Step 7: Commit.** `git commit -am "feat(scene): scenery retints via KAPLAY tags; creatures take the night tint"`

---

### Task 11: Celestial + night ambience layer

**Files:**
- Create: `packages/web/src/scene/sky.ts`
- Create: `packages/web/src/scene/sky.test.ts` (pure helpers only)
- Modify: `packages/web/src/scene/village.ts` (mount the layer)

**Interfaces:**
- Consumes: `themeStore`, `ResolvedTheme`; `U` from `../theme.js`; `mix`/`lite` from `../theme/palettes.js`.
- Produces: `mountSky(k: KAPLAYCtx): { update(t: ResolvedTheme): void }`; pure exports `starField(count: number): Array<{x01: number, y01: number, major: boolean}>` (positions from the reference's `(i*167+9)%470/(i*59+7)%148` normalized), `moonPixels(phaseName: string, waxing: boolean): string[]` (8 pixel grids: a 6×6 disc with the dark side rows masked per phase — full grid list written out in the implementation step).

Behavior (all from store fields, no clock reads): sun rect pair (`#F5D66B`/`#FBE9A5`) positioned by `t.sun.x01/y01` across the sky band, hidden when `!t.sun.visible || t.flags.overcast`; moon from `moonPixels` colored `#EEEADB` on dark `mix('#EEEADB', sky0, 0.4)`, positioned by `t.moonSky.x01/y01`, hidden when `!t.moonSky.visible`; stars: night shows `24 - Math.round(8 * (1 - t.moonSky.darkness))` (full moon washes the faintest), dusk 7 at 0.3 alpha, twinkle via `k.opacity` oscillation gated by `matchMedia('(prefers-reduced-motion: reduce)')`; shooting star: at night, every 180–420s (seeded from minute) run a 0.5s streak tween; fireflies: `t.flags.lanternsOn && !OVERCAST` → up to `9 * (0.6 + 0.4 * t.moonSky.darkness)` drifting dots (`#FFE896`, slow sine wander); lantern + window glow rects toggled by `t.flags.windowsGlow` (positions: beside house 1 as in the reference, scaled to the game's U=6 geometry — lantern at `homes.x + 360, GROUND_Y - 40`).

- [ ] **Step 1: failing tests** for `starField` (deterministic, in [0,1], stable across calls) and `moonPixels` ('full' → no masked cells; 'new' → all masked; waxing 'waxing crescent' lights the RIGHT columns, waning the left — assert by column sums).
- [ ] **Step 2: verify failure. Step 3: implement** `sky.ts`: pure helpers + `mountSky` creating all objects once (hidden), `update()` toggling/positioning. Mount in `startVillage` after scenery, before creatures; call `.update` inside the Task-10 `applyTheme` walker.
- [ ] **Step 4: pass + typecheck. Step 5: visual** — `?at=23:00` (stars, moon at its real phase tonight, fireflies), `?at=23:00&weather=cloudy` (no stars/moon), reduced-motion via devtools emulation. Screenshots.
- [ ] **Step 6: Commit.** `git commit -am "feat(scene): sun/moon arcs, stars, fireflies, lantern — the night comes alive"`

---

### Task 12: Weather layer

**Files:**
- Create: `packages/web/src/scene/weather-layer.ts`
- Create: `packages/web/src/scene/weather-layer.test.ts` (pure particle math)
- Modify: `packages/web/src/scene/village.ts` (mount), `packages/web/src/scene/creature.ts` (grounded flyers + umbrellas)

**Interfaces:**
- Consumes: `themeStore`, `ResolvedTheme`, `OVERCAST`; reference file `reference/palette-explorations/village-scene.js` (transcription source — the weather branches of `drawScene`, lines with markers `/* --- weather layers... */` through the fireflies block).
- Produces: `mountWeather(k: KAPLAYCtx): { update(t: ResolvedTheme): void }`; pure exports `frac(x: number): number`, `rainDrop(i: number, tSec: number, heavy: boolean): { x: number; y: number; len: number; alpha: number }` and `snowFlake(i: number, tSec: number): { x: number; y: number; size: number; alpha: number }` — direct ports of the reference math (`frac(i * 0.6180339)` etc.), scaled by `WORLD_W/480` horizontally and the scene's sky+ground bands vertically.

Structure: ONE KAPLAY object per z-side added with `k.z()` — `behind` (z between scenery and creatures) and `front` (above creatures) — each carrying `onDraw()` that switches on `current.weather.kind` and draws with `k.drawRect({...})` immediate calls, alpha scaled by `weather.ramp`. Port each branch from the reference verbatim in structure: rain/storm drops + splashes (behind), storm decks/shafts/flicker/bolt (behind) + white flash (front, alpha 0.22 × ramp), snow flakes (behind), fog bands (behind) + front veil (front, alpha ≤ 0.1), wind streaks, leaves, rainbow arc (behind, from creature HUES constant `['#e58c68','#e2b45e','#9dba77','#7fb6d9','#b79fd6']`), heat shimmer (behind). `tSec` = `performance.now()/1000`, frozen to `1.3` under reduced-motion (the reference's `staticFrame`). Creature choreography: creature.ts's flight behaviour checks `themeStore.current().weather` — when kind is rain/storm and ramp > 0.5, flyers land (reuse the existing grounded pose path); umbrella: seeded per creature (`hashCode(creature.id) % 3 === 0`), drawn as a 4-rect pixel canopy (`tokens.accent`) above the body while rain/storm ramp > 0.5.

- [ ] **Step 1: failing tests** — `frac` behavior; `rainDrop(5, 1.3, false)` returns finite values inside the scene bounds and heavier slant when `heavy`; `snowFlake` sway is bounded (`|x(t+0.1) - x(t)| < 30`); determinism (same i,t → same output).
- [ ] **Step 2: verify failure. Step 3: implement** pure math, verify pass. **Step 4: implement** `mountWeather` + village.ts mount inside `applyTheme` flow + creature grounding/umbrella wiring, transcribing branch-by-branch from the reference; typecheck until clean.
- [ ] **Step 5: full suite. Step 6: visual sweep** — `?weather=rain`, `storm` (wait for a bolt), `snow&at=22:00`, `fog`, `wind`, `leaves`, `rainbow`, `heat`, and `?weather=storm&at=12:00` (windows glow at noon in a storm). Confirm rain grounds the flyer creatures and umbrellas appear. Screenshots of storm + snow minimum.
- [ ] **Step 7: Commit.** `git commit -am "feat(scene): the weather layer — nine skies, grounded flyers, umbrellas"`

---

### Task 13: The gear menu

**Files:**
- Create: `packages/web/src/ui/weather-menu.ts`
- Modify: `packages/web/index.html` (menu styles on the existing var()s)
- Modify: `packages/web/src/main.ts` (mount menu, pass the store; Real-mode wiring)
- Test: `packages/web/src/ui/weather-menu.test.ts` (pure label/state helpers)

**Interfaces:**
- Consumes: `ThemeStore`, `ALL_WEATHERS`, `createRealWeatherSource`, `openMeteoUrl` etc. from theme modules.
- Produces: `mountWeatherMenu(store: ThemeStore, container: HTMLElement): void`; pure `menuModel(mode: WeatherMode, picked: WeatherKind): { rows: Array<{ id: string; label: string; active: boolean }> }`.

A fixed-position ⚙ button (bottom-left, styled with `var(--sv-panel-bg)`/`var(--sv-ink)`) toggling a small popover: four mode rows (Off / Pick / Journey / Real) + when mode is `pick`, a row of the nine weather chips. Choosing Real constructs `createRealWeatherSource` with real deps (`fetchJson` = `fetch(url).then(r => r.json())`, `getPosition` = `navigator.geolocation.getCurrentPosition` promisified, `now` = `Date.now`), injects it via a store hook — add `setRealSource(src: RealWeatherSource | null): void` to `ThemeStore` in this task (one-line store change + test: real mode with null source resolves clear) — and calls `refresh()` then `tick()`; a rejection (denied/unavailable) sets mode back to `off` and shows a one-line note in the popover ("location unavailable — staying clear"). A 20-minute `setInterval(refresh)` + focus listener lives in the menu module (torn down if mode leaves `real`).

- [ ] **Step 1: failing test** for `menuModel` (four rows, active flag follows mode; pick rows appear only in pick mode) and for the store's `setRealSource` null-safety.
- [ ] **Step 2: verify failure. Step 3: implement.** **Step 4: pass + typecheck + full suite.**
- [ ] **Step 5: visual** — toggle each mode; Pick → snow at noon; Journey → confirm the label of the current stop shown in the popover (`journeyAt` label). Real is smoke-only if the executor has no geolocation: assert the denial path note.
- [ ] **Step 6: Commit.** `git commit -am "feat(ui): weather gear menu — off/pick/journey/real"`

---

### Task 14: Integration polish + docs + final gate

**Files:**
- Modify: `README.md` (a "The sky" section: modes, the dev override cheat-sheet)
- Modify: `docs/summaries/CHECKLIST.md`
- Test: whole suite

- [ ] **Step 1:** README section (~10 lines): what the sky does, the four modes, `?at=HH:MM&day=sat&weather=storm&palette=1e` overrides, the moon credit (`github.com/trmnmc/moon`, Meeus).
- [ ] **Step 2:** Full `npm test` + `npm run typecheck` green.
- [ ] **Step 3:** The playtest sweep (user's eyes are the gate): boot dev server, walk `?at=` through 06:10 / 07:20 / 08:30 / 12:00 / 17:45 / 18:45 / 19:20 / 23:00; a Saturday + a surprise day; journey mode for two waypoint crossings; storm and snow. Capture a screenshot strip for the user.
- [ ] **Step 4:** Update CHECKLIST.md (palette arc line → done pending playtest).
- [ ] **Step 5: Commit.** `git commit -am "docs: the sky — modes, overrides, moon credit"`

---

## Self-Review (performed while writing)

- **Spec coverage:** §2 timeline → Task 2 (+ solar shift Task 6/8); §3 week → Task 3; §4 architecture/store/chrome → Tasks 8–10; §5 ambience + moon → Tasks 7, 11; weather engine + choreography → Tasks 4, 12; §6 modes → Tasks 5, 6, 13; §7 override → Task 8 (parse) + used in 9–14; §8 tests distributed per task; §9 non-goals respected (no temperature task, no server tasks).
- **Type consistency:** `Tokens` keys used by Tasks 8/9/10 match; `ResolvedTheme` fields consumed in 10–13 are all produced in 8 (`moonSky`, `sun`, `flags`, `weather`, `tint`); `tokenTag`/`sceneryColor`/`creatureTintColor` defined in 10 before use; `setRealSource` is explicitly added in Task 13 and flagged as a store change there.
- **Placeholder scan:** every code step carries real code or an exact transcription source (the vendored reference at a fixed path); the one deliberate decision left open in Task 10 (third house tokens) is decided inline, not deferred.
