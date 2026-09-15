# Pocket God Toss (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** God mode: the player flips a ⚡ toggle, drags a villager, and the release tosses it in a ballistic arc that lands, pins where it falls, and charges a small floor-clamped stat cost.

**Architecture:** A new `packages/web/src/god/` module (mode store, velocity sampler, pure ballistics, toss orchestration) hooks into the existing drag/held/pin machinery through one gate in village.ts's mouseup handler. The server mirrors the care pattern: `applyMischief` in core, `village.mischief()` in the runtime, `POST /api/creatures/:id/mischief` in the API.

**Tech Stack:** TypeScript monorepo (npm workspaces), vitest, KAPLAY (web scene), Fastify (server). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-pocket-god-minigame-design.md` — read it first. The plan argues from the spec.

## Global Constraints

- Never-destructive clamp: a mischief dip never takes mood or energy below `STAT_FLOOR` (30); a stat already at or below the floor does not dip. Bond and xp are never touched.
- Toss cost is exactly `{ mood: -3, energy: -4 }`.
- Phase 1 is `'toss'` only. `MischiefKind` has one member; lightning/dunk arrive later.
- No `STATE_VERSION` bump — mischief persists no new fields.
- Normal mode (god mode off) must behave byte-for-byte as today. All existing tests must keep passing.
- TDD: every task writes its failing test before its implementation.
- Run tests from the repo root. Full suite: `npm test`. One file: `npx vitest run <path>`. Typecheck: `npm run typecheck`.
- Commit messages follow the repo's literary convention (`feat(scope): lowercase phrase`), ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- File paths below are repo-relative. Line numbers were read at `5ee7e46` — re-locate by the quoted anchor text if they have drifted.

---

### Task 1: `applyMischief` in core

**Files:**
- Modify: `packages/core/src/sim/stats.ts` (append after `applyCare`, ~line 78)
- Test: `packages/core/src/sim/stats.test.ts` (append a new describe)

**Interfaces:**
- Consumes: `STAT_FLOOR` (30) and `Stats` already in `stats.ts`.
- Produces: `type MischiefKind = 'toss'`, `MISCHIEF_EFFECTS: Record<MischiefKind, { mood: number; energy: number }>`, `applyMischief(stats: Stats, kind: MischiefKind): Stats`. Exported to consumers automatically via `packages/core/src/index.ts`'s existing `export * from './sim/stats.js';` (line 15) — do not edit index.ts.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/sim/stats.test.ts` (match the file's existing import line for `applyCare` and extend it):

```ts
import { applyMischief, MISCHIEF_EFFECTS, STAT_FLOOR } from './stats.js';

describe('applyMischief', () => {
  const base = { mood: 70, energy: 70, bond: 10, xp: 40 };

  it('dips mood and energy by the toss effect', () => {
    const after = applyMischief(base, 'toss');
    expect(after.mood).toBe(70 + MISCHIEF_EFFECTS.toss.mood);
    expect(after.energy).toBe(70 + MISCHIEF_EFFECTS.toss.energy);
  });

  it('never touches bond or xp', () => {
    const after = applyMischief(base, 'toss');
    expect(after.bond).toBe(base.bond);
    expect(after.xp).toBe(base.xp);
  });

  it('clamps the dip at STAT_FLOOR', () => {
    const after = applyMischief({ ...base, mood: 31, energy: 32 }, 'toss');
    expect(after.mood).toBe(STAT_FLOOR);
    expect(after.energy).toBe(STAT_FLOOR);
  });

  it('leaves a stat already at or below the floor exactly where it is', () => {
    const after = applyMischief({ ...base, mood: STAT_FLOOR, energy: 12 }, 'toss');
    expect(after.mood).toBe(STAT_FLOOR);
    expect(after.energy).toBe(12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/sim/stats.test.ts`
Expected: FAIL — `applyMischief` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `packages/core/src/sim/stats.ts` after `applyCare`:

```ts
export type MischiefKind = 'toss';

/**
 * God-mode mischief costs a little, never a lot. Unlike care, the dip clamps
 * at STAT_FLOOR, not 0 — mischief may never drag a villager below the resting
 * baseline, so it can annoy but never neglect (spec: pocket-god §6.1).
 */
export const MISCHIEF_EFFECTS: Record<MischiefKind, { mood: number; energy: number }> = {
  toss: { mood: -3, energy: -4 },
};

export function applyMischief(stats: Stats, kind: MischiefKind): Stats {
  const effect = MISCHIEF_EFFECTS[kind];
  const dip = (value: number, delta: number) =>
    value <= STAT_FLOOR ? value : Math.max(STAT_FLOOR, value + delta);
  return { ...stats, mood: dip(stats.mood, effect.mood), energy: dip(stats.energy, effect.energy) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/src/sim/stats.test.ts`
Expected: PASS (new describe and all pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sim/stats.ts packages/core/src/sim/stats.test.ts
git commit -m "feat(core): mischief dips a stat, the floor catches it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `village.mischief()` in the server runtime

**Files:**
- Modify: `packages/server/src/state/events.ts` (the `VillageEventType` union, lines 10–23)
- Modify: `packages/server/src/village.ts` (interface ~line 79, implementation beside `care` ~line 300, import line 2)
- Test: `packages/server/src/village.test.ts` (append a describe after `describe('care', ...)` which ends ~line 195)

**Interfaces:**
- Consumes: `applyMischief`, `MischiefKind` from `@village/core` (Task 1); the file's existing `state`, `now`, `commit` closure internals — mirror `care()` exactly.
- Produces: `mischief(creatureId: string, kind: MischiefKind): Promise<void>` on the `Village` interface; event type `'mischief'` with `detail` = the kind. Task 3 calls this.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/village.test.ts`, after the `describe('care', ...)` block. Use the file's existing helpers exactly as the care tests do (`makeSandbox`, `skillFixture`, `createVillage`, `clock`, `readEvents`, and the shared `sandbox`/`village` variables cleaned in the file's `afterEach`):

```ts
describe('mischief', () => {
  it('dips mood and energy, and never below the floor', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('tossed', skillFixture('tossed'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    const before = village.getState().creatures['skill:tossed']!.stats;
    await village.mischief('skill:tossed', 'toss');
    const after = village.getState().creatures['skill:tossed']!.stats;
    expect(after.mood).toBeLessThan(before.mood);
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.mood).toBeGreaterThanOrEqual(30);
    expect(after.energy).toBeGreaterThanOrEqual(30);
    expect(after.bond).toBe(before.bond);
    expect(after.xp).toBe(before.xp);
  });

  it('rejects an unknown creature', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await expect(village.mischief('skill:ghost', 'toss')).rejects.toThrow(/not found/i);
  });

  it('logs a mischief event carrying the kind', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('victim', skillFixture('victim'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await village.mischief('skill:victim', 'toss');
    const events = await readEvents(sandbox.paths);
    const hit = events.find((e) => e.type === 'mischief');
    expect(hit).toBeDefined();
    expect(hit!.creatureId).toBe('skill:victim');
    expect(hit!.detail).toBe('toss');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: FAIL — `village.mischief` is not a function (and a type error on `'mischief'` until the union grows).

- [ ] **Step 3: Implement**

In `packages/server/src/state/events.ts`, add one member to the `VillageEventType` union (before `| 'layout-reset'`):

```ts
  | 'mischief'
```

In `packages/server/src/village.ts`:

1. Extend the core import on line 2 to also bring `applyMischief` and `type MischiefKind`:

```ts
import { applyCare, applyMischief, chatSystemPrompt, spokenSystemPrompt, type CareVerb, type Creature, type MischiefKind } from '@village/core';
```

2. Add to the `Village` interface, directly under `care(...)` (~line 79):

```ts
  /** A god-mode prank's cost: a small mood/energy dip, floor-clamped in core. */
  mischief(creatureId: string, kind: MischiefKind): Promise<void>;
```

3. Add the implementation directly under the `care` method (after its closing `},` ~line 317). It is `care` minus the offline-verbs guard — mischief has no LLM path at all:

```ts
    async mischief(creatureId, kind) {
      const creature = state.creatures[creatureId];
      if (!creature) throw new Error(`Creature not found: ${creatureId}`);
      const at = now();
      const next = {
        ...state,
        updatedAt: at,
        creatures: {
          ...state.creatures,
          [creatureId]: { ...creature, stats: applyMischief(creature.stats, kind), lastSeenAt: at },
        },
      };
      await commit(next, [{ at, type: 'mischief', creatureId, detail: kind }]);
    },
```

Copy the surrounding `care` implementation's exact local names if they differ from `state`/`now`/`commit` — mirror what `care` actually calls.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/state/events.ts packages/server/src/village.ts packages/server/src/village.test.ts
git commit -m "feat(server): the village runtime learns mischief - a dip, an event, no talk

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/creatures/:id/mischief`

**Files:**
- Modify: `packages/server/src/api/app.ts` (import line 5; new route after the `/api/creatures/:id/care` route, ~line 135)
- Test: `packages/server/src/api/app.test.ts` (append a describe after `describe('POST /api/creatures/:id/care', ...)`)

**Interfaces:**
- Consumes: `village.mischief(id, kind)` (Task 2); `MischiefKind` from `@village/core`.
- Produces: the HTTP endpoint Task 4's client call targets. 400 on bad kind, 404 on unknown creature, 200 with the updated creature.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/api/app.test.ts`, using the file's existing `boot(...)` helper (line 22):

```ts
describe('POST /api/creatures/:id/mischief', () => {
  it('dips the creature and returns it', async () => {
    const app = await boot(['tossed']);
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:tossed/mischief', payload: { kind: 'toss' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.mood).toBeLessThan(70);
    expect(body.stats.energy).toBeLessThan(70);
  });

  it('400s on a missing kind', async () => {
    const app = await boot(['x']);
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:x/mischief', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('400s on a kind that is not mischief', async () => {
    const app = await boot(['x']);
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:x/mischief', payload: { kind: 'tickle' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s on a creature that does not exist', async () => {
    const app = await boot();
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:ghost/mischief', payload: { kind: 'toss' },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

(The fixtures' starting stats are `{ mood: 70, energy: 70, ... }` — `packages/server/src/bridge/creature.ts:7` — which is what the `toBeLessThan(70)` assertions lean on.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/api/app.test.ts`
Expected: FAIL — the two 400 cases and 404 case get Fastify's own 404 for an unregistered route.

- [ ] **Step 3: Implement**

In `packages/server/src/api/app.ts`:

1. Extend the core type import (line 5):

```ts
import type { CareVerb, MischiefKind } from '@village/core';
```

2. Under the `ALL_CARE_VERBS`/`isCareVerb` block (lines 11–15), add the twin guard:

```ts
const ALL_MISCHIEF_KINDS: MischiefKind[] = ['toss'];

function isMischiefKind(value: unknown): value is MischiefKind {
  return typeof value === 'string' && (ALL_MISCHIEF_KINDS as string[]).includes(value);
}
```

3. After the care route's closing `);` (~line 135), add:

```ts
  app.post<{ Params: { id: string }; Body: { kind?: unknown } }>(
    '/api/creatures/:id/mischief',
    async (request, reply) => {
      const { kind } = request.body ?? {};
      if (!isMischiefKind(kind)) {
        return reply.code(400).send({
          error: `Unknown mischief kind. Expected one of: ${ALL_MISCHIEF_KINDS.join(', ')}.`,
        });
      }
      if (!village.getState().creatures[request.params.id]) {
        return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
      }
      await village.mischief(request.params.id, kind);
      return village.getState().creatures[request.params.id];
    },
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/api/app.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/app.ts packages/server/src/api/app.test.ts
git commit -m "feat(api): a door for pranks - POST mischief beside care

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `postMischief` client call

**Files:**
- Modify: `packages/web/src/net/client.ts` (append after `pinCreature`)

**Interfaces:**
- Consumes: the Task 3 endpoint.
- Produces: `postMischief(creatureId: string, kind: 'toss'): Promise<boolean>` — Task 8's `beginToss` calls it fire-and-forget.

No test file: `client.ts`'s fetch wrappers (`setRobotResident`, `pinCreature`) are untested by convention; the typecheck is the gate. Mirror `pinCreature`'s shape and comment posture exactly.

- [ ] **Step 1: Implement**

Append to `packages/web/src/net/client.ts`:

```ts
/**
 * Record a mischief cost. True on success; false is "the server said no or is
 * away", which the caller ignores — the spectacle already played locally, and
 * the next state frame is the truth either way.
 */
export async function postMischief(creatureId: string, kind: 'toss'): Promise<boolean> {
  try {
    const res = await fetch(`/api/creatures/${encodeURIComponent(creatureId)}/mischief`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/net/client.ts
git commit -m "feat(net): the client can confess a toss

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `god/mode.ts` — the toggle store

**Files:**
- Create: `packages/web/src/god/mode.ts`
- Test: `packages/web/src/god/mode.test.ts`

**Interfaces:**
- Produces: `interface GodMode { active(): boolean; toggle(): void; subscribe(fn: (active: boolean) => void): () => void }` and `createGodMode(): GodMode`. Task 9 (button) and Task 10 (scene gate) consume it; the scene only needs `{ active(): boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/god/mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGodMode } from './mode.js';

describe('createGodMode', () => {
  it('starts off and toggles', () => {
    const god = createGodMode();
    expect(god.active()).toBe(false);
    god.toggle();
    expect(god.active()).toBe(true);
    god.toggle();
    expect(god.active()).toBe(false);
  });

  it('notifies subscribers on every toggle, until unsubscribed', () => {
    const god = createGodMode();
    const seen: boolean[] = [];
    const off = god.subscribe((on) => seen.push(on));
    god.toggle();
    god.toggle();
    off();
    god.toggle();
    expect(seen).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/god/mode.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/web/src/god/mode.ts`:

```ts
/**
 * God mode: the one switch between "drags place villagers" and "drags throw
 * them" (spec: pocket-god §4.1). Off on every load, never persisted — mischief
 * is a mood, not a setting. The ⚡ button and the scene's gesture gate are the
 * only consumers.
 */
export interface GodMode {
  active(): boolean;
  toggle(): void;
  subscribe(fn: (active: boolean) => void): () => void;
}

export function createGodMode(): GodMode {
  let on = false;
  const subs = new Set<(active: boolean) => void>();
  return {
    active: () => on,
    toggle() {
      on = !on;
      for (const fn of subs) fn(on);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/god/mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/god/mode.ts packages/web/src/god/mode.test.ts
git commit -m "feat(god): a switch between placing and throwing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `god/sampler.ts` — cursor velocity in world coordinates

**Files:**
- Create: `packages/web/src/god/sampler.ts`
- Test: `packages/web/src/god/sampler.test.ts`

**Interfaces:**
- Produces: `interface VelocitySampler { push(x: number, y: number, t: number): void; velocity(t: number): { vx: number; vy: number }; clear(): void }` and `createSampler(windowS?: number): VelocitySampler`. Times are seconds (`k.time()`), positions world px. Task 10 pushes from the scene's `onUpdate` and reads at release.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/god/sampler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSampler } from './sampler.js';

describe('createSampler', () => {
  it('measures velocity across the samples inside the window', () => {
    const s = createSampler(0.12);
    s.push(0, 0, 1.0);
    s.push(30, -15, 1.05);
    s.push(60, -30, 1.1);
    // 60px right and 30px up over 0.1s → 600 px/s right, 300 px/s up.
    expect(s.velocity(1.1)).toEqual({ vx: 600, vy: -300 });
  });

  it('ignores samples older than the window', () => {
    const s = createSampler(0.12);
    s.push(0, 0, 1.0);      // stale by t=2
    s.push(100, 0, 2.0);
    s.push(110, 0, 2.05);
    expect(s.velocity(2.05).vx).toBeCloseTo((110 - 100) / 0.05, 5);
  });

  it('returns zero with fewer than two fresh samples', () => {
    const s = createSampler(0.12);
    expect(s.velocity(1)).toEqual({ vx: 0, vy: 0 });
    s.push(5, 5, 1.0);
    expect(s.velocity(1)).toEqual({ vx: 0, vy: 0 });
  });

  it('returns zero after clear()', () => {
    const s = createSampler(0.12);
    s.push(0, 0, 1.0);
    s.push(50, 0, 1.05);
    s.clear();
    expect(s.velocity(1.05)).toEqual({ vx: 0, vy: 0 });
  });

  it('returns zero when the fresh samples share one instant', () => {
    const s = createSampler(0.12);
    s.push(0, 0, 1.0);
    s.push(50, 0, 1.0);
    expect(s.velocity(1.0)).toEqual({ vx: 0, vy: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/god/sampler.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/web/src/god/sampler.ts`:

```ts
/**
 * The hand's speed at the moment of release, in WORLD px/s (spec: pocket-god
 * §4.2). The scene pushes its zoom-corrected world cursor once per frame while
 * a drag is live; velocity() reads first-to-last across the fresh window, so
 * one jittery frame cannot spike the throw. Not part of DragTracker on
 * purpose: the tracker's contract is click-vs-drop by slop, and every consumer
 * depends on that staying simple.
 */
export interface VelocitySampler {
  push(x: number, y: number, t: number): void;
  velocity(t: number): { vx: number; vy: number };
  clear(): void;
}

const WINDOW_S = 0.12;

export function createSampler(windowS: number = WINDOW_S): VelocitySampler {
  let samples: { x: number; y: number; t: number }[] = [];
  return {
    push(x, y, t) {
      samples.push({ x, y, t });
      // Cheap cap: anything past two windows old can never matter again.
      while (samples.length > 0 && samples[0]!.t < t - windowS * 2) samples.shift();
    },
    velocity(t) {
      const fresh = samples.filter((s) => t - s.t <= windowS);
      const first = fresh[0];
      const last = fresh[fresh.length - 1];
      if (!first || !last || last.t - first.t < 1e-3) return { vx: 0, vy: 0 };
      const dt = last.t - first.t;
      return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
    },
    clear() {
      samples = [];
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/god/sampler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/god/sampler.ts packages/web/src/god/sampler.test.ts
git commit -m "feat(god): the hand's speed, read at the moment it lets go

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `god/ballistics.ts` — the pure flight sim

**Files:**
- Create: `packages/web/src/god/ballistics.ts`
- Test: `packages/web/src/god/ballistics.test.ts`

**Interfaces:**
- Produces:
  - `interface Flight { x: number; y: number; vx: number; vy: number; t0: number; bounces: number }` — a segment: position/velocity at `t0` (feet, world px; +y is down).
  - `launch(x, y, vx, vy, t0): Flight` — clamps speed to `MAX_LAUNCH_SPEED`.
  - `interface FlightStep { x: number; y: number; done: boolean; bounced: boolean; flight: Flight }`
  - `advance(flight, t, groundY): FlightStep` — position at `t`; on ground contact either a damped-bounce `Flight` (`bounced: true`) or `done: true`. Pure: never mutates its input.
  - Constants: `GRAVITY = 2600` (px/s²), `MAX_LAUNCH_SPEED = 1400`, `BOUNCE_DAMP = 0.45`, `MAX_BOUNCES = 2`, `MIN_BOUNCE_VY = 140`.
- Task 8 drives `advance` once per frame with a constant `groundY`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/god/ballistics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  advance, BOUNCE_DAMP, GRAVITY, launch, MAX_BOUNCES, MAX_LAUNCH_SPEED,
} from './ballistics.js';

const GROUND = 500;

describe('launch', () => {
  it('keeps a modest throw as given', () => {
    const f = launch(100, 400, 300, -400, 1);
    expect(f).toMatchObject({ x: 100, y: 400, vx: 300, vy: -400, t0: 1, bounces: 0 });
  });

  it('clamps a wild flick to MAX_LAUNCH_SPEED, keeping the direction', () => {
    const f = launch(0, 0, 30_000, -40_000, 0);
    expect(Math.hypot(f.vx, f.vy)).toBeCloseTo(MAX_LAUNCH_SPEED, 6);
    expect(f.vx / f.vy).toBeCloseTo(30_000 / -40_000, 6);
  });
});

describe('advance', () => {
  it('is pure — the input flight is not mutated', () => {
    const f = launch(0, GROUND, 200, -300, 0);
    const copy = { ...f };
    advance(f, 0.5, GROUND);
    expect(f).toEqual(copy);
  });

  it('flies a parabola: out, up, then back down', () => {
    const f = launch(0, GROUND, 200, -300, 0);
    const early = advance(f, 0.05, GROUND);
    expect(early.done).toBe(false);
    expect(early.x).toBeCloseTo(10, 5);
    expect(early.y).toBeLessThan(GROUND);
    // Analytic apex: vy=0 at t = 300/GRAVITY.
    const apex = advance(f, 300 / GRAVITY, GROUND);
    const after = advance(f, 300 / GRAVITY + 0.05, GROUND);
    expect(after.y).toBeGreaterThan(apex.y);
  });

  it('bounces on ground contact with damped velocity, once per contact', () => {
    const f = launch(0, GROUND, 200, -300, 0);
    // Analytic return-to-ground: t = 2*300/GRAVITY.
    const tDown = (2 * 300) / GRAVITY + 0.01;
    const step = advance(f, tDown, GROUND);
    expect(step.bounced).toBe(true);
    expect(step.done).toBe(false);
    expect(step.y).toBe(GROUND);
    expect(step.flight.bounces).toBe(1);
    expect(step.flight.vx).toBeCloseTo(200 * BOUNCE_DAMP, 5);
    expect(step.flight.vy).toBeLessThan(0); // moving up again
  });

  it('settles instead of bouncing forever', () => {
    let f = launch(0, GROUND, 400, -500, 0);
    let t = 0;
    let bounces = 0;
    for (let i = 0; i < 10_000 && bounces <= MAX_BOUNCES + 1; i++) {
      t += 1 / 60;
      const step = advance(f, t, GROUND);
      if (step.bounced) bounces += 1;
      if (step.done) {
        expect(step.y).toBe(GROUND);
        expect(bounces).toBeLessThanOrEqual(MAX_BOUNCES);
        return;
      }
      f = step.flight;
    }
    throw new Error('flight never settled');
  });

  it('a zero-velocity release is a gentle fall onto the ground', () => {
    const f = launch(50, GROUND - 60, 0, 0, 0);
    let cur = f;
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 1 / 60;
      const step = advance(cur, t, GROUND);
      if (step.done) {
        expect(step.x).toBe(50);
        expect(step.y).toBe(GROUND);
        return;
      }
      cur = step.flight;
    }
    throw new Error('drop never landed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/god/ballistics.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/web/src/god/ballistics.ts`:

```ts
/**
 * The toss's flight, in motion.ts's idiom: pure in time, testable without a
 * frame (spec: pocket-god §4.3). A Flight is one ballistic segment — position
 * and velocity at its own t0 — and advance() evaluates it analytically at any
 * later t, handing back a NEW segment when the ground interrupts. World
 * coordinates throughout; +y is down, so GRAVITY is positive.
 */
export const GRAVITY = 2600;
export const MAX_LAUNCH_SPEED = 1400;
export const BOUNCE_DAMP = 0.45;
export const MAX_BOUNCES = 2;
/** An impact softer than this (after damping) settles instead of bouncing. */
export const MIN_BOUNCE_VY = 140;

export interface Flight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  bounces: number;
}

/** Clamp a flick's speed, keep its direction. The feet are the tracked point. */
export function launch(x: number, y: number, vx: number, vy: number, t0: number): Flight {
  const speed = Math.hypot(vx, vy);
  const scale = speed > MAX_LAUNCH_SPEED ? MAX_LAUNCH_SPEED / speed : 1;
  return { x, y, vx: vx * scale, vy: vy * scale, t0, bounces: 0 };
}

export interface FlightStep {
  x: number;
  y: number;
  done: boolean;
  /** True exactly once per ground contact — the caller's one-puff hook. */
  bounced: boolean;
  flight: Flight;
}

export function advance(flight: Flight, t: number, groundY: number): FlightStep {
  const dt = Math.max(0, t - flight.t0);
  const x = flight.x + flight.vx * dt;
  const yFree = flight.y + flight.vy * dt + 0.5 * GRAVITY * dt * dt;
  const vyNow = flight.vy + GRAVITY * dt;

  // Above the ground, or still rising through the frame: in the air.
  if (yFree < groundY || vyNow < 0) {
    return { x, y: yFree, done: false, bounced: false, flight };
  }

  // Ground contact, descending. Spend a bounce or settle.
  if (flight.bounces >= MAX_BOUNCES || vyNow * BOUNCE_DAMP < MIN_BOUNCE_VY) {
    return { x, y: groundY, done: true, bounced: false, flight };
  }
  const next: Flight = {
    x,
    y: groundY,
    vx: flight.vx * BOUNCE_DAMP,
    vy: -vyNow * BOUNCE_DAMP,
    t0: t,
    bounces: flight.bounces + 1,
  };
  return { x, y: groundY, done: false, bounced: true, flight: next };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/god/ballistics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/god/ballistics.ts packages/web/src/god/ballistics.test.ts
git commit -m "feat(god): thirty lines of gravity - the arc, the bounce, the rest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `god/toss.ts` — routing, the flight driver, the daze

**Files:**
- Create: `packages/web/src/god/toss.ts`
- Test: `packages/web/src/god/toss.test.ts`

**Interfaces:**
- Consumes: `launch`/`advance`/`Flight` (Task 7); `postMischief` (Task 4); `keyCreatureId` from `../layout/instances.js`.
- Produces (Task 10 consumes all of these):
  - `type GodDropRoute = 'set-down' | 'toss-pin' | 'toss-home'` and `routeGodDrop(renderKey: string, residentId: string | null): GodDropRoute` — aura instances set down; the resident tosses but never pins; everyone else tosses and pins (spec §5 rules).
  - `dazeLine(pick?: () => number): string` and `DAZE_LINES`.
  - `interface TossVisual { update(t: number, dt: number, x: number, y: number, cursorVx: number): void; footOffset(): number; destroy(): void }` — `HeldCreature` (scene/held.ts) satisfies this structurally.
  - `interface TossOpts { visual: TossVisual; creatureId: string; feetX: number; feetY: number; vx: number; vy: number; t0: number; groundY: number; onBounce(x: number, y: number): void; onLand(x: number, y: number): void; report?: (creatureId: string) => void }`
  - `interface TossFlight { update(t: number, dt: number): boolean; destroy(): void }` — `update` returns true once landed (after `onLand`); `destroy` drops the visual mid-flight without landing.
  - `beginToss(opts: TossOpts): TossFlight` — fires `report` (default: `postMischief(id, 'toss')`) once at launch.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/god/toss.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { beginToss, DAZE_LINES, dazeLine, routeGodDrop, type TossVisual } from './toss.js';
import { instanceKey } from '../layout/instances.js';

describe('routeGodDrop', () => {
  it('sets an aura instance down instead of tossing it', () => {
    expect(routeGodDrop(instanceKey('project:p', 'skill:s'), null)).toBe('set-down');
  });

  it('tosses the resident without ever pinning it', () => {
    expect(routeGodDrop('skill:res', 'skill:res')).toBe('toss-home');
  });

  it('tosses and pins everyone else', () => {
    expect(routeGodDrop('skill:plain', 'skill:res')).toBe('toss-pin');
    expect(routeGodDrop('project:p', null)).toBe('toss-pin');
  });
});

describe('dazeLine', () => {
  it('picks from DAZE_LINES', () => {
    expect(DAZE_LINES).toContain(dazeLine(() => 0));
    expect(DAZE_LINES).toContain(dazeLine(() => 0.999));
  });
});

function fakeVisual(): TossVisual & { updates: { x: number; y: number }[]; destroyed: boolean } {
  const self = {
    updates: [] as { x: number; y: number }[],
    destroyed: false,
    update(_t: number, _dt: number, x: number, y: number) {
      self.updates.push({ x, y });
    },
    footOffset: () => 50,
    destroy() {
      self.destroyed = true;
    },
  };
  return self;
}

function drive(flight: { update(t: number, dt: number): boolean }, from: number, seconds: number) {
  const dt = 1 / 60;
  for (let t = from; t < from + seconds; t += dt) {
    if (flight.update(t + dt, dt)) return true;
  }
  return false;
}

describe('beginToss', () => {
  it('reports the cost once at launch, to the given creature', () => {
    const reported: string[] = [];
    beginToss({
      visual: fakeVisual(), creatureId: 'skill:x', feetX: 0, feetY: 400,
      vx: 100, vy: -100, t0: 1, groundY: 500,
      onBounce: () => {}, onLand: () => {},
      report: (id) => reported.push(id),
    });
    expect(reported).toEqual(['skill:x']);
  });

  it('moves the visual at the scruff (feet minus footOffset) while flying', () => {
    const visual = fakeVisual();
    const flight = beginToss({
      visual, creatureId: 'skill:x', feetX: 0, feetY: 400,
      vx: 100, vy: -300, t0: 1, groundY: 500,
      onBounce: () => {}, onLand: () => {}, report: () => {},
    });
    flight.update(1.05, 1 / 60);
    expect(visual.updates.length).toBe(1);
    const seen = visual.updates[0]!;
    expect(seen.x).toBeCloseTo(5, 5);
    expect(seen.y).toBeLessThan(400 - 50 + 1); // scruff = feet - footOffset, and rising
  });

  it('lands: destroys the visual, then reports the landing point once', () => {
    const visual = fakeVisual();
    const landings: { x: number; y: number }[] = [];
    let bounces = 0;
    const flight = beginToss({
      visual, creatureId: 'skill:x', feetX: 0, feetY: 400,
      vx: 200, vy: -200, t0: 0, groundY: 500,
      onBounce: () => { bounces += 1; }, onLand: (x, y) => landings.push({ x, y }),
      report: () => {},
    });
    expect(drive(flight, 0, 5)).toBe(true);
    expect(visual.destroyed).toBe(true);
    expect(landings.length).toBe(1);
    expect(landings[0]!.y).toBe(500);
    expect(bounces).toBeGreaterThanOrEqual(1);
    // A finished flight stays finished and quiet.
    expect(flight.update(10, 1 / 60)).toBe(true);
    expect(landings.length).toBe(1);
  });

  it('destroy() mid-flight drops the visual and never lands', () => {
    const visual = fakeVisual();
    const landings: unknown[] = [];
    const flight = beginToss({
      visual, creatureId: 'skill:x', feetX: 0, feetY: 400,
      vx: 0, vy: -400, t0: 0, groundY: 500,
      onBounce: () => {}, onLand: (x, y) => landings.push([x, y]), report: () => {},
    });
    flight.update(0.05, 1 / 60);
    flight.destroy();
    expect(visual.destroyed).toBe(true);
    expect(flight.update(9, 1 / 60)).toBe(true);
    expect(landings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/god/toss.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/web/src/god/toss.ts`:

```ts
/**
 * The toss power (spec: pocket-god §4.4): takes ownership of the dangling
 * held-body the moment the hand lets go, flies it with ballistics.ts, and
 * reports the landing back to the scene. The scene decides what a landing
 * means (pin, reseat, hand the actor back) — this file never touches actors,
 * pins, or KAPLAY.
 */
import { advance, launch, type Flight } from './ballistics.js';
import { keyCreatureId } from '../layout/instances.js';
import { postMischief } from '../net/client.js';

export type GodDropRoute = 'set-down' | 'toss-pin' | 'toss-home';

/**
 * The §5 seam rules, as one pure decision. An aura instance is set down (its
 * ground belongs to its project); the robot's resident flies but is never
 * pinned or evicted; everyone else flies and lands where they fall.
 */
export function routeGodDrop(renderKey: string, residentId: string | null): GodDropRoute {
  const creatureId = keyCreatureId(renderKey);
  if (creatureId !== renderKey) return 'set-down';
  return creatureId === residentId ? 'toss-home' : 'toss-pin';
}

export const DAZE_LINES = ['@#%!', 'oof.', 'stars…', 'rude.', 'again! again!'] as const;

/** One grumpy line for the landing bubble. `pick` is injectable for tests. */
export function dazeLine(pick: () => number = Math.random): string {
  return DAZE_LINES[Math.floor(pick() * DAZE_LINES.length)] ?? DAZE_LINES[0];
}

/** What the flight needs from a held body — HeldCreature satisfies this. */
export interface TossVisual {
  update(t: number, dt: number, x: number, y: number, cursorVx: number): void;
  footOffset(): number;
  destroy(): void;
}

export interface TossOpts {
  visual: TossVisual;
  creatureId: string;
  /** Launch point: the FEET, world px (cursor y + footOffset, as the drop path corrects). */
  feetX: number;
  feetY: number;
  /** Sampled hand velocity at release, world px/s. */
  vx: number;
  vy: number;
  t0: number;
  /** The row this flight lands on, resolved once at launch (spec §4.3). */
  groundY: number;
  onBounce(x: number, y: number): void;
  onLand(x: number, y: number): void;
  /** The fire-and-forget cost report; defaults to postMischief. */
  report?: (creatureId: string) => void;
}

export interface TossFlight {
  /** Advance one frame. True once the flight has landed (onLand already ran). */
  update(t: number, dt: number): boolean;
  /** Drop mid-flight without landing — the creature is gone from the view. */
  destroy(): void;
}

export function beginToss(opts: TossOpts): TossFlight {
  const report = opts.report ?? ((id: string) => void postMischief(id, 'toss'));
  report(opts.creatureId);

  let flight: Flight = launch(opts.feetX, opts.feetY, opts.vx, opts.vy, opts.t0);
  const footOffset = opts.visual.footOffset();
  let finished = false;

  return {
    update(t, dt) {
      if (finished) return true;
      const step = advance(flight, t, opts.groundY);
      flight = step.flight;
      if (step.bounced) opts.onBounce(step.x, step.y);
      if (step.done) {
        finished = true;
        // Visual first, actor second: the scene's onLand stands the real
        // actor back up, and both on screen at once would be two bodies.
        opts.visual.destroy();
        opts.onLand(step.x, step.y);
        return true;
      }
      // The flight tracks the feet; the visual hangs from the scruff.
      opts.visual.update(t, dt, step.x, step.y - footOffset, flight.vx);
      return false;
    },
    destroy() {
      if (finished) return;
      finished = true;
      opts.visual.destroy();
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/god/toss.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/god/toss.ts packages/web/src/god/toss.test.ts
git commit -m "feat(god): the toss itself - borrowed body, brief flight, grumpy landing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: the ⚡ button

**Files:**
- Create: `packages/web/src/ui/god-button.ts`
- Modify: `packages/web/index.html` (control-row CSS, after `#layout-reset-button:disabled` at line 111)
- Modify: `packages/web/src/main.ts` (imports ~line 10; create + mount + pass to `startVillage`, ~lines 30–47)

**Interfaces:**
- Consumes: `GodMode` / `createGodMode` (Task 5).
- Produces: `mountGodButton(container: HTMLElement, god: GodMode): void`; `main.ts` owns the single `GodMode` instance and passes it into `startVillage({ ..., god })` — Task 10 adds that option to `VillageOptions`, so until Task 10 lands, pass it but expect a transient type error ONLY if Task 10 is skipped; to keep every task green in isolation, add the `god` option to the `startVillage` call **in Task 10**, not here.

No unit test: HUD mounters (`layout-button.ts`, `weather-menu.ts`) are DOM one-shots verified by typecheck and the playtest, by repo convention.

- [ ] **Step 1: Implement the button module**

Create `packages/web/src/ui/god-button.ts`:

```ts
/**
 * The ⚡ toggle (spec: pocket-god §7): god mode worn on the HUD, visible at a
 * glance, beside ⚙ weather and ↺ layout-reset. All DOM lives here; the mode
 * store owns the state.
 */
import type { GodMode } from '../god/mode.js';

export function mountGodButton(container: HTMLElement, god: GodMode): void {
  const root = document.createElement('div');
  root.id = 'god-mode';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'god-mode-button';
  button.textContent = '⚡';
  button.title = 'God mode: drag a villager and let go to toss them';
  // Matches #weather-menu-button / #layout-reset-button's aria-label convention.
  button.setAttribute('aria-label', 'God mode');

  const refresh = (on: boolean) => button.classList.toggle('active', on);
  button.addEventListener('click', () => god.toggle());
  god.subscribe(refresh);
  refresh(god.active());

  root.appendChild(button);
  container.appendChild(root);
}
```

- [ ] **Step 2: Add the control-row CSS**

In `packages/web/index.html`, directly after the `#layout-reset-button:disabled { ... }` line (111), add:

```css
      /* left: 152px — the next open slot in the control row: weather (14-50),
         sound-mute (60-96), layout-reset (106-142), then this. */
      #god-mode { position: fixed; left: 152px; bottom: 14px; z-index: 9; }
      #god-mode-button {
        width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
        background: var(--sv-panel-bg, #FFFDF4); border: 2px solid var(--sv-ink, #3A2E22);
        color: var(--sv-panel-fg, #3A2E22); font-size: 18px; line-height: 1;
      }
      #god-mode-button.active {
        background: #F5C242; box-shadow: 0 0 6px 1px #F5C242;
      }
```

- [ ] **Step 3: Create and mount the mode in main.ts**

In `packages/web/src/main.ts`:

1. Add imports beside the other ui imports (~line 10):

```ts
import { createGodMode } from './god/mode.js';
import { mountGodButton } from './ui/god-button.js';
```

2. After `mountWeatherMenu(themeStore, document.body);` (line 15), add:

```ts
const god = createGodMode();
mountGodButton(document.body, god);
```

(Task 10 threads `god` into the `startVillage({...})` call.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/ui/god-button.ts packages/web/index.html packages/web/src/main.ts
git commit -m "feat(ui): a bolt on the control row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: the village.ts god gate

The integration task: the scene learns to toss. All edits are in `packages/web/src/scene/village.ts` unless named; anchors quote code at `5ee7e46`.

**Files:**
- Modify: `packages/web/src/scene/creature.ts` (export `puff`, line 240)
- Modify: `packages/web/src/scene/village.ts` (imports; `VillageOptions`; scene state ~line 406; hover loop ~line 479; chirp loop ~line 511; drag block in `onUpdate` ~lines 528–563; mouseup drop branch ~lines 615–667; despawn sites ~lines 769 and 817)
- Modify: `packages/web/src/main.ts` (thread `god` into `startVillage`)

**Interfaces:**
- Consumes: everything Tasks 5–9 produced, plus existing scene machinery: `resolveDrop` (add to the `./placement.js` import beside `resolveHeldDrop`/`seatAll`), `pinCreature` (already imported), `keyCreatureId` (already imported), `actors`, `pins`, `reseat`, `release`, `residentId`, `tracker`, `held`, `heldId`.
- Produces: `VillageOptions.god?: { active(): boolean }` — main.ts passes the Task 9 instance.

There is no headless test for this closure (the file needs a canvas; the repo tests its pure extractions instead — which Tasks 5–8 are). The gate is verified by: typecheck, the full existing suite staying green, and the Task 11 playtest.

- [ ] **Step 1: Export `puff` from creature.ts**

Line 240: change `function puff(` to `export function puff(`.

- [ ] **Step 2: Imports and scene state**

1. Extend the placement import to include `resolveDrop`.
2. Add:

```ts
import { beginToss, dazeLine, routeGodDrop, type TossFlight } from '../god/toss.js';
import { createSampler } from '../god/sampler.js';
import { puff } from './creature.js';
```

(`puff` may join an existing `./creature.js` import if one is present.)

3. In `VillageOptions`, add:

```ts
  /**
   * God mode (spec: pocket-god §4.1): while active, releasing a carried
   * villager throws it instead of placing it. Absent means never — the scene
   * behaves exactly as it did before god mode existed.
   */
  god?: { active(): boolean };
```

4. Beside `const tracker = createDragTracker(CLICK_SLOP);` (~line 406), add:

```ts
  const sampler = createSampler();
  /** Live tosses by render key — a second villager can be grabbed mid-flight. */
  const flights = new Map<string, TossFlight>();
```

- [ ] **Step 3: Keep flying villagers out of hover and chirps**

1. Hover loop (~line 481, `for (const [key, spot] of placements) {`): first line of the body, add:

```ts
        if (flights.has(key)) continue; // mid-toss: hidden actor, not a target
```

2. Chirp candidate loop (~line 511, after `if (key === heldId) continue;`):

```ts
        if (flights.has(key)) continue; // mid-toss: not standing anywhere
```

- [ ] **Step 4: Feed the sampler and advance flights in `onUpdate`**

1. In the drag block (~line 529, `if (drag?.dragging && lookAt !== null && cursorY !== null) {`): inside the new-grab branch (`if (heldId !== drag.targetId) {`), first line:

```ts
        sampler.clear();
```

and after the `held?.update(...)` call at the end of the block:

```ts
      sampler.push(lookAt, cursorY, t);
```

2. After the whole drag/held block (after the `} else if (heldId !== null) { ... release(); }` closes, ~line 563), add:

```ts
    // Live tosses fly whether or not a new drag has started. update() returns
    // true exactly once, after the flight has landed and handed the actor back.
    for (const [key, flight] of [...flights]) {
      if (flight.update(t, k.dt())) flights.delete(key);
    }
```

- [ ] **Step 5: The gate in the mouseup drop branch**

In the `window.addEventListener('mouseup', ...)` handler, directly after `const draggedId = keyCreatureId(gesture.targetId);` (~line 630) and BEFORE `if (inRobotHouse(worldX, worldY)) {`, insert:

```ts
    // GOD MODE GATE (spec: pocket-god §5). Must stay ABOVE the robot-house /
    // evict / pin branches: in god mode a toss beats all of them, and leaving
    // god mode is how residency is managed. Auras and an empty hand (sprites
    // still baking) fall through to the normal branches below.
    if (opts.god?.active() && held !== null && heldId !== null) {
      const route = routeGodDrop(gesture.targetId, residentId);
      if (route !== 'set-down') {
        const key = gesture.targetId;
        const visual = held;
        const footOffset = visual.footOffset();
        const feetY = worldY + footOffset;
        const v = sampler.velocity(k.time());
        // Ownership of the dangling body moves to the flight, and the actor
        // stays hidden — which is exactly why this clears the hand by field
        // instead of calling release(): release() would destroy the visual
        // and stand the actor up mid-throw.
        held = null;
        lastHeldX = null;
        heldId = null;
        flights.get(key)?.destroy();
        flights.set(
          key,
          beginToss({
            visual,
            creatureId: draggedId,
            feetX: worldX,
            feetY,
            vx: v.vx,
            vy: v.vy,
            t0: k.time(),
            // The row this throw lands on, resolved once at launch: the same
            // feet-corrected point an ordinary drop would resolve, so a toss
            // is a placement with airtime (spec §4.3).
            groundY: resolveDrop(pins, draggedId, worldX, feetY).y,
            onBounce: (x, y) => puff(k, x, y),
            onLand: (x, y) => {
              const actor = actors.get(key);
              if (route === 'toss-home') {
                // The resident flies for laughs but is never pinned or
                // evicted — it lands dazed and reseats home (spec §5).
                actor?.setHeld(false);
                actor?.say(dazeLine(), 'canned');
                return;
              }
              const spot = resolveDrop(pins, draggedId, x, y);
              pins.set(draggedId, spot);
              reseat();
              // Actor back AFTER reseat, so the landing puff and thud fire
              // on the new ground — same ordering rule as the drop path.
              actor?.setHeld(false);
              actor?.say(dazeLine(), 'canned');
              opts.onPinsChanged?.();
              void pinCreature(draggedId, spot.x, spot.y);
            },
          }),
        );
        return;
      }
    }
```

- [ ] **Step 6: Drop flights when their creature leaves the view**

Two sites in `setView`'s diff:

1. Respawn path (~line 769, `actors.delete(e.key);`): directly before it, add:

```ts
          flights.get(e.key)?.destroy();
          flights.delete(e.key);
```

2. Removal sweep (~line 817, `if (!seen.has(key)) { actor.destroy(); actors.delete(key); }`): extend to:

```ts
        if (!seen.has(key)) {
          flights.get(key)?.destroy();
          flights.delete(key);
          actor.destroy();
          actors.delete(key);
        }
```

- [ ] **Step 7: Thread `god` through main.ts**

In `packages/web/src/main.ts`, add `god,` to the options object of the existing `startVillage({ ... })` call (~lines 31–45, the one that already passes `onPinsChanged`).

- [ ] **Step 8: Typecheck and full web suite**

Run: `npm run typecheck`
Expected: clean.
Run: `npx vitest run packages/web`
Expected: PASS — nothing existing changed behavior with god mode off.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/scene/creature.ts packages/web/src/scene/village.ts packages/web/src/main.ts
git commit -m "feat(scene): the gate where a drop becomes a throw

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: full verification and playtest

**Files:** none created — this task proves the feature.

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test` then `npm run typecheck` from the repo root.
Expected: everything green. Fix regressions before proceeding — do not skip tests.

- [ ] **Step 2: Live playtest**

Start the dev server through the project's launch config (`.claude/launch.json`, name `dev`, port 5173) — reuse it if it is already running; the dev server is a singleton across worktrees. Then verify in the browser, in order:

1. ⚡ button shows on the control row at left 152px, lights up when clicked.
2. God mode OFF: drag-drop still pins; robot-house drop still moves a creature in; evict still works. (The untouched-normal-mode guarantee.)
3. God mode ON: flick a villager — it arcs, bounces with a puff, lands, shows a daze bubble, and STAYS where it landed after a reload (the pin persisted).
4. God mode ON: a gentle release (no flick) drops the villager roughly in place.
5. God mode ON: toss the robot's resident — it flies, lands dazed, and returns to the porch; it is still the resident.
6. God mode ON: drag an aura instance (a helper fanned around a genie) — it sets down as in normal mode, no arc.
7. Server cost: after a toss, the tossed creature's mood/energy dipped (check the creature panel or `GET /api/creatures/:id`); toss a creature repeatedly and confirm mood/energy stop at 30.
8. Console: no errors thrown during any of the above.

- [ ] **Step 3: Feel pass**

Dispatch the pixel-playtester agent against the running preview for the toss feel: does the arc read as playful, does the bounce land, does the daze bubble arrive on touchdown, does the ⚡ active state read at a glance. Fix what it flags if it is mechanical; park pure-tuning notes (gravity/damp constants) as follow-ups unless egregious.

- [ ] **Step 4: Final commit (if playtest fixes were made) and push**

```bash
git push
```

---

## Deferred by design (do not build)

- Lightning, dunk, comic death, synced spectacle — phases 2–3 (spec §10).
- Aura tosses — excluded by the approved §5 rules.
- Sound for bounces — the landing thud rides `setHeld(false)` already; a bounce-specific sound is a feel follow-up, not phase 1.
