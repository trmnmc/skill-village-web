# Robot Ceremony Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dropping a creature (villager or genie-framed project) on the robot-house plays a live suck-in ceremony at two judgeable intensities (`?ceremony=a` calm, `?ceremony=b` hit-stop punch) instead of today's silent teleport.

**Architecture:** Pure timing/curve math in a new `scene/ceremony.ts` (tested headless, the `dangle.ts` pattern); a thin KAPLAY skin `scene/ceremonyPlay.ts` drives the existing held-creature visual along the flight; `robotHouse.ts` gains a parent root so it can rock/squash/flash as one body; `village.ts`'s robot-drop branch hands the held visual to the ceremony instead of destroying it. Mechanics unchanged: `setRobotResident` still fires on release.

**Tech Stack:** TypeScript, KAPLAY (existing), vitest. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-project-robot-drag-mobile-design.md` (§2 Ceremony). Touch/perf/readiness are that spec's §3–§6 and get their own plan — this plan is the ceremony subsystem only, live and judgeable on its own.

## Global Constraints

- **No new props on screen** — no stars, notes, faces, hops, confetti. Fun = distorting bodies already present (spec §2).
- **No new dependencies** (spec §9).
- **The weather is untouched** (spec §4).
- **Push every commit immediately** (standing data-loss rule).
- KAPLAY traps already documented in-repo: never pass a `width` option to `k.text` when measuring; colour mutation is a trap — toggle prebuilt fills by `hidden`/`opacity`; `{ recursive: true }` on `k.get` is load-bearing for the retint walker.
- Run everything from the worktree root `C:\Users\truman\OneDrive\Documents\Claude-Projects\skill-village-web\.claude\worktrees\project-robot-drag-animation-5e4cc8`. Full suite baseline before this plan: 955 passed + 1 skipped (or higher — never lower).

---

### Task 1: Pure ceremony math (`ceremony.ts`)

**Files:**
- Create: `packages/web/src/scene/ceremony.ts`
- Test: `packages/web/src/scene/ceremony.test.ts`

**Interfaces:**
- Consumes: nothing (pure module — no KAPLAY, no DOM beyond `location.search` default arg).
- Produces (used by Tasks 3–4 exactly as spelled):
  `type CeremonyPreset = 'a' | 'b'` ·
  `ceremonyPreset(search?: string): CeremonyPreset` ·
  `WIND_S`, `PULL_S`, `CONTACT_AT`, `HITSTOP_S`, `WINDUP_RETREAT`, `ARC_LIFT_FRAC`, `MAX_ROCK_DEG`, `PUNCH_SQUASH`: number constants ·
  `flightFrame(elapsed: number): FlightFrame` where `FlightFrame = { phase: 'windup' | 'pull' | 'contact'; progress: number; sx: number; sy: number; labelAlpha: number }` ·
  `flightPoint(from: {x,y}, to: {x,y}, progress: number): {x,y}` ·
  `impactRock(s: number, preset: CeremonyPreset): number` ·
  `impactSquash(s: number, preset: CeremonyPreset): { sx: number; sy: number }` ·
  `impactFlash(s: number, preset: CeremonyPreset): number` ·
  `impactDone(s: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/scene/ceremony.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CONTACT_AT,
  HITSTOP_S,
  MAX_ROCK_DEG,
  PULL_S,
  WIND_S,
  WINDUP_RETREAT,
  ceremonyPreset,
  flightFrame,
  flightPoint,
  impactDone,
  impactFlash,
  impactRock,
  impactSquash,
} from './ceremony.js';

describe('ceremonyPreset', () => {
  it('defaults to a on empty search', () => expect(ceremonyPreset('')).toBe('a'));
  it('reads b', () => expect(ceremonyPreset('?ceremony=b')).toBe('b'));
  it('falls back to a on junk', () => expect(ceremonyPreset('?ceremony=zzz')).toBe('a'));
});

