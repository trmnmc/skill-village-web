# Villager Pinning and Under-Construction Zones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player drop a villager anywhere on the strip and have it stay there across reloads, while the automatic crowd rearranges itself around the arrangement.

**Architecture:** Pins are stored server-side as village-level state (`layout.pins`, keyed by creature id) and enter the layout as **fixed occupants** inside `placeCreatures` — seated before the auto crowd so the auto crowd routes around them, then included in the existing wander-leash pass. The client resolves and applies a drop optimistically, then fires a fire-and-forget write; the next state frame is the truth.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, KAPLAY 3001 for the scene, Fastify for the server, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-26-villager-pinning-design.md`

## Global Constraints

- **Run from the repo root.** Tests: `npx vitest run <path>`. Full suite: `npm test`. Types: `npm run typecheck`. There is no per-package test script.
- **`node_modules` lives in the main repo**, not in this worktree. Commands still work from the worktree root.
- **ESM import specifiers end in `.js`** even for TypeScript files (`./zones.js`), matching every existing import.
- **The server must never import from `packages/web`.** World geometry (`WORLD_W`, `GROUND_FRONT`, the depth rows) lives in `packages/web/src/layout/zones.ts`. The server stores what it is given and validates only that x and y are finite with `Math.abs` at most `100_000`.
- **State version goes 4 → 5.** New block: `layout: { pins: Record<string, { x: number; y: number }> }`.
- **Depth rows** sit at y = 758, 712, 666, 620, 574, 528, 482 (`GROUND_FRONT - row * ROW_DEPTH`, `GROUND_FRONT` = 758, `ROW_DEPTH` = 46, `ROWS` = 7).
- **Endpoints:** `GET /api/layout`, `PUT /api/creatures/:id/pin`, `POST /api/layout/reset`. Every response body is the layout snapshot `{ pins }`.
- **Scene objects carry a `themed:<token>` tag** so the retint walker recolours them with the sky. Use `block()` in `village.ts` as the model.
- **Commit after every task.** End each commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Do not reformat or restructure code you are not changing.** `zones.ts` in particular is heavily commented for a reason; add to it, do not tidy it.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/web/src/layout/zones.ts` (modify) | `Pin`, `pinSpot`, `snapRowY`, `keepOutAt`, construction anchors, and `placeCreatures(ids, pins)` |
| `packages/web/src/layout/zones.test.ts` (modify) | Pure tests for all of the above, including the empty-pins regression |
| `packages/server/src/state/schema.ts` (modify) | `LayoutState`, `STATE_VERSION` 5, v4→v5 migration |
| `packages/server/src/state/store.ts` (modify) | v5 shape guard |
| `packages/server/src/state/events.ts` (modify) | `layout-pinned`, `layout-reset` event types |
| `packages/server/src/village.ts` (modify) | `pinCreature`, `resetLayout`, pin pruning on commit |
| `packages/server/src/api/app.ts` (modify) | The three endpoints |
| `packages/web/src/net/protocol.ts` (modify) | `VillageView.pins`, parsed from `state.layout.pins` |
| `packages/web/src/net/client.ts` (modify) | `pinCreature`, `resetLayout` |
| `packages/web/src/scene/village.ts` (modify) | Optimistic pin on drop; pass pins to `placeCreatures` |
| `packages/web/src/ui/layout-button.ts` (create) | The reset-layout HUD button |
| `packages/web/src/scene/construction.ts` (create) | The three building-site clusters |

---

### Task 1: `pinSpot` — resolving a raw drop into a legal home