describe('flightFrame', () => {
  it('backs away during the windup, never forward', () => {
    for (let t = 0; t < WIND_S; t += 0.01) {
      expect(flightFrame(t).progress).toBeLessThanOrEqual(0);
    }
    expect(flightFrame(WIND_S * 0.99).progress).toBeCloseTo(-WINDUP_RETREAT, 2);
  });
  it('fades the label out across the windup', () => {
    expect(flightFrame(0).labelAlpha).toBeCloseTo(1, 5);
    expect(flightFrame(WIND_S * 0.999).labelAlpha).toBeLessThan(0.05);
  });
  it('progress rises monotonically through the pull and reaches 1', () => {
    let prev = -1;
    for (let t = WIND_S; t <= CONTACT_AT; t += 0.005) {
      const p = flightFrame(t).progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(prev).toBeCloseTo(1, 3);
  });
  it('squashes into a streak late in the pull', () => {
    const f = flightFrame(WIND_S + PULL_S * 0.85);
    expect(f.sx).toBeLessThan(0.6);
    expect(f.sy).toBeGreaterThan(1.2);
  });
  it('reports contact once past WIND_S + PULL_S', () => {
    expect(flightFrame(CONTACT_AT + 0.001).phase).toBe('contact');
  });
});

describe('flightPoint', () => {
  const from = { x: 100, y: 200 };
  const to = { x: 500, y: 150 };
  it('hits both endpoints', () => {
    expect(flightPoint(from, to, 0).x).toBeCloseTo(from.x, 6);
    expect(flightPoint(from, to, 0).y).toBeCloseTo(from.y, 6);
    expect(flightPoint(from, to, 1).x).toBeCloseTo(to.x, 6);
    expect(flightPoint(from, to, 1).y).toBeCloseTo(to.y, 6);
  });
  it('arcs above the straight line mid-flight', () => {
    expect(flightPoint(from, to, 0.5).y).toBeLessThan((from.y + to.y) / 2);
  });
});

describe('impact curves', () => {
  it('preset a: rock starts at MAX_ROCK_DEG and settles', () => {
    expect(impactRock(0, 'a')).toBeCloseTo(MAX_ROCK_DEG, 5);
    expect(Math.abs(impactRock(1.2, 'a'))).toBeLessThan(0.05);
  });
  it('preset a: never squashes', () => {
    for (let s = 0; s < 1; s += 0.05) {
      expect(impactSquash(s, 'a')).toEqual({ sx: 1, sy: 1 });
    }
  });
  it('preset b: squash and flash hold frozen through the hit-stop', () => {
    expect(impactSquash(0.001, 'b')).toEqual(impactSquash(HITSTOP_S - 0.001, 'b'));
    expect(impactFlash(0.001, 'b')).toBe(1);
    expect(impactFlash(HITSTOP_S - 0.001, 'b')).toBe(1);
  });
  it('preset b: squash releases into a decaying spring after the stop', () => {
    expect(impactSquash(HITSTOP_S + 0.001, 'b').sy).toBeLessThan(1);
    expect(Math.abs(1 - impactSquash(HITSTOP_S + 0.4, 'b').sy)).toBeLessThan(0.06);
  });
  it('flash fades within 0.2s of its hold', () => {
    expect(impactFlash(0.16, 'a')).toBeLessThan(0.01);
    expect(impactFlash(HITSTOP_S + 0.16, 'b')).toBeLessThan(0.01);
  });
  it('settles by impactDone', () => {
    expect(impactDone(1.0)).toBe(false);
    expect(impactDone(1.21)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/scene/ceremony.test.ts`
Expected: FAIL — cannot resolve `./ceremony.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/scene/ceremony.ts`:

```ts
/**
 * The suck-in ceremony's clock and curves — what happens when a creature is
 * dropped on the robot-house, as pure math. No KAPLAY here (the dangle.ts
 * pattern): ceremonyPlay.ts skins the flight onto the held visual, and
 * robotHouse.ts evaluates the impact curves on its own clock.
 *
 * Two presets ship for a live playtest verdict (`?ceremony=a|b`, the
 * `?ground=` pattern). They share the same flight; they differ only at
 * impact — `b` adds hit-stop (everything holds frozen a few frames at
 * contact) and a scale-punch squash. The loser gets deleted.
 */

export type CeremonyPreset = 'a' | 'b';

/** `?ceremony=` override; anything unrecognised is the default calm beat. */
export function ceremonyPreset(
  search = typeof location === 'undefined' ? '' : location.search,
): CeremonyPreset {
  return new URLSearchParams(search).get('ceremony') === 'b' ? 'b' : 'a';
}

/** Anticipation: the body tips back and stretches away from the house. */
export const WIND_S = 0.12;
/** The pull into the face-screen. */
export const PULL_S = 0.3;
/** Flight time before contact. */
export const CONTACT_AT = WIND_S + PULL_S;
/** Preset b only: how long everything holds frozen at the moment of impact. */
export const HITSTOP_S = 0.05;
/** How far the windup backs away, as a fraction of the whole flight. */
export const WINDUP_RETREAT = 0.04;
/** Arc apex height as a fraction of the horizontal flight distance. */
export const ARC_LIFT_FRAC = 0.18;
/** The hardest the house ever rocks, in degrees. */
export const MAX_ROCK_DEG = 3;
/** Preset b's scale-punch depth: scaleY dips this far below 1. */
export const PUNCH_SQUASH = 0.12;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

export interface FlightFrame {
  phase: 'windup' | 'pull' | 'contact';
  /** Drives flightPoint: slightly negative in the windup, 1 at the screen. */
  progress: number;
  sx: number;
  sy: number;
  labelAlpha: number;
}

export function flightFrame(elapsed: number): FlightFrame {
  if (elapsed < WIND_S) {
    const p = easeOutCubic(elapsed / WIND_S);
    return {
      phase: 'windup',
      progress: -WINDUP_RETREAT * p,
      sx: 1 + 0.06 * p,
      sy: 1 + 0.05 * p,
      labelAlpha: 1 - p,
    };
  }
  if (elapsed < CONTACT_AT) {
    const p = easeInCubic((elapsed - WIND_S) / PULL_S);
    return {
      phase: 'pull',
      progress: p,
      sx: 1 - 0.8 * p,
      sy: 1 + 0.9 * Math.sin(p * Math.PI),
      labelAlpha: 0,
    };
  }
  return { phase: 'contact', progress: 1, sx: 0.2, sy: 1, labelAlpha: 0 };
}

/**
 * Where the body is at a given progress: a straight lerp lifted into an arc.
 * The lift scales with the horizontal distance so short hops stay subtle and
 * a cross-yard fling gets a real trajectory.
 */
export function flightPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  const lift = Math.abs(to.x - from.x) * ARC_LIFT_FRAC * Math.sin(clamped * Math.PI);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress - lift,
  };
}

/** Preset b freezes its impact clock through the hit-stop window. */
const impactClock = (s: number, preset: CeremonyPreset) =>
  preset === 'b' ? Math.max(0, s - HITSTOP_S) : s;

/** Decaying rock around the house's footing, degrees. */
export function impactRock(s: number, preset: CeremonyPreset): number {
  const u = impactClock(s, preset);
  return MAX_ROCK_DEG * Math.exp(-u * 5) * Math.cos(u * 18);
}

/** Preset b's scale-punch; preset a keeps its shape and only rocks. */
export function impactSquash(
  s: number,
  preset: CeremonyPreset,
): { sx: number; sy: number } {
  if (preset === 'a') return { sx: 1, sy: 1 };
  if (s < HITSTOP_S) return { sx: 1 + PUNCH_SQUASH, sy: 1 - PUNCH_SQUASH };
  const u = s - HITSTOP_S;
  const w = PUNCH_SQUASH * Math.exp(-u * 6) * Math.cos(u * 14);
  return { sx: 1 + w, sy: 1 - w };
}

/** Screen flash: full through any hold, then a fast linear fade. */
export function impactFlash(s: number, preset: CeremonyPreset): number {
  const hold = preset === 'b' ? HITSTOP_S : 0;
  if (s < hold) return 1;
  return Math.max(0, 1 - (s - hold) / 0.15);
}

/** When the house may snap its transform clean and stop evaluating. */
export function impactDone(s: number): boolean {
  return s > 1.2;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/scene/ceremony.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit and push**

```bash
git add packages/web/src/scene/ceremony.ts packages/web/src/scene/ceremony.test.ts
git commit -m "feat(scene): the ceremony's clock and curves - pure math for the suck-in"
git push
```

---

### Task 2: Held-creature stretch and label-fade hooks

**Files:**
- Modify: `packages/web/src/scene/held.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 4): `HeldCreature` gains
  `setStretch(sx: number, sy: number): void` (multiplies the baked `presence` onto the root scale) and
  `setLabelAlpha(alpha: number): void`.

No unit test — `held.ts` is KAPLAY-bound and has none today; the full suite must stay green and Task 5 verifies visually.

- [ ] **Step 1: Add `OpacityComp` to the label's type and comps**

In `held.ts`, the import line

```ts
import type { KAPLAYCtx, GameObj, PosComp, TextComp, ScaleComp, AnchorComp, ColorComp, ZComp } from 'kaplay';
```

gains `OpacityComp`:

```ts
import type { KAPLAYCtx, GameObj, PosComp, TextComp, ScaleComp, AnchorComp, ColorComp, ZComp, OpacityComp } from 'kaplay';
```

The label declaration (currently `GameObj<TextComp | ScaleComp | PosComp | AnchorComp | ColorComp | ZComp>` built with `k.add([k.text(...), k.scale(...), k.pos(...), k.anchor('center'), k.color(...), tokenTag('ink'), k.z(LABEL_Z)])`) gains `OpacityComp` in the type union and `k.opacity(1)` in the component list.

- [ ] **Step 2: Add the two methods**

In the `HeldCreature` interface, after `footOffset(): number;`:

```ts
  /**
   * Ceremony hook: squash/stretch multiplied onto the baked presence scale.
   * (1, 1) is the resting shape; the suck-in drives this toward a streak.
   */
  setStretch(sx: number, sy: number): void;
  /** Ceremony hook: fades the name sign without touching the body. */
  setLabelAlpha(alpha: number): void;
```

In the returned object, after `footOffset()`:

```ts
    setStretch(sx, sy) {
      root.scale = k.vec2(presence * sx, presence * sy);
    },
    setLabelAlpha(alpha) {
      label.opacity = alpha;
    },
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, count ≥ the baseline (955 + 1 skipped).

- [ ] **Step 4: Commit and push**

```bash
git add packages/web/src/scene/held.ts
git commit -m "feat(scene): a held body learns to stretch, its sign learns to fade"
git push
```

---

### Task 3: Robot-house root, flash fill, and `impact()`

**Files:**
- Modify: `packages/web/src/scene/robotHouse.ts`

**Interfaces:**
- Consumes (Task 1): `impactRock`, `impactSquash`, `impactFlash`, `impactDone`, `type CeremonyPreset` from `./ceremony.js`.
- Produces (used by Task 4): `RobotHouse` gains `impact(preset: CeremonyPreset): void`.

The house's blocks are currently independent top-level objects, so nothing can rock or squash them as one body. They move under a parent root pivoted at the footing's bottom-centre. The retint walker uses `k.get(tag, { recursive: true })`, so children keep retinting.

- [ ] **Step 1: Add the imports**

```ts
import { impactDone, impactFlash, impactRock, impactSquash, type CeremonyPreset } from './ceremony.js';
```

- [ ] **Step 2: Parent every block under a pivoted root**

Inside `createRobotHouse`, before the `block` helper, add the root and pivot (bottom-centre of the shell: `x + 49` is the shell's midline, `y + 8` the feet-pad bottom):

```ts
  const PIVOT_X = x + 49;
  const PIVOT_Y = y + 8;
  const root = k.add([k.pos(PIVOT_X, PIVOT_Y), k.rotate(0), k.scale(1), k.z(1)]);
```

Change the `block` helper to add children to the root at pivot-relative positions — call sites stay byte-identical:

```ts
  const block = (bx: number, by: number, w: number, h: number, token: keyof Tokens, z: number) => {
    const { tokens, tint } = themeStore.current();
    return root.add([
      k.rect(w, h),
      k.pos(bx - PIVOT_X, by - PIVOT_Y),
      k.color(hex(sceneryColor(tokens, tint, token))),
      k.z(z),
      tokenTag(token),
    ]);
  };
```

The label moves under the root the same way — its `k.pos(x + 49, y + 19)` becomes `k.pos(0, 11)` and `k.add([...])` becomes `root.add([...])`.

- [ ] **Step 3: Add the flash fill**

After the eyes, a fixed bright fill over the screen (fixed hex on purpose — a flash must read at dusk, so it takes no retint tag), hidden by opacity:

```ts
  // The impact flash: deliberately not token-tagged — a flash that dimmed
  // with the dusk retint would vanish exactly when it matters.
  const flashFill = root.add([
    k.rect(66, 36),
    k.pos(x + 16 - PIVOT_X, y - 62 - PIVOT_Y),
    k.color(k.Color.fromHex('#fff8e6')),
    k.opacity(0),
    k.z(5),
  ]);
```

- [ ] **Step 4: Add the impact clock and update loop**

Before the `return`:

```ts
  // One impact at a time; a new drop mid-settle simply restarts the clock.
  let impactAt: number | null = null;
  let impactPreset: CeremonyPreset = 'a';
  k.onUpdate(() => {
    if (impactAt === null) return;
    const s = k.time() - impactAt;
    if (impactDone(s)) {
      impactAt = null;
      root.angle = 0;
      root.scale = k.vec2(1, 1);
      flashFill.opacity = 0;
      return;
    }
    root.angle = impactRock(s, impactPreset);
    const sq = impactSquash(s, impactPreset);
    root.scale = k.vec2(sq.sx, sq.sy);
    flashFill.opacity = impactFlash(s, impactPreset);
  });
```

The `RobotHouse` interface gains:

```ts
  /** Play the landing reaction: rock (both presets), squash + flash hold (b). */
  impact(preset: CeremonyPreset): void;
```

and the returned object gains:

```ts
    impact(preset) {
      impactAt = k.time();
      impactPreset = preset;
    },
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, count ≥ baseline. (No test covers this file directly; the suite guards the imports and the retint contract.)

- [ ] **Step 6: Commit and push**

```bash
git add packages/web/src/scene/robotHouse.ts
git commit -m "feat(scene): the robot-house becomes one body - it can rock, squash and flash"
git push
```

---

### Task 4: The skin and the wiring

**Files:**
- Create: `packages/web/src/scene/ceremonyPlay.ts`
- Modify: `packages/web/src/scene/creature.ts` (one word: export `puff`)
- Modify: `packages/web/src/scene/village.ts` (imports, robot-drop branch ~line 631, residency block ~line 740)

**Interfaces:**
- Consumes: Task 1's `flightFrame`/`flightPoint`/`ceremonyPreset`; Task 2's `setStretch`/`setLabelAlpha`; Task 3's `robotHouse.impact(preset)`; existing `puff(k, x, y)` (creature.ts:240, currently module-private), `sound.event({ type: 'moved-in', x, voice })`, `voiceParamsFor`, `PORCH_SPOT`/`ROBOT_HOUSE_X`/`ROBOT_HOUSE_Y` from `layout/robot.js`.
- Produces: `playCeremony(k, held, from, to, hooks)` — and the user-visible feature.

- [ ] **Step 1: Export `puff`**

In `creature.ts:240`, `function puff(` becomes `export function puff(`.

- [ ] **Step 2: Create the skin**

Create `packages/web/src/scene/ceremonyPlay.ts`:

```ts
import type { KAPLAYCtx } from 'kaplay';
import type { HeldCreature } from './held.js';
import { flightFrame, flightPoint } from './ceremony.js';

/**
 * The KAPLAY skin over ceremony.ts: flies a held creature into the
 * robot-house face-screen. Takes ownership of `held` — the caller must
 * already have cleared its own references (the hand reads as empty the
 * frame the drop landed) — destroys it at contact, then fires the hook so
 * the caller can flash the house, puff, chime, and unhide the actor.
 *
 * The dangle spring keeps running mid-flight: position updates go through
 * `held.update` with a synthetic cursor velocity, so the body trails and
 * swings exactly as it did in the hand.
 */
export function playCeremony(
  k: KAPLAYCtx,
  held: HeldCreature,
  from: { x: number; y: number },
  to: { x: number; y: number },
  hooks: { onContact(): void },
): void {
  let elapsed = 0;
  let lastX = from.x;
  const tick = k.onUpdate(() => {
    elapsed += k.dt();
    const f = flightFrame(elapsed);
    if (f.phase === 'contact') {
      tick.cancel();
      held.destroy();
      hooks.onContact();
      return;
    }
    const p = flightPoint(from, to, f.progress);
    const vx = (p.x - lastX) / Math.max(k.dt(), 1e-4);
    lastX = p.x;
    held.update(k.time(), k.dt(), p.x, p.y, vx);
    held.setStretch(f.sx, f.sy);
    held.setLabelAlpha(f.labelAlpha);
  });
}
```

- [ ] **Step 3: Wire village.ts**

Import changes at the top of `village.ts`:

```ts
import { inRobotHouse, PORCH_SPOT, ROBOT_HOUSE_X, ROBOT_HOUSE_Y } from '../layout/robot.js';
import { ceremonyPreset } from './ceremony.js';
import { playCeremony } from './ceremonyPlay.js';
```

and `puff` joins the existing import from `./creature.js`.

Near the other layout constants (right after the imports is fine), the flight target — the face-screen's centre:

```ts
/** Where the suck-in lands: the centre of the robot's face-screen. */
const ROBOT_SCREEN = { x: ROBOT_HOUSE_X + 49, y: ROBOT_HOUSE_Y - 44 };
```

Replace the robot-drop branch (currently at ~line 631):

```ts
    if (inRobotHouse(worldX, worldY)) {
      release();
      opts.onRobotDrop?.(draggedId);
    }
```

with:

```ts
    if (inRobotHouse(worldX, worldY)) {
      const flying = held;
      const flownKey = heldId;
      if (flying && flownKey !== null) {
        // The ceremony takes ownership of the dangling visual. Clear the
        // hand WITHOUT release() — that would destroy the body and unhide
        // the actor mid-flight — so the streak can fly while the actor
        // stays hidden at its old spot.
        held = null;
        heldId = null;
        lastHeldX = null;
        const preset = ceremonyPreset();
        playCeremony(k, flying, { x: worldX, y: worldY }, ROBOT_SCREEN, {
          onContact: () => {
            robotHouse.impact(preset);
            puff(k, ROBOT_SCREEN.x, ROBOT_SCREEN.y);
            const c = known.get(flownKey);
            if (c) sound.event({ type: 'moved-in', x: ROBOT_SCREEN.x, voice: voiceParamsFor(c) });
            // Hand the body back a beat later. By then the server view has
            // normally seated them at the porch, so setHeld(false)'s own
            // puff-and-thud lands where they reappear; on a slow echo it
            // lands at the old spot, which is today's exact behaviour.
            k.wait(0.35, () => actors.get(flownKey)?.setHeld(false));
          },
        });
      } else {
        // Sprites never baked, nothing was ever drawn in the hand — degrade
        // to today's instant drop.
        release();
      }
      opts.onRobotDrop?.(draggedId);
    }
```

In the residency block of `setView` (~line 740, where `residentId = view.robotResidentId;` is assigned), the outgoing resident gets the evict/swap pop-out:

```ts
      const prevResident = residentId;
      residentId = view.robotResidentId;
      if (prevResident !== null && prevResident !== residentId) {
        // Evict or swap: the outgoing resident pops off the porch.
        puff(k, PORCH_SPOT.x, PORCH_SPOT.y - 12);
      }
```

(Keep every other line of that block exactly as it is.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, count ≥ baseline.

- [ ] **Step 5: Commit and push**

```bash
git add packages/web/src/scene/ceremonyPlay.ts packages/web/src/scene/creature.ts packages/web/src/scene/village.ts
git commit -m "feat(scene): the robot swallows - drops fly, the house reacts, residents pop out"
git push
```

---

### Task 5: Live verification, both presets, screenshots

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the Browser pane's `preview_start {name: "dev"}`. If the worktree lacks `.claude/launch.json` (it is untracked), create it first:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

Mind the standing rule: one dev server across all worktrees (ports 5173/8262 are a global singleton) — if another session holds them, kill its `node`/`esbuild` processes by command-line match `*skill-village-web*` first.

- [ ] **Step 2: Play preset a**

Navigate to `http://localhost:5173/?ceremony=a`. Drag a villager onto the robot-house with `left_click_drag` (the house sits in Homes; pan until both a creature and the house are on screen). Screenshot during the flight and after landing. Expect: wind-up lean, arc + streak, flash, ~3° rock, puff at the screen, chime, resident on the porch, porch pop for the previous resident if there was one.

- [ ] **Step 3: Play preset b**

Same drag at `http://localhost:5173/?ceremony=b`. Expect the same flight plus: a visible freeze-frame at contact, a hard squash that springs back. Screenshot the squash frame (slow-mo isn't available live — take several rapid screenshots).

- [ ] **Step 4: Drag a project**

Repeat with a genie-framed project. Expect the same beat at genie scale, and the project standing the porch alone afterward (aura dropped — intended).

- [ ] **Step 5: Regression sweep**

Ordinary drops still pin (drag a villager to open ground); clicks still open chat; evicting the resident drags them off normally with the porch pop-out.

- [ ] **Step 6: Hand the verdict to the user**

Post the screenshots and both URLs. The user picks `a` or `b` on their own screen — their eyes are the gate. The losing preset's deletion is a follow-up commit after the verdict, not part of this plan.

---

## Self-review notes

- **Spec coverage (§2 only, by design):** presets a/b ✓, no props ✓, default `a` ✓, degrade on null held ✓, evict/swap pop-out ✓, presence-scaled genie flight ✓ (presence rides the held root already), state write unchanged ✓, `ceremony.ts` pure + tested ✓, house hooks ✓. Loser deletion deferred to the verdict. Spec §3–§6 (touch, perf, viewport, readiness) are the next plan.
- **Type consistency:** `CeremonyPreset` flows Task 1 → 3 → 4; `setStretch`/`setLabelAlpha` match Task 2's declarations; `impact(preset)` matches Task 3's interface; `puff(k, x, y)` matches creature.ts:240's real signature.
- **Known accepted quirks:** on a slow server echo the touch-down puff can fire at the old spot (today's behaviour, noted inline); two overlapping ceremonies are allowed and each owns its own visual; the house's parent-root refactor could change its depth sort against neighbours — Task 5's screenshots check it.