**Files:**
- Modify: `packages/web/src/layout/zones.ts`
- Test: `packages/web/src/layout/zones.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export interface Pin { x: number; y: number }`, `export function snapRowY(y: number): number`, `export function keepOutAt(feetY: number): readonly KeepOut[]`, `export function pinSpot(x: number, y: number, others: readonly Pin[]): Pin`, `export const PIN_LO: number`, `export const PIN_HI: number`, `export const CONSTRUCTION_XS: readonly number[]`, `export const CONSTRUCTION_BASE_Y: number`, `export const CONSTRUCTION_W: number`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/layout/zones.test.ts`. Note it already imports from `./zones.js` — extend that import rather than adding a second one.

```ts
describe('pinSpot', () => {
  it('snaps a drop to the nearest depth row', () => {
    // Rows: 758, 712, 666, 620, 574, 528, 482.
    expect(pinSpot(1000, 700, []).y).toBe(712);
    expect(pinSpot(1000, 735, []).y).toBe(712);
    expect(pinSpot(1000, 736, []).y).toBe(758);
  });

  it('clamps a drop past either end of the world', () => {
    expect(pinSpot(-5000, 620, []).x).toBe(PIN_LO);
    expect(pinSpot(999999, 620, []).x).toBe(PIN_HI);
  });

  it('clamps a drop above or below every row', () => {
    expect(pinSpot(1000, -900, []).y).toBe(482);
    expect(pinSpot(1000, 9000, []).y).toBe(758);
  });

  it('pushes a drop off a prop it landed on', () => {
    const onATree = HOMES_TREE_XS[0]! + 20;
    const spot = pinSpot(onATree, TREE_BASE_Y, []);
    const blocked = keepOutAt(spot.y);
    expect(blocked.some((b) => spot.x > b.left && spot.x < b.right)).toBe(false);
  });

  it('will not stack two villagers on one spot', () => {
    const first = pinSpot(1500, 620, []);
    const second = pinSpot(1500, 620, [first]);
    expect(Math.abs(second.x - first.x)).toBeGreaterThanOrEqual(MIN_SEPARATION);
    expect(second.y).toBe(first.y);
  });

  it('ignores pins on other rows when spacing', () => {
    const other = pinSpot(1500, 758, []);
    const here = pinSpot(1500, 620, [other]);
    expect(here.x).toBe(1500);
  });

  it('keeps a pin clear of the building sites', () => {
    for (const x of CONSTRUCTION_XS) {
      const spot = pinSpot(x + 30, CONSTRUCTION_BASE_Y, []);
      const blocked = keepOutAt(spot.y);
      expect(blocked.some((b) => spot.x > b.left && spot.x < b.right)).toBe(false);
    }
  });

  it('is idempotent — re-pinning a resolved spot does not move it', () => {
    const once = pinSpot(1234, 640, []);
    expect(pinSpot(once.x, once.y, [])).toEqual(once);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: FAIL — `pinSpot is not defined` (and the other new exports).

- [ ] **Step 3: Add the construction anchors and the general keep-out**

In `zones.ts`, directly after the `HOMES_SIGN_X` / baseline block (around the `SIGN_BASE_Y` export), add:

```ts
/**
 * The three unfinished zones each get one building site. Anchors live here,
 * beside the house and tree anchors, for the same reason those do:
 * `construction.ts` draws from them and `keepOutAt` derives their keep-out
 * bands from them, so a moved scaffold moves its keep-out with it.
 */
export const CONSTRUCTION_XS: readonly number[] = [340, 3980, 4300];
export const CONSTRUCTION_BASE_Y = GROUND_Y - 24;
/** Post to post, plus the barrier board that overhangs them. */
export const CONSTRUCTION_W = 96;
```

Then, after the existing `SIGN_BOARD` const, add the general prop set and keep-out:

```ts
/** Every zone's sign board, not just the one in Homes. */
const SIGN_BOARDS = ZONES.map((zone) => ({
  left: signLeft(zone),
  right: signLeft(zone) + SIGN_W,
  top: SIGN_BASE_Y - 62,
  bottom: SIGN_BASE_Y - 32,
}));

const CONSTRUCTION: readonly Prop[] = CONSTRUCTION_XS.map((x) => ({
  left: x,
  right: x + CONSTRUCTION_W,
  top: CONSTRUCTION_BASE_Y - 104,
  base: CONSTRUCTION_BASE_Y,
  air: PROP_AIR,
}));

/**
 * Everything a *pinned* villager must stand clear of, anywhere on the strip:
 * the Homes decor, every zone's sign board, and the building sites.
 *
 * Deliberately separate from `homesKeepOutAt`, which must keep its exact
 * present behaviour — `ROW_GROUND` is precomputed from it at module load and
 * the whole automatic layout rests on that.
 */
export function keepOutAt(feetY: number): readonly KeepOut[] {
  const bands: KeepOut[] = [...homesKeepOutAt(feetY)];

  for (const prop of CONSTRUCTION) {
    if (feetY >= prop.top - PERCH && feetY <= prop.base) {
      bands.push({
        left: prop.left - WIDEST_BODY / 2 - prop.air,
        right: prop.right + WIDEST_BODY / 2 + prop.air,
      });
    }
  }

  for (const board of SIGN_BOARDS) {
    if (feetY >= board.top && feetY - BODY_REACH <= board.bottom) {
      bands.push({
        left: board.left - WIDEST_BODY / 2 - SIGN_AIR,
        right: board.right + WIDEST_BODY / 2 + SIGN_AIR,
      });
    }
  }

  return mergeBands(bands);
}
```

- [ ] **Step 4: Add `Pin`, the world bounds, `snapRowY` and `pinSpot`**

`pinSpot` must be placed **after** `findNearest` and `nearestGround` in the file, since it uses both. Put it directly above `placeCreatures`.

```ts
/** A pinned villager's home: already snapped to a row, clamped and cleared. */
export interface Pin {
  x: number;
  y: number;
}

/** Keeps a whole body inside the world when a drop lands hard against an edge. */
const PIN_MARGIN = WIDEST_BODY / 2 + 8;
export const PIN_LO = PIN_MARGIN;
export const PIN_HI = WORLD_W - PIN_MARGIN;

/**
 * The feet height of the depth row nearest `y`. Placement stays on the seven
 * rows however wild the drop: free y would break both the depth illusion and
 * the draw order, which sorts on exactly this number.
 */
export function snapRowY(y: number): number {
  const row = Math.min(ROWS - 1, Math.max(0, Math.round((GROUND_FRONT - y) / ROW_DEPTH)));
  return rowY(row);
}

/**
 * Resolve a raw drop into a legal home. The caller stores the *result*, so
 * what the player sees on release is exactly what reloads a week later.
 *
 * Four rules, in order: snap the row, clamp inside the world, step off any
 * prop, and step clear of any villager already pinned on that row.
 */
export function pinSpot(x: number, y: number, others: readonly Pin[]): Pin {
  const feetY = snapRowY(y);
  const blocked = keepOutAt(feetY);
  const wanted = Math.round(Math.min(PIN_HI, Math.max(PIN_LO, x)));
  const taken: Occupant[] = others
    .filter((pin) => pin.y === feetY)
    .map((pin) => ({ x: pin.x, r: 0 }));
  // Spacing gives way before the scenery rule does, the same order of
  // priorities the automatic seating uses: two overlapped villagers read as a
  // crowd, one standing on a roof reads as a bug.
  const x2 =
    findNearest(wanted, taken, PIN_LO, PIN_HI, blocked, () => MIN_SEPARATION) ??
    nearestGround(wanted, PIN_LO, PIN_HI, blocked);
  return { x: x2, y: feetY };
}
```

- [ ] **Step 5: Extend the test file's import**

The new symbols must be added to the existing `import { ... } from './zones.js'` at the top of `zones.test.ts`: `pinSpot`, `keepOutAt`, `snapRowY`, `PIN_LO`, `PIN_HI`, `CONSTRUCTION_XS`, `CONSTRUCTION_BASE_Y`, `MIN_SEPARATION`, `HOMES_TREE_XS`, `TREE_BASE_Y`. Some may already be imported — do not duplicate them.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add packages/web/src/layout/zones.ts packages/web/src/layout/zones.test.ts
git commit -m "feat(layout): resolve a dropped villager onto a legal, snapped home

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `placeCreatures` seats pins as fixed occupants

**Files:**
- Modify: `packages/web/src/layout/zones.ts`
- Test: `packages/web/src/layout/zones.test.ts`

**Interfaces:**
- Consumes: `Pin`, `PIN_LO`, `PIN_HI`, `keepOutAt`, `snapRowY` from Task 1.
- Produces: `placeCreatures(ids: readonly string[], pins?: ReadonlyMap<string, Pin>): Map<string, Spot>` — the second parameter is optional and defaults to empty, so every existing caller keeps working unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
describe('placeCreatures with pins', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `skill:pinned-${i}`);

  it('produces identical output to no pins when the map is empty', () => {
    const before = placeCreatures(ids);
    const after = placeCreatures(ids, new Map());
    expect([...after.entries()]).toEqual([...before.entries()]);
  });

  it('holds a pinned villager at exactly its pinned spot', () => {
    const pin = pinSpot(2000, 620, []);
    const spots = placeCreatures(ids, new Map([[ids[0]!, pin]]));
    expect(spots.get(ids[0]!)!.x).toBe(pin.x);
    expect(spots.get(ids[0]!)!.y).toBe(pin.y);
  });

  it('seats the automatic crowd clear of a pin', () => {
    const pin = pinSpot(2000, 620, []);
    const spots = placeCreatures(ids, new Map([[ids[0]!, pin]]));
    for (const [id, spot] of spots) {
      if (id === ids[0]) continue;
      if (spot.y !== pin.y) continue;
      expect(Math.abs(spot.x - pin.x)).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('gives a pinned villager a leash that cannot walk it into a neighbour', () => {
    const pin = pinSpot(2000, 620, []);
    const spots = placeCreatures(ids, new Map([[ids[0]!, pin]]));
    const mine = spots.get(ids[0]!)!;
    expect(mine.wander).toBeGreaterThanOrEqual(0);
    for (const [id, spot] of spots) {
      if (id === ids[0] || spot.y !== mine.y) continue;
      const gap = Math.abs(spot.x - mine.x);
      expect(gap - mine.wander - spot.wander).toBeGreaterThanOrEqual(MIN_SEPARATION - 1);
    }
  });

  it('ignores a pin for a creature that is not present', () => {
    const pin = pinSpot(2000, 620, []);
    const spots = placeCreatures(ids, new Map([['skill:ghost', pin]]));
    expect(spots.has('skill:ghost')).toBe(false);
    expect(spots.size).toBe(ids.length);
  });

  it('places a pin far outside Homes without disturbing the Homes crowd', () => {
    const far = pinSpot(4300, 666, []);
    const withPin = placeCreatures(ids, new Map([[ids[0]!, far]]));
    expect(withPin.get(ids[0]!)!.x).toBe(far.x);
    // Everyone else stays inside the seatable stretch of Homes.
    for (const [id, spot] of withPin) {
      if (id === ids[0]) continue;
      expect(spot.x).toBeGreaterThanOrEqual(HOMES_LO);
      expect(spot.x).toBeLessThanOrEqual(HOMES_HI);
    }
  });

  it('honours a pinned row that the villager’s hash would never have chosen', () => {
    const rows = new Set<number>();
    for (const y of [482, 528, 574, 620, 666, 712, 758]) {
      const spots = placeCreatures(ids, new Map([[ids[0]!, { x: 2000, y }]]));
      rows.add(spots.get(ids[0]!)!.y);
    }
    expect(rows.size).toBe(7);
  });

  it('keeps every villager on painted ground even when a row is full of pins', () => {
    const pins = new Map<string, Pin>();
    let placed: Pin[] = [];
    for (let i = 0; i < 12; i++) {
      const pin = pinSpot(HOMES_LO + i * 90, 620, placed);
      placed = [...placed, pin];
      pins.set(ids[i]!, pin);
    }
    const spots = placeCreatures(ids, pins);
    expect(spots.size).toBe(ids.length);
    for (const spot of spots.values()) {
      const blocked = keepOutAt(spot.y);
      expect(blocked.some((b) => spot.x > b.left && spot.x < b.right)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/layout/zones.test.ts -t "with pins"`
Expected: FAIL — `placeCreatures` takes one argument, so the pinned villager is placed by hash and the position assertions fail.

- [ ] **Step 3: Teach `seatRow` and `seatRowPacked` about fixed occupants**

Replace the two existing functions with these. Both gain a `pinned` parameter; nothing else changes.

```ts
function seatRow(
  members: readonly RowMember[],
  ground: RowGround,
  gapFor: (a: RowMember, other: Occupant) => number,
  pinned: readonly Occupant[] = [],
): Map<string, number> | null {
  // Seeded, not empty: the player's arrangement is ground already spent, so
  // every rung of the degradation ladder routes around it for free.
  const taken: Occupant[] = [...pinned];
  const xs = new Map<string, number>();
  for (const member of members) {
    const x = findNearest(member.wanted, taken, HOMES_LO, HOMES_HI, ground.bands, (other) =>
      gapFor(member, other),
    );
    if (x === null) return null;
    taken.push({ x, r: member.r });
    xs.set(member.id, x);
  }
  return xs;
}
```

```ts
function seatRowPacked(
  members: readonly RowMember[],
  ground: RowGround,
  pinned: readonly Occupant[] = [],
): Map<string, number> {
  const ordered = [...members].sort(
    (a, b) => a.wanted - b.wanted || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const blocks = [...pinned].sort((a, b) => a.x - b.x);
  const xs = new Map<string, number>();
  let cursor = HOMES_LO;
  for (const member of ordered) {
    let x = nearestGroundRight(cursor, ground.bands);
    // Step over the player's pins as well as the scenery. Without this the
    // last-resort rung packs straight through the arrangement.
    for (;;) {
      if (x === null) break;
      const hit = blocks.find((p) => Math.abs(x! - p.x) < MIN_SEPARATION);
      if (!hit) break;
      x = nearestGroundRight(hit.x + MIN_SEPARATION, ground.bands);
    }
    if (x === null) {
      xs.set(member.id, nearestGround(member.wanted, HOMES_LO, HOMES_HI, ground.bands));
      continue;
    }
    xs.set(member.id, x);
    cursor = x + MIN_SEPARATION;
  }
  return xs;
}
```

- [ ] **Step 4: Rewrite `placeCreatures` to take and seat pins**

Replace the body of `placeCreatures` with this. Keep the existing doc comment above it and add the paragraph shown.

```ts
/**
 * ... (keep the existing comment verbatim, then append:)
 *
 * `pins` are villagers the player has placed by hand. They are seated first
 * and never moved; the automatic crowd is then seated around them and the
 * leash pass covers everyone. A pin whose id is absent from `ids` is ignored,
 * so a creature deleted from disk cannot hold ground.
 */
export function placeCreatures(
  ids: readonly string[],
  pins: ReadonlyMap<string, Pin> = new Map(),
): Map<string, Spot> {
  const byRow = new Map<number, RowMember[]>();
  const pinnedByRow = new Map<number, { id: string; x: number }[]>();

  for (const id of [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const pin = pins.get(id);
    if (pin) {
      // The row comes from where the player put it, not from the hash.
      const row = Math.round((GROUND_FRONT - snapRowY(pin.y)) / ROW_DEPTH);
      const list = pinnedByRow.get(row) ?? [];
      list.push({ id, x: pin.x });
      pinnedByRow.set(row, list);
      continue;
    }
    const h = hash(id);
    const row = rowFor(h);
    const members = byRow.get(row) ?? [];
    members.push({
      id,
      along: ((h >>> 8) % 10000) / 10000,
      jitter: ((h >>> 24) & 0xff) / 256,
      wanted: 0,
      r: personalSpace(id),
    });
    byRow.set(row, members);
  }

  const spots = new Map<string, Spot>();
  for (const row of new Set([...byRow.keys(), ...pinnedByRow.keys()])) {
    const ground = ROW_GROUND[row]!;
    const members = byRow.get(row) ?? [];
    const pinnedHere = pinnedByRow.get(row) ?? [];
    const pinnedOccupants: Occupant[] = pinnedHere.map((p) => ({ x: p.x, r: personalSpace(p.id) }));

    const ordered = [...members].sort(
      (a, b) => a.along - b.along || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    ordered.forEach((member, i) => {
      member.wanted = groundAt((i + 0.15 + 0.7 * member.jitter) / ordered.length, ground);
    });

    const xs =
      seatRow(ordered, ground, (a, other) => other.r + a.r, pinnedOccupants) ??
      seatRow(ordered, ground, () => MIN_SEPARATION, pinnedOccupants) ??
      seatRowPacked(ordered, ground, pinnedOccupants);
    for (const p of pinnedHere) xs.set(p.id, p.x);

    // The leash: half the spare gap to each neighbour (both may be at their
    // limits at once), never past a band edge or the villager's own bounds.
    const feetY = rowY(row);
    const generalBands = keepOutAt(feetY);
    const seated = [...xs.entries()].map(([id, x]) => ({ id, x })).sort((a, b) => a.x - b.x);
    seated.forEach((e, i) => {
      const isPinned = pins.has(e.id);
      const lo = isPinned ? PIN_LO : HOMES_LO;
      const hi = isPinned ? PIN_HI : HOMES_HI;
      const left = i === 0 ? e.x - lo : (e.x - seated[i - 1]!.x - MIN_SEPARATION) / 2;
      const right =
        i === seated.length - 1 ? hi - e.x : (seated[i + 1]!.x - e.x - MIN_SEPARATION) / 2;
      // The own-bounds terms are what stop a villager at the edge of Homes
      // inheriting a huge leash because its nearest row-mate is a pin parked
      // out in the Adoption Center. With no pins they never bind: an interior
      // villager's neighbour term is already smaller, and an end villager's
      // term is that distance exactly.
      let leash = Math.min(WANDER_CAP, left, right, e.x - lo, hi - e.x);
      for (const band of isPinned ? generalBands : ground.bands) {
        if (band.right <= e.x) leash = Math.min(leash, e.x - band.right);
        else if (band.left >= e.x) leash = Math.min(leash, band.left - e.x);
      }
      spots.set(e.id, { x: e.x, y: feetY, wander: Math.max(0, Math.floor(leash)) });
    });
  }

  return spots;
}
```

- [ ] **Step 5: Run the whole layout test file**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: PASS — the new tests **and** every pre-existing one. The "identical output when the map is empty" test is the regression guard; if it fails, the leash clamp or the seating seed has changed behaviour and must be fixed rather than the test relaxed.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test
npm run typecheck
git add packages/web/src/layout/zones.ts packages/web/src/layout/zones.test.ts
git commit -m "feat(layout): seat pinned villagers as fixed occupants

The automatic crowd now routes around the player's arrangement instead of
being computed as though it were not there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Server state — `layout` block, version 5, migration

**Files:**
- Modify: `packages/server/src/state/schema.ts`
- Modify: `packages/server/src/state/store.ts`
- Test: `packages/server/src/state/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface LayoutState { pins: Record<string, { x: number; y: number }> }`; `VillageState.layout: LayoutState`; `STATE_VERSION = 5`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/state/store.test.ts`:

```ts
describe('layout migration', () => {
  it('v4 gains an empty layout block and nothing else changes', () => {
    const v4 = {
      version: 4,
      createdAt: 1,
      updatedAt: 2,
      creatures: {},
      problems: [],
      llm: defaultLlmState(1),
      robot: { residentId: 'skill:someone' },
    } as unknown as VillageState;
    const out = migrateState(v4, 99);
    expect(out.version).toBe(5);
    expect(out.layout).toEqual({ pins: {} });
    expect(out.robot).toEqual({ residentId: 'skill:someone' });
    expect(out.createdAt).toBe(1);
  });

  it('a fresh state starts with no pins', () => {
    expect(emptyState(1).layout).toEqual({ pins: {} });
    expect(emptyState(1).version).toBe(5);
  });
});
```

Add any missing names to the file's existing imports: `migrateState`, `emptyState`, `defaultLlmState`, and the `VillageState` type.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/state/store.test.ts -t "layout migration"`
Expected: FAIL — `out.layout` is `undefined` and `version` is 4.

- [ ] **Step 3: Add the state block and bump the version**

In `schema.ts`, change `STATE_VERSION` to `5`, then add beside `RobotState`:

```ts
/**
 * Where the player has parked villagers by hand, keyed by creature id.
 *
 * Village-level rather than a field on `Creature` for the same two reasons
 * `robot.residentId` lives here: creature records are rebuilt from disk on
 * import, and "release everyone" has to be a one-line write.
 *
 * The coordinates are the client's, already snapped to a depth row. The
 * server stores them and never re-derives them — the world geometry lives in
 * the web package and the server has no business depending on it.
 */
export interface LayoutState {
  pins: Record<string, { x: number; y: number }>;
}
```

Add `layout: LayoutState;` to `VillageState` beside `robot`, add `layout: { pins: {} },` to `emptyState`, and append the migration step to `migrateState` **after** the v3 → v4 line:

```ts
  if (state.version === 4) state = { ...state, version: 5, layout: { pins: {} } };
```

Widen `migrateState`'s parameter type to include the new optional block:

```ts
export function migrateState(
  parsed: VillageState & { llm?: LlmState; robot?: RobotState; layout?: LayoutState },
  now: number,
): VillageState {
```

Update the doc comment above `migrateState` to name the new step, matching the style of the existing sentence: `v4 -> v5 adds the layout block, where hand-placed villagers are recorded.`

- [ ] **Step 4: Add the store shape guard**

In `store.ts`, directly after the existing v4 robot guard:

```ts
    if (parsed.version >= 5 && (typeof parsed.layout !== 'object' || parsed.layout === null)) {
      return { ok: false, reason: 'invalid' };
    }
```

Extend the comment above the guards to mention `layout in v5`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/state/`
Expected: PASS, including every pre-existing store test.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add packages/server/src/state/
git commit -m "feat(state): record hand-placed villagers in a v5 layout block

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Server runtime — `pinCreature`, `resetLayout`, pruning

**Files:**
- Modify: `packages/server/src/state/events.ts`
- Modify: `packages/server/src/village.ts`
- Test: `packages/server/src/village.test.ts`

**Interfaces:**
- Consumes: `LayoutState` from Task 3.
- Produces: on the `Village` runtime interface — `pinCreature(creatureId: string, x: number, y: number): Promise<void>` (throws for an unknown creature) and `resetLayout(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/village.test.ts`. The file has **no** shared boot helper — each test builds its own sandbox against the module-level `sandbox` / `village` variables that `afterEach` already tears down. Follow that exactly:

```ts
describe('the layout', () => {
  /** A one-skill village, built the way every other test in this file does. */
  async function boot() {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('pinned', skillFixture('pinned'));
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
    return village;
  }

  it('records a pin', async () => {
    const v = await boot();
    await v.pinCreature('skill:pinned', 1500, 620);
    expect(v.getState().layout.pins['skill:pinned']).toEqual({ x: 1500, y: 620 });
  });

  it('writes one event for a pin', async () => {
    const v = await boot();
    await v.pinCreature('skill:pinned', 1500, 620);
    const events = await readEvents(sandbox!.paths, {});
    expect(events.filter((e) => e.type === 'layout-pinned')).toHaveLength(1);
  });

  it('refuses a pin for a creature that does not exist', async () => {
    const v = await boot();
    await expect(v.pinCreature('skill:nobody', 10, 10)).rejects.toThrow(/not found/i);
  });

  it('reset clears every pin', async () => {
    const v = await boot();
    await v.pinCreature('skill:pinned', 1500, 620);
    await v.resetLayout();
    expect(v.getState().layout.pins).toEqual({});
  });

  it('prunes a pin whose creature has left the village', async () => {
    const v = await boot();
    await v.pinCreature('skill:pinned', 1500, 620);
    // A pin for an id nobody owns must not survive the next commit.
    v.getState().layout.pins['skill:vanished'] = { x: 1, y: 1 };
    await v.pinCreature('skill:pinned', 1600, 620);
    expect(v.getState().layout.pins['skill:vanished']).toBeUndefined();
    expect(v.getState().layout.pins['skill:pinned']).toEqual({ x: 1600, y: 620 });
  });
});
```

`makeSandbox`, `skillFixture`, `createVillage` and `readEvents` are all already imported at the top of this file. Add nothing to the imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/village.test.ts -t "the layout"`
Expected: FAIL — `village.pinCreature is not a function`.

- [ ] **Step 3: Add the event types**

In `events.ts`, append to the `VillageEventType` union:

```ts
  | 'layout-pinned'
  | 'layout-reset';
```

- [ ] **Step 4: Add the runtime methods**

In `village.ts`, add to the `Village` interface beside `setRobotResident`:

```ts
  /** Park a villager at a spot the player chose. Throws for an unknown id. */
  pinCreature(creatureId: string, x: number, y: number): Promise<void>;
  /** Release every hand-placed villager back to automatic placement. */
  resetLayout(): Promise<void>;
```

Then implement them beside `setRobotResident`:

```ts
    async pinCreature(creatureId, x, y) {
      const creature = state.creatures[creatureId];
      if (!creature) throw new Error(`Creature not found: ${creatureId}`);
      const at = now();
      await commit(
        {
          ...state,
          updatedAt: at,
          layout: { pins: prunedPins({ ...state.layout.pins, [creatureId]: { x, y } }) },
        },
        [{ at, type: 'layout-pinned', creatureId, detail: creature.nickname || creature.name }],
      );
    },

    async resetLayout() {
      if (Object.keys(state.layout.pins).length === 0) return;
      const at = now();
      await commit({ ...state, updatedAt: at, layout: { pins: {} } }, [
        { at, type: 'layout-reset' },
      ]);
    },
```

Add the pruning helper near the top of the same factory, beside the other private helpers:

```ts
  /**
   * Drop pins whose creature is no longer in the village. A skill deleted
   * from disk must not go on reserving ground forever, and the renderer
   * ignores unknown ids anyway — this is what stops the save growing a tail
   * of them.
   */
  const prunedPins = (pins: Record<string, { x: number; y: number }>) => {
    const kept: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(pins)) {
      if (state.creatures[id]) kept[id] = at;
    }
    return kept;
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add packages/server/src/state/events.ts packages/server/src/village.ts packages/server/src/village.test.ts
git commit -m "feat(village): pin and release villagers, pruning pins for departed creatures

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The three endpoints

**Files:**
- Modify: `packages/server/src/api/app.ts`
- Test: `packages/server/src/api/app.test.ts`

**Interfaces:**
- Consumes: `pinCreature`, `resetLayout` from Task 4.
- Produces: `GET /api/layout` → `{ pins }`; `PUT /api/creatures/:id/pin` body `{ x, y }` → `{ pins }`; `POST /api/layout/reset` → `{ pins: {} }`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/api/app.test.ts`. The file's existing helper is `boot(skills)`, which writes a skill fixture per name and returns the app; a skill named `pinned` becomes creature id `skill:pinned`.

```ts
describe('PUT /api/creatures/:id/pin', () => {
  it('pins a creature and answers with the layout', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pins['skill:pinned']).toEqual({ x: 1500, y: 620 });
  });

  it('refuses coordinates that are not finite numbers', async () => {
    const app = await boot(['pinned']);
    for (const payload of [
      { x: 'left', y: 620 },
      { x: null, y: 620 },
      { x: 1, y: 1e9 },
      { x: 1 },
    ]) {
      const res = await app.inject({
        method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('404s for a creature that does not exist', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({
      method: 'PUT', url: '/api/creatures/skill:ghost/pin', payload: { x: 1, y: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('the layout endpoints', () => {
  it('GET /api/layout reports the pins', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({ method: 'GET', url: '/api/layout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pins: {} });
  });

  it('POST /api/layout/reset clears them', async () => {
    const app = await boot(['pinned']);
    await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    const res = await app.inject({ method: 'POST', url: '/api/layout/reset' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pins: {} });
  });

  it('carries pins on the state payload the client reads', async () => {
    const app = await boot(['pinned']);
    await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    const res = await app.inject({ method: 'GET', url: '/api/state' });
    expect(res.json().layout.pins['skill:pinned']).toEqual({ x: 1500, y: 620 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/api/app.test.ts -t "pin"`
Expected: FAIL — 404 from Fastify, the routes do not exist.

- [ ] **Step 3: Add the routes**

In `app.ts`, directly after the `app.put('/api/robot/resident', ...)` block:

```ts
  const layoutSnapshot = () => ({ pins: village.getState().layout.pins });

  app.get('/api/layout', async () => layoutSnapshot());

  /**
   * The client owns the geometry: it snaps a drop to a depth row and clamps it
   * inside the world before ever calling this (see layout/zones.ts). The
   * server's validation is a sanity rail against garbage reaching the save,
   * not a second copy of the layout rules — reproducing them here would mean
   * the server depending on the web package, which it never does.
   */
  const SANE = 100_000;
  app.put<{ Params: { id: string }; Body: { x?: unknown; y?: unknown } }>(
    '/api/creatures/:id/pin',
    async (request, reply) => {
      const { x, y } = request.body ?? {};
      const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= SANE;
      if (!ok(x) || !ok(y)) {
        return reply.code(400).send({ error: 'x and y must be finite numbers within the world' });
      }
      try {
        await village.pinCreature(request.params.id, x, y);
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
      return layoutSnapshot();
    },
  );

  app.post('/api/layout/reset', async () => {
    await village.resetLayout();
    return layoutSnapshot();
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/api/app.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add packages/server/src/api/
git commit -m "feat(api): endpoints to pin a villager and to release them all

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The view carries pins

**Files:**
- Modify: `packages/web/src/net/protocol.ts`
- Test: `packages/web/src/net/protocol.test.ts`

**Interfaces:**
- Consumes: the server's `state.layout.pins` shape from Task 3.
- Produces: `VillageView.pins: Record<string, { x: number; y: number }>` — `{}` when the server sends nothing usable.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/net/protocol.test.ts`. The parser under test is **`toView`** (not `parseView`), and the file already defines a module-level `state` const holding one creature — reuse it, as the neighbouring tests do.

```ts
describe('pins in the view', () => {
  it('reads the layout block', () => {
    const view = toView({ ...state, layout: { pins: { 'skill:a': { x: 10, y: 620 } } } })!;
    expect(view.pins).toEqual({ 'skill:a': { x: 10, y: 620 } });
  });

  it('is empty when the server sends no layout at all', () => {
    expect(toView(state)!.pins).toEqual({});
  });

  it('drops entries that are not a pair of finite numbers', () => {
    const view = toView({
      ...state,
      layout: {
        pins: {
          good: { x: 1, y: 2 },
          text: { x: 'left', y: 2 },
          nan: { x: Number.NaN, y: 2 },
          missing: { x: 1 },
          nothing: null,
        },
      },
    })!;
    expect(view.pins).toEqual({ good: { x: 1, y: 2 } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/net/protocol.test.ts -t "pins in the view"`
Expected: FAIL — `view.pins` is `undefined`.

- [ ] **Step 3: Add the field and its parsing**

Add to the `VillageView` interface, beside `robotResidentId`:

```ts
  /** Villagers the player has placed by hand, keyed by id. Empty when none. */
  pins: Record<string, { x: number; y: number }>;
```

In the parser, beside the existing `rawRobot` block:

```ts
  // A pin is only worth carrying if it is a real pair of numbers: a half-read
  // entry would place a villager at NaN, which draws nothing and is very hard
  // to see the cause of.
  const pins: Record<string, { x: number; y: number }> = {};
  const rawLayout = (p as { layout?: unknown }).layout;
  if (typeof rawLayout === 'object' && rawLayout !== null) {
    const rawPins = (rawLayout as { pins?: unknown }).pins;
    if (typeof rawPins === 'object' && rawPins !== null) {
      for (const [id, at] of Object.entries(rawPins as Record<string, unknown>)) {
        if (typeof at !== 'object' || at === null) continue;
        const { x, y } = at as { x?: unknown; y?: unknown };
        if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
          pins[id] = { x, y };
        }
      }
    }
  }
```

Add `pins` to the returned object and to the destructured field list at the top of the parser (`layout?: unknown`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add packages/web/src/net/protocol.ts packages/web/src/net/protocol.test.ts
git commit -m "feat(net): carry hand-placed villagers on the village view

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The drop pins the villager

**Files:**
- Modify: `packages/web/src/net/client.ts`
- Modify: `packages/web/src/scene/village.ts`

**Interfaces:**
- Consumes: `pinSpot`, `Pin`, `placeCreatures(ids, pins)` from Tasks 1–2; `VillageView.pins` from Task 6; the endpoints from Task 5.
- Produces: `pinCreature(creatureId: string, x: number, y: number): Promise<boolean>` and `resetLayout(): Promise<boolean>` from `net/client.ts`; `VillageScene.resetLayout(): void` for Task 8 to call.

- [ ] **Step 1: Add the client calls**

Append to `packages/web/src/net/client.ts`, directly after `setRobotResident`:

```ts
/**
 * Park a villager where the player dropped it. True on success; false is "the
 * server said no or is away", which the caller treats as "nothing happened" —
 * the spot already moved locally and the next state frame is the truth.
 */
export async function pinCreature(creatureId: string, x: number, y: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/creatures/${encodeURIComponent(creatureId)}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Release every hand-placed villager back to automatic placement. */
export async function resetLayout(): Promise<boolean> {
  try {
    const res = await fetch('/api/layout/reset', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Hold the pins in the scene and use them when placing**

In `village.ts`, add the import and the state. The `createHeld` import from the drag work is already there; extend the zones import with `pinSpot` and `type Pin`, and the client import with `pinCreature` and `resetLayout`.

Beside the existing `placements` declaration:

```ts
  // The arrangement the player has made. Seeded from every view frame, but
  // written locally the instant a drop lands so the villager stays under the
  // hand instead of waiting out a round trip. A refused or lost write simply
  // loses to the next frame.
  let pins = new Map<string, Pin>();
```

In `setView`, replace the placement call:

```ts
      pins = new Map(Object.entries(view.pins).map(([id, at]) => [id, { ...at }]));
      const spots = placeCreatures(view.creatures.map((c) => c.id), pins);
```

- [ ] **Step 3: Pin on drop**

In the `mouseup` handler, replace the `gesture.type === 'drop'` block with this. The robot-house and evict branches keep their exact present behaviour and stay first.

```ts
    if (gesture.type === 'drop') {
      const rect = k.canvas.getBoundingClientRect();
      const worldX = event.clientX - rect.left + k.getCamPos().x - k.width() / 2;
      const worldY = event.clientY - rect.top + k.getCamPos().y - k.height() / 2;
      if (inRobotHouse(worldX, worldY)) {
        opts.onRobotDrop?.(gesture.targetId);
      } else if (gesture.targetId === residentId) {
        opts.onRobotEvict?.(gesture.targetId);
      } else {
        // Everywhere else means "this is where you live now". Resolved here,
        // not on the server, because the resolved spot is what gets stored:
        // what the player sees on release is what reloads later.
        const others = [...pins.entries()]
          .filter(([id]) => id !== gesture.targetId)
          .map(([, at]) => at);
        const spot = pinSpot(worldX, worldY, others);
        pins.set(gesture.targetId, spot);
        reseat();
        void pinCreature(gesture.targetId, spot.x, spot.y);
      }
    }
```

- [ ] **Step 4: Add `reseat`, so a local pin lands on the frame it happened**

Beside the `release` helper added by the drag work:

```ts
  /**
   * Re-run placement against the current pins and move every actor to match.
   * Called after a local pin so the arrangement updates on the frame the
   * player let go, rather than on the next frame from the server.
   */
  const reseat = () => {
    const spots = placeCreatures([...placements.keys()], pins);
    if (residentId && spots.has(residentId)) spots.set(residentId, { ...PORCH_SPOT });
    placements = spots;
    for (const [id, actor] of actors) {
      const spot = spots.get(id);
      if (spot) actor.setSpot(spot);
    }
  };
```

- [ ] **Step 5: Expose the reset for the HUD button**

Add to the `VillageScene` interface:

```ts
  /** Release every hand-placed villager. The HUD's reset button calls this. */
  resetLayout(): void;
  /** Whether any villager is currently hand-placed — the button's enabled state. */
  hasPins(): boolean;
```

and to the returned object:

```ts
    resetLayout() {
      if (pins.size === 0) return;
      pins = new Map();
      reseat();
      void resetLayoutCall();
    },
    hasPins() {
      return pins.size > 0;
    },
```

Import the client function under an alias so it does not collide with the method name:
`import { pinCreature, resetLayout as resetLayoutCall } from '../net/client.js';`

- [ ] **Step 6: Verify by hand in the browser**

```bash
npm run dev
```

Drag a villager to an empty stretch of ground and release. Expected: it stays there, lands with the puff, and its neighbours have shuffled to make room. Reload the page — it is still there. Check the server wrote it:

```bash
curl -s http://localhost:3000/api/layout
```

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test
npm run typecheck
git add packages/web/src/net/client.ts packages/web/src/scene/village.ts
git commit -m "feat(village): a drop is where the villager lives now

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The reset-layout HUD button

**Files:**
- Create: `packages/web/src/ui/layout-button.ts`
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: `VillageScene.resetLayout()` and `VillageScene.hasPins()` from Task 7.
- Produces: `mountLayoutButton(container: HTMLElement, scene: { resetLayout(): void; hasPins(): boolean }): { refresh(): void }`.

- [ ] **Step 1: Write the button**

The HUD styles live in `packages/web/index.html`, not a stylesheet, and the weather gear is styled by **id** (`#weather-menu-button`). Follow that convention.

```ts
/**
 * "Put everyone back": one button that releases every hand-placed villager to
 * automatic placement. It is the whole undo story for pinning, which is why it
 * stands in the HUD rather than hiding in a menu.
 */
export interface LayoutButton {
  /** Re-read whether any pins exist, and enable or disable accordingly. */
  refresh(): void;
}

export function mountLayoutButton(
  container: HTMLElement,
  scene: { resetLayout(): void; hasPins(): boolean },
): LayoutButton {
  const root = document.createElement('div');
  root.id = 'layout-reset';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'layout-reset-button';
  button.textContent = '↺';
  button.title = 'Put every villager back where the village would seat them';

  // Never offer to undo nothing.
  const refresh = () => {
    button.disabled = !scene.hasPins();
  };

  button.addEventListener('click', () => {
    scene.resetLayout();
    refresh();
  });

  root.appendChild(button);
  container.appendChild(root);
  refresh();
  return { refresh };
}
```

- [ ] **Step 2: Style it beside the weather gear**

In `packages/web/index.html`, directly after the `#weather-menu-button` rule (around line 97), add:

```css
      /* Beside the weather gear, same size and z-layer; see #weather-menu. */
      #layout-reset { position: fixed; left: 58px; bottom: 14px; z-index: 9; }
      #layout-reset-button {
        width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
        background: var(--sv-panel-bg, #FFFDF4); border: 2px solid var(--sv-ink, #3A2E22);
        color: var(--sv-panel-fg, #3A2E22); font-size: 18px; line-height: 1;
      }
      #layout-reset-button:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 3: Mount it and keep it in step with the server**

In `main.ts`, `mountWeatherMenu(themeStore, document.body)` runs at line 14, *before* `startVillage` — so this mount cannot go beside it. Put it after `const scene = await startVillage({ ... })`:

```ts
const layoutButton = mountLayoutButton(document.body, scene);
```

with `import { mountLayoutButton } from './ui/layout-button.js';` at the top. Then, at the existing `scene.setView(view)` call, add the refresh directly beneath it, so a pin made on another device greys the button in or out here too:

```ts
    scene.setView(view);
    layoutButton.refresh();
```

- [ ] **Step 4: Verify by hand**

```bash
npm run dev
```

Expected: the button is greyed out on a fresh village; it enables the moment you drop a villager; clicking it returns everyone to their hashed spots and greys itself out again. Reload and confirm they stayed released.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add packages/web/src/ui/layout-button.ts packages/web/src/main.ts
git commit -m "feat(ui): one button to put every villager back

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: The building sites

**Files:**
- Create: `packages/web/src/scene/construction.ts`
- Modify: `packages/web/src/scene/village.ts`

**Interfaces:**
- Consumes: `CONSTRUCTION_XS`, `CONSTRUCTION_BASE_Y`, `CONSTRUCTION_W` from Task 1.
- Produces: `mountConstruction(k: KAPLAYCtx, monoFont: string): void`.

- [ ] **Step 1: Write the module**

`block()` in `village.ts` is currently module-private. Export it (add `export` to the existing `function block`) and import it here rather than copying it — one definition of a themed rectangle, not two.

```ts
/**
 * Building sites for the three zones that are scenery until their milestones
 * land: Hatchery (M6), Adoption Center (M5), Notice Board (M9).
 *
 * One deliberate cluster per zone, not debris strewn evenly across them —
 * scattered texture reads as the graphics being turned down, while a single
 * grounded cluster reads as somebody working here tomorrow. Every piece sits
 * on the zone's baseline; nothing floats.
 */
import type { KAPLAYCtx } from 'kaplay';
import { TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import { tokenTag, sceneryColor } from './retint.js';
import { CONSTRUCTION_XS, CONSTRUCTION_BASE_Y, CONSTRUCTION_W } from '../layout/zones.js';
import { block } from './village.js';

/** Post height, and the two crossbars measured down from the top. */
const POST_H = 104;
const BAR_YS = [22, 60];
/** The barrier's stripe width — wide enough to read at a glance, not a zebra. */
const STRIPE_W = 12;
const BARRIER_H = 12;

export function mountConstruction(k: KAPLAYCtx, monoFont: string): void {
  for (const x of CONSTRUCTION_XS) {
    const base = CONSTRUCTION_BASE_Y;
    const top = base - POST_H;

    // Two posts and the bars between them: a scaffold frame.
    block(k, x, top, 8, POST_H, 'wood', 1);
    block(k, x + CONSTRUCTION_W - 8, top, 8, POST_H, 'wood', 1);
    for (const dy of BAR_YS) block(k, x, top + dy, CONSTRUCTION_W, 6, 'wood', 1);

    // A striped barrier across the front, alternating wood and cream.
    for (let i = 0; i * STRIPE_W < CONSTRUCTION_W; i++) {
      block(k, x + i * STRIPE_W, base - BARRIER_H, STRIPE_W, BARRIER_H,
        i % 2 === 0 ? 'wood' : 'cream', 2);
    }

    // The plate, sized from the rendered text rather than a guessed width —
    // the first playtest's complaint about oversized signs applies here too.
    const { tokens, tint } = themeStore.current();
    const label = k.add([
      k.text('UNDER CONSTRUCTION', { size: 9 * TEXT_SS, font: monoFont }),
      k.scale(1 / TEXT_SS),
      k.pos(x + CONSTRUCTION_W / 2, top + 40),
      k.anchor('center'),
      k.color(k.Color.fromHex(sceneryColor(tokens, tint, 'ink'))),
      k.z(4),
      tokenTag('ink'),
    ]);
    const plate = k.add([
      k.rect(label.width / TEXT_SS + 10, label.height / TEXT_SS + 8, { radius: 3 }),
      k.pos(x + CONSTRUCTION_W / 2, top + 40),
      k.anchor('center'),
      k.color(k.Color.fromHex(sceneryColor(tokens, tint, 'cream'))),
      k.outline(2, k.Color.fromHex(sceneryColor(tokens, tint, 'ink'))),
      k.z(3),
      tokenTag('cream'),
    ]);
    // The plate is built after the text so it can be sized from it, so it has
    // to be pushed behind it explicitly.
    plate.z = 3;
  }
}
```

- [ ] **Step 2: Call it**

In `village.ts`, beside the loop that draws the zone signs:

```ts
  mountConstruction(k, monoFont);
```

- [ ] **Step 3: Verify by hand**

```bash
npm run dev
```

Scroll to each of the three zones. Expected: a scaffold with a striped barrier and a readable plate, all standing on the ground; the pieces retint with the sky at dusk (check with `?at=21:00`); and a villager dropped onto a site slides clear of it instead of standing inside it.

- [ ] **Step 4: Run the full suite and commit**

```bash
npm test
npm run typecheck
git add packages/web/src/scene/construction.ts packages/web/src/scene/village.ts
git commit -m "feat(scene): give the unfinished zones a building site to stand in

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- A villager dropped anywhere stays there, across reloads and on a second device.
- The automatic crowd visibly makes room for a pinned villager rather than overlapping it.
- Pinned villagers still amble, and never amble into scenery or a neighbour.
- The reset button releases everyone and greys itself out.
- The three unfinished zones read as building sites.
- `npm test` and `npm run typecheck` are both clean.
