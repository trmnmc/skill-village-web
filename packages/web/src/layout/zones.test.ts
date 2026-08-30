import { describe, it, expect } from 'vitest';
import {
  ZONES,
  WORLD_W,
  GROUND_Y,
  GROUND_FRONT,
  GROUND_TOP,
  MIN_SEPARATION,
  STACK_GAP,
  HOMES_HOUSE_XS,
  HOMES_TREE_XS,
  HOMES_SIGN_X,
  HOMES_LO,
  HOMES_HI,
  homesKeepOutAt,
  personalSpace,
  placeCreatures,
  pinSpot,
  keepOutAt,
  snapRowY,
  PIN_LO,
  PIN_HI,
  CONSTRUCTION_XS,
  CONSTRUCTION_BASE_Y,
  type Pin,
} from './zones.js';

const ids = Array.from({ length: 70 }, (_, i) => `skill:s${i}`);

describe('ZONES', () => {
  it('has the four zones from the spec, in reading order', () => {
    expect(ZONES.map((z) => z.id)).toEqual(['hatchery', 'homes', 'adoption', 'notice']);
  });

  it('carries a human label for each', () => {
    for (const zone of ZONES) expect(zone.label.length).toBeGreaterThan(0);
  });

  it('tiles the world without overlapping', () => {
    const sorted = [...ZONES].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.w);
    }
    const last = sorted.at(-1)!;
    expect(last.x + last.w).toBeLessThanOrEqual(WORLD_W);
  });

  it('puts the ground somewhere sensible', () => {
    expect(GROUND_Y).toBeGreaterThan(0);
    expect(GROUND_TOP).toBeLessThan(GROUND_Y);
  });
});

describe('placeCreatures', () => {
  it('places every creature', () => {
    const spots = placeCreatures(ids);
    expect(spots.size).toBe(ids.length);
    for (const id of ids) expect(spots.has(id)).toBe(true);
  });

  it('is deterministic: same input, same spots', () => {
    expect([...placeCreatures(ids)]).toEqual([...placeCreatures(ids)]);
  });

  it('depends on the set of villagers, not the order they are handed over', () => {
    // placeCreatures seats in its own fixed order, so a caller reordering its
    // list cannot rearrange the village. Without that, the layout silently
    // depends on how protocol.ts happens to sort, and every villager moves the
    // day that changes.
    const shuffled = [...ids].reverse();
    const interleaved = [...ids].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    expect([...placeCreatures(shuffled)].sort()).toEqual([...placeCreatures(ids)].sort());
    expect([...placeCreatures(interleaved)].sort()).toEqual([...placeCreatures(ids)].sort());
  });

  it('an arrival ripples only toward the viewer, within reach, and the same way every time', () => {
    // Guaranteed spacing and per-id-only placement cannot both hold: with a
    // finite number of non-overlapping spots, a newcomer landing on an
    // occupied one has to move somebody. So this does not assert that nobody
    // moves — that is false. It asserts the disruption stays bounded, stays
    // directional, and is the same disruption every time.
    //
    // Directional: rows seat back to front, each keeping clear of the row
    // behind it, so an arrival can shuffle its own row and make the rows in
    // FRONT step out from underfoot — it can never reach the rows behind,
    // and nobody ever changes row.
    //
    // The newcomer is inserted in *sorted* position, mirroring the order
    // protocol.ts hands over. Appending to the end instead — as this test used
    // to — exercises the one position where the arrival is seated last and can
    // never displace anyone, which is no test at all.
    const before = placeCreatures(ids);

    for (let i = 0; i < 200; i++) {
      const newcomer = `skill:arrival-${i}`;
      const list = [...ids, newcomer].sort((a, b) => a.localeCompare(b));
      const after = placeCreatures(list);
      expect(after.size).toBe(ids.length + 1);

      const arrivalRow = after.get(newcomer)!.y;
      const maxDiameter = 2 * Math.max(...list.map((id) => personalSpace(id)));

      for (const id of ids) {
        const was = before.get(id)!;
        const now = after.get(id)!;
        // Depth comes straight from the id's own hash, so nobody ever changes
        // row — an arrival cannot move a villager into a different band.
        expect(now.y).toBe(was.y);
        if (now.x === was.x) continue;
        // Rows in front of the arrival have larger y (rowY runs toward the
        // viewer); anything behind it seated before the arrival existed.
        expect(now.y).toBeGreaterThanOrEqual(arrivalRow);
        // A displaced villager steps clear of the cluster it was standing in.
        // It can never travel further than its own row could pack end to end
        // — plus that row's scenery bands, which nothing may stand inside.
        const rowSize = [...after.values()].filter((s) => s.y === now.y).length;
        const bandWidth = homesKeepOutAt(now.y).reduce((sum, b) => sum + (b.right - b.left), 0);
        expect(Math.abs(now.x - was.x)).toBeLessThanOrEqual(rowSize * maxDiameter + bandWidth);
      }

      // Same membership, same layout: the whole "stable geography" promise.
      expect([...placeCreatures(list)]).toEqual([...after]);
    }
  });

  it('keeps everyone inside the homes zone', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    for (const { x } of placeCreatures(ids).values()) {
      expect(x).toBeGreaterThanOrEqual(homes.x);
      expect(x).toBeLessThanOrEqual(homes.x + homes.w);
    }
  });

  it('never stands two villagers in one row closer than a body width', () => {
    // Counting distinct x values is not this property: two creatures 8px
    // apart are distinct and still overlap. What matters is the gap between
    // same-row neighbours, so measure that.
    const rows = new Map<number, number[]>();
    for (const { x, y } of placeCreatures(ids).values()) {
      const row = rows.get(y) ?? [];
      row.push(x);
      rows.set(y, row);
    }
    expect(rows.size).toBeGreaterThan(1);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MIN_SEPARATION);
      }
    }
  });

  it('never stands a villager directly underfoot of the row behind', () => {
    // Bodies are ~120px tall and rows 46px apart, so a body sharing an x with
    // the row behind it draws standing on that body's head — the owner's
    // 2026-08-30 verdict called the result noise. Rows seat back to front and
    // each keeps STACK_GAP of sideways offset from the row it fronts.
    const crowd = Array.from({ length: 100 }, (_, i) => `skill:c${i}`);
    const rows = new Map<number, number[]>();
    for (const { x, y } of placeCreatures(crowd).values()) {
      const row = rows.get(y) ?? [];
      row.push(x);
      rows.set(y, row);
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    const stacked: string[] = [];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i]! - ys[i - 1]! > 46) continue;
      for (const a of rows.get(ys[i - 1]!)!)
        for (const b of rows.get(ys[i]!)!)
          if (Math.abs(a - b) < STACK_GAP) stacked.push(`${ys[i]}: ${a} vs ${b}`);
    }
    expect(stacked).toEqual([]);
  });

  it('stands every villager on painted ground, shadow included', () => {
    // The scene paints ground from GROUND_TOP down. A creature is anchored at
    // its feet and its 10px contact shadow is centred there, so the shadow
    // reaches 5px further back than the creature's own y. Both have to land
    // inside the painted band, or a villager floats on the sky-blue clear
    // colour with its shadow drawn in mid-air.
    for (const { y } of placeCreatures(ids).values()) {
      expect(y).toBeLessThanOrEqual(GROUND_FRONT);
      expect(y - 5).toBeGreaterThan(GROUND_TOP);
    }
  });

  it('fills the field from the back: the closer to the viewer, the fewer villagers', () => {
    // A depth gradient still sells the composition, but only the row pressed
    // right against the glass stays sparse — the rest of the foreground
    // carries its share, or the bottom of the frame reads as empty field.
    const many = Array.from({ length: 600 }, (_, i) => `skill:many${i}`);
    const counts = new Map<number, number>();
    for (const { y } of placeCreatures(many).values()) {
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    const front = counts.get(GROUND_FRONT) ?? 0;
    expect(front).toBeGreaterThan(0);
    for (const [y, n] of counts) {
      if (y === GROUND_FRONT) continue;
      expect(front, `front row vs row y=${y}`).toBeLessThan(n);
    }
  });

  it('seats villagers in front of the baseline as well as behind it', () => {
    // The field reaches toward the viewer, not only toward the horizon: the
    // front rows stand below GROUND_Y, all the way out to GROUND_FRONT.
    const ys = [...placeCreatures(ids).values()].map((s) => s.y);
    expect(Math.max(...ys)).toBe(GROUND_FRONT);
    expect(GROUND_FRONT).toBeGreaterThan(GROUND_Y);
  });

  it('gives the back row real field behind it, not a razor-thin horizon', () => {
    // The first human to see the village render reported "everything is
    // floating in the sky". Feet-on-grass was arithmetically true, but the
    // back row stood 24px from the horizon while bodies and labels rose
    // ~128px above it, so the composition read as airborne. Grounded is a
    // visual property, not just a coordinate one: the furthest row needs a
    // meaningful band of grass behind it.
    const backRow = Math.min(...[...placeCreatures(ids).values()].map((s) => s.y));
    expect(backRow - GROUND_TOP).toBeGreaterThanOrEqual(100);
  });

  it('varies depth so the village reads as a field, not a line', () => {
    const ys = new Set([...placeCreatures(ids).values()].map((s) => s.y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('handles an empty village', () => {
    expect(placeCreatures([]).size).toBe(0);
  });

  it('grants wander room that can never reach a prop or a neighbour', () => {
    // Each spot carries how far its villager may amble from home. The leash
    // is cut from real clearances: full excursions toward a neighbour still
    // leave MIN_SEPARATION between the pair (both may be at their limits at
    // once), and no excursion crosses into the row's keep-out bands or past
    // the row's ends.
    const spots = placeCreatures(ids);
    const rows = new Map<number, { x: number; wander: number }[]>();
    const violations: string[] = [];
    for (const [id, spot] of spots) {
      expect(spot.wander).toBeGreaterThanOrEqual(0);
      if (spot.x - spot.wander < HOMES_LO || spot.x + spot.wander > HOMES_HI) {
        violations.push(`${id} can leave the row: ${spot.x}±${spot.wander}`);
      }
      for (const band of homesKeepOutAt(spot.y)) {
        const nearEdge = spot.x < band.left ? band.left : band.right;
        if (spot.x + spot.wander > band.left && spot.x - spot.wander < band.right) {
          violations.push(`${id} can wander into [${band.left}, ${band.right}] (x=${spot.x}±${spot.wander}, edge ${nearEdge})`);
        }
      }
      const row = rows.get(spot.y) ?? [];
      row.push({ x: spot.x, wander: spot.wander });
      rows.set(spot.y, row);
    }
    for (const [y, entries] of rows) {
      entries.sort((a, b) => a.x - b.x);
      for (let i = 1; i < entries.length; i++) {
        const a = entries[i - 1]!;
        const b = entries[i]!;
        if (b.x - b.wander - (a.x + a.wander) < MIN_SEPARATION) {
          violations.push(`row y=${y}: leashes collide at ${a.x}+${a.wander} vs ${b.x}-${b.wander}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('lets a good share of the village actually stroll', () => {
    // A leash of a few pixels is standing still with extra steps. The layout
    // is loose enough that most villagers should have real room.
    const wanders = [...placeCreatures(ids).values()].map((s) => s.wander);
    expect(wanders.filter((w) => w >= 20).length).toBeGreaterThan(wanders.length / 2);
  });

  it('keeps the middle rows out of every prop, sign included', () => {
    // The bands are derived from the same anchors village.ts draws from, so
    // this is the tripwire for someone emptying or narrowing the list: for a
    // row whose feet land among every prop's pixels, every prop's anchor must
    // sit strictly inside some band.
    const bands = homesKeepOutAt(GROUND_Y - 46);
    for (const x of [...HOMES_HOUSE_XS, ...HOMES_TREE_XS, HOMES_SIGN_X]) {
      expect(bands.some((b) => b.left < x && x < b.right)).toBe(true);
    }
  });

  it('lets villagers mingle with the scenery wherever nothing is covered', () => {
    // A hard ring around every prop reads as a force field — the emptiness is
    // as conspicuous as a queue. Exclusion follows what a body would actually
    // cover: the back rows pass behind the sign (their bodies never reach
    // down to the board) and the front-most row passes in front below it, so
    // the sign keeps neighbours; the rows in front of the houses and trees
    // stroll past them. Only covering is forbidden, and covering the sign
    // board — the village's navigation — is forbidden from every row.
    const inBand = (feetY: number, x: number) =>
      homesKeepOutAt(feetY).some((b) => b.left < x && x < b.right);

    // The sign stays approachable from behind (back rows) and in front below
    // (the near rows, whose body tops no longer reach the board), and
    // protected from every row that would cover it.
    for (const y of [GROUND_Y - 3 * 46, GROUND_Y - 2 * 46, GROUND_Y + 2 * 46, GROUND_FRONT]) {
      expect(inBand(y, HOMES_SIGN_X), `sign free at y=${y}`).toBe(false);
    }
    for (const y of [GROUND_Y - 46, GROUND_Y, GROUND_Y + 46]) {
      expect(inBand(y, HOMES_SIGN_X), `sign protected at y=${y}`).toBe(true);
    }

    // Houses and trees: blocked for the rows among their pixels (perched or
    // covering), open to the rows strolling in front of them.
    for (const y of [GROUND_Y - 3 * 46, GROUND_Y - 2 * 46, GROUND_Y - 46]) {
      expect(inBand(y, HOMES_HOUSE_XS[0]!), `house blocked at y=${y}`).toBe(true);
      expect(inBand(y, HOMES_TREE_XS[0]!), `tree blocked at y=${y}`).toBe(true);
    }
    for (const y of [GROUND_Y, GROUND_FRONT - 46, GROUND_FRONT]) {
      expect(inBand(y, HOMES_HOUSE_XS[0]!), `house open at y=${y}`).toBe(false);
      expect(inBand(y, HOMES_TREE_XS[0]!), `tree open at y=${y}`).toBe(false);
    }
  });

  it('never stands a villager in a keep-out band of its own row', () => {
    // A villager whose body would cover a prop — or the sign board, from any
    // distance — is drawn on top of it (creatures z-sort above props), so
    // placement is the only thing preventing it.
    const violations: string[] = [];
    for (const [id, { x, y }] of placeCreatures(ids)) {
      for (const band of homesKeepOutAt(y)) {
        if (x > band.left && x < band.right) {
          violations.push(`${id} at x=${x} inside [${band.left}, ${band.right}]`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('degrades to the body-width floor before overlapping anyone', () => {
    // When a row can no longer honour everyone's personal space, it packs at
    // MIN_SEPARATION — villagers stand shoulder to shoulder, never inside
    // each other. The guarantee holds up to a row's packed capacity (~27 for
    // today's tightest row); rows crowded past even that may overlap and are
    // covered by the scenery test below. 26 members is under every row's
    // capacity, so any row at or below it must hold the floor.
    const crowd = Array.from({ length: 120 }, (_, i) => `skill:crowd${i}`);
    const rows = new Map<number, { id: string; x: number }[]>();
    for (const [id, { x, y }] of placeCreatures(crowd)) {
      const row = rows.get(y) ?? [];
      row.push({ id, x });
      rows.set(y, row);
    }
    const violations: string[] = [];
    let ladderEngaged = false;
    for (const [y, entries] of rows) {
      if (entries.length > 26) continue;
      entries.sort((a, b) => a.x - b.x);
      for (let i = 1; i < entries.length; i++) {
        const a = entries[i - 1]!;
        const b = entries[i]!;
        const gap = b.x - a.x;
        if (gap < MIN_SEPARATION) violations.push(`gap ${gap} in row y=${y}`);
        if (gap < personalSpace(a.id) + personalSpace(b.id)) ladderEngaged = true;
      }
    }
    expect(violations).toEqual([]);
    // The crowd must actually be past personal-space comfort somewhere, or
    // this test would pass without exercising the ladder at all.
    expect(ladderEngaged).toBe(true);
  });

  it('keeps villagers off the scenery even when rows are past capacity', () => {
    // Overcrowding degrades creature spacing first (villagers may overlap each
    // other), never the scenery rule: the fallback seats a creature at the
    // nearest clear ground, so nobody ever stands on a roof to make room.
    const crowd = Array.from({ length: 300 }, (_, i) => `skill:crowd${i}`);
    const violations: string[] = [];
    for (const [id, { x, y }] of placeCreatures(crowd)) {
      for (const band of homesKeepOutAt(y)) {
        if (x > band.left && x < band.right) {
          violations.push(`${id} at x=${x} inside [${band.left}, ${band.right}]`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('fills each row evenly: no stretch of open ground dwarfs the average gap', () => {
    // Hashing positions uniformly at random leaves Poisson voids — stretches
    // of empty field beside bunched-up stretches, which the eye reads as
    // "clumps of open space". Placement is stratified instead: a row's free
    // ground is split into one stratum per villager, each drifting inside
    // its own, so no free stretch (row ends included) can grow much past two
    // strata while another stands crowded.
    const rows = new Map<number, number[]>();
    for (const { x, y } of placeCreatures(ids).values()) {
      const row = rows.get(y) ?? [];
      row.push(x);
      rows.set(y, row);
    }
    for (const [y, xs] of rows) {
      if (xs.length < 8) continue; // sparse rows are open space by design
      const bands = homesKeepOutAt(y);
      // Distance with the band-covered stretches (never standable) removed.
      const freeBetween = (a: number, b: number) =>
        b - a - bands.reduce(
          (sum, band) => sum + Math.max(0, Math.min(b, band.right) - Math.max(a, band.left)),
          0,
        );
      xs.sort((a, b) => a - b);
      const gaps = [freeBetween(HOMES_LO, xs[0]!), freeBetween(xs.at(-1)!, HOMES_HI)];
      for (let i = 1; i < xs.length; i++) gaps.push(freeBetween(xs[i - 1]!, xs[i]!));
      const average = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      const widest = Math.max(...gaps);
      expect(widest, `row y=${y}: widest ${widest} vs average ${average}`).toBeLessThanOrEqual(
        2.5 * average,
      );
    }
  });

  it('does not stack villagers into columns at the band edges', () => {
    // A villager whose hash landed inside a scenery band used to snap to the
    // band's nearest edge — and the edges are the same x in every row, so the
    // snapped half of the village stood in vertical columns (five creatures
    // shared one x on the first real screen). The offset hashes onto free
    // ground directly now, so an identical x across rows is a rare accident,
    // never a gathering point.
    const byX = new Map<number, number>();
    for (const { x } of placeCreatures(ids).values()) {
      byX.set(x, (byX.get(x) ?? 0) + 1);
    }
    for (const [x, count] of byX) {
      expect(count, `villagers sharing x=${x}`).toBeLessThanOrEqual(2);
    }

    // A few villagers legitimately pack flush against a band when displaced —
    // what must never return is the edge as a *gathering point* (25 of 70
    // stood exactly on edges under the snapping bug). Edges differ per row
    // now, which itself breaks the columns; count against each row's own.
    const onEdges = [...placeCreatures(ids).values()].filter(({ x, y }) =>
      homesKeepOutAt(y).some((b) => b.left === x || b.right === x),
    ).length;
    expect(onEdges).toBeLessThanOrEqual(6);
  });

  it('gives villagers varied personal space, honoured between row neighbours', () => {
    // Uniform spacing packs displaced villagers into evenly-drilled queues —
    // the "clumping" read: five creatures exactly one body width apart look
    // like a bus stop. Each villager draws a personal radius from its own id,
    // and same-row neighbours stand at least the sum of their radii apart, so
    // packed stretches breathe unevenly like a real crowd.
    const radii = new Set(ids.map((id) => personalSpace(id)));
    expect(radii.size).toBeGreaterThan(3);

    const rows = new Map<number, { id: string; x: number }[]>();
    for (const [id, { x, y }] of placeCreatures(ids)) {
      const row = rows.get(y) ?? [];
      row.push({ id, x });
      rows.set(y, row);
    }
    const violations: string[] = [];
    for (const entries of rows.values()) {
      entries.sort((a, b) => a.x - b.x);
      for (let i = 1; i < entries.length; i++) {
        const a = entries[i - 1]!;
        const b = entries[i]!;
        const need = personalSpace(a.id) + personalSpace(b.id);
        if (b.x - a.x < need) {
          violations.push(`${a.id} and ${b.id} are ${b.x - a.x} apart, need ${need}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('still seats everyone when a row holds more than it can space out', () => {
    // Homes fits ~32 spaced villagers per row. Well past that, spacing has to
    // give — but nobody may go missing or get pushed out of the zone, which is
    // what the fall-back in nearestClearSpot is for.
    const crowd = Array.from({ length: 300 }, (_, i) => `skill:crowd${i}`);
    const spots = placeCreatures(crowd);
    expect(spots.size).toBe(crowd.length);
    const homes = ZONES.find((z) => z.id === 'homes')!;
    for (const { x } of spots.values()) {
      expect(x).toBeGreaterThanOrEqual(homes.x);
      expect(x).toBeLessThanOrEqual(homes.x + homes.w);
    }
  });
});

describe('snapRowY', () => {
  it('resolves each of the seven depth rows to itself', () => {
    for (const y of [758, 712, 666, 620, 574, 528, 482]) {
      expect(snapRowY(y)).toBe(y);
    }
  });

  it('clamps a y past the furthest-back row to that row', () => {
    expect(snapRowY(-900)).toBe(482);
    expect(snapRowY(0)).toBe(482);
  });

  it('clamps a y past the nearest-front row to that row', () => {
    expect(snapRowY(9000)).toBe(758);
    expect(snapRowY(759)).toBe(758);
  });
});

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
    // Row 574 is genuinely covered by the tree's keep-out band (top-PERCH..base
    // is 482..600); TREE_BASE_Y itself (600) snaps to row 620, which stands in
    // front of the tree rather than on it, so it would not exercise this rule.
    const onATree = HOMES_TREE_XS[0]! + 20;
    const spot = pinSpot(onATree, 574, []);
    expect(spot.y).toBe(574);
    const blocked = keepOutAt(spot.y);
    expect(blocked.some((b) => onATree > b.left && onATree < b.right)).toBe(true);
    expect(blocked.some((b) => spot.x > b.left && spot.x < b.right)).toBe(false);
    // Not just clear of scenery — actually displaced off the x it asked for.
    expect(spot.x).not.toBe(onATree);
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

  // The tests above all pass against a mutant that seats the automatic crowd
  // as though `pins` did not exist — nothing in them forces a pin to actually
  // hold ground. These four are built to fail under a specific deletion:
  // pins ignored by the two seat* helpers, the seatRowPacked step-over loop
  // gone, the leash's own-bounds clamp gone, and pinned villagers checked
  // against the Homes-only bands instead of the general ones.

  it('displaces the automatic villager that would otherwise have taken a pinned seat', () => {
    const before = placeCreatures(ids);

    // Pick a villager (`victim`) and a *different* villager (`pinnedId`) whose
    // own automatic row differs from the victim's row — so removing
    // `pinnedId` from the automatic crowd cannot itself explain anything that
    // happens in the victim's row. Only the pin occupying the victim's exact
    // seat can move it.
    let victim: string | undefined;
    let pinnedId: string | undefined;
    outer: for (const [vId, vSpot] of before) {
      for (const [pId, pSpot] of before) {
        if (pId === vId || pSpot.y === vSpot.y) continue;
        victim = vId;
        pinnedId = pId;
        break outer;
      }
    }
    if (!victim || !pinnedId) throw new Error('fixture too uniform: no cross-row pair found');
    const seat = before.get(victim)!;

    const after = placeCreatures(ids, new Map([[pinnedId, { x: seat.x, y: seat.y }]]));
    expect(after.get(pinnedId)!.x).toBe(seat.x);
    expect(after.get(pinnedId)!.y).toBe(seat.y);
    // The victim's row membership and stratified "wanted" position are
    // exactly as before (pinnedId was never a row-mate), so a mutant that
    // seats the crowd as though pins do not exist puts the victim right back
    // at `seat.x` — on top of the pin. The real code has to move it off.
    expect(after.get(victim)!.x).not.toBe(seat.x);
    expect(Math.abs(after.get(victim)!.x - seat.x)).toBeGreaterThanOrEqual(MIN_SEPARATION);
  });

  it('clamps a villager’s leash to its own Homes bound when its only same-row neighbour is a pin parked outside Homes', () => {
    // Found by inspection: in this 22-villager pool, skill:sz22-2 seats as the
    // rightmost automatic villager in its row, 48px shy of HOMES_HI, with
    // 226px of room to its left — comfortably more than either gap. Pinning a
    // distant same-row companion out past Homes turns it from the row's last
    // member (whose right term was already `hi - x`, the unclamped edge
    // formula) into the second-to-last, whose right term becomes a
    // neighbour-gap to the far pin. Without the own-bounds clamp, that gap —
    // not the real distance to HOMES_HI — sets the leash, and the villager
    // could wander off the edge of the zone.
    const pool = Array.from({ length: 22 }, (_, i) => `skill:sz22-${i}`);
    const before = placeCreatures(pool);
    const edgeId = 'skill:sz22-2';
    const edgeBefore = before.get(edgeId)!;
    const companion = pool.find((id) => id !== edgeId && before.get(id)!.y !== edgeBefore.y)!;

    const farPin = { x: Math.min(PIN_HI, edgeBefore.x + 500), y: edgeBefore.y };
    const after = placeCreatures(pool, new Map([[companion, farPin]]));
    const edgeAfter = after.get(edgeId)!;

    expect(edgeAfter.x).toBe(edgeBefore.x);
    // With the clamp: bounded by the real distance to HOMES_HI (48px). Without
    // it: bounded only by the much larger gap to the far pin, so capped at
    // WANDER_CAP instead — a different, larger number.
    expect(edgeAfter.wander).toBe(HOMES_HI - edgeAfter.x);
  });

  it('steps a packed row around its pins instead of through them', () => {
    // Enough automatic villagers in the front row — which carries no scenery
    // bands, so the packing arithmetic is exact — to exhaust both the
    // personal-space and MIN_SEPARATION rungs and reach seatRowPacked, the
    // rung that packs left to right at the floor. Two pins are seeded exactly
    // where an unaware packer would place its 3rd and 8th villagers.
    const auto = Array.from({ length: 500 }, (_, i) => `skill:packcrowd-${i}`);
    const pinA = 'skill:packed-pin-a';
    const pinB = 'skill:packed-pin-b';
    const packedIds = [...auto, pinA, pinB];
    const pinAx = HOMES_LO + 2 * MIN_SEPARATION;
    const pinBx = HOMES_LO + 7 * MIN_SEPARATION;
    const pins = new Map<string, Pin>([
      [pinA, { x: pinAx, y: GROUND_FRONT }],
      [pinB, { x: pinBx, y: GROUND_FRONT }],
    ]);

    const spots = placeCreatures(packedIds, pins);
    expect(spots.size).toBe(packedIds.length);
    expect(spots.get(pinA)!.x).toBe(pinAx);
    expect(spots.get(pinB)!.x).toBe(pinBx);
    for (const [id, spot] of spots) {
      if (id === pinA || id === pinB || spot.y !== GROUND_FRONT) continue;
      expect(Math.abs(spot.x - pinAx)).toBeGreaterThanOrEqual(MIN_SEPARATION);
      expect(Math.abs(spot.x - pinBx)).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('clamps a pinned villager’s leash against the general bands, not just the Homes ones', () => {
    // A pin can legally stand anywhere from PIN_LO to PIN_HI, including next
    // to a construction site outside Homes — ground.bands (Homes-only,
    // precomputed per row) never covers those. Resolving via pinSpot lands
    // this pin flush against the site's keep-out band, so a lone pinned
    // villager's leash is zero if and only if the general bands are actually
    // consulted for it.
    const pin = pinSpot(CONSTRUCTION_XS[0]! + 30, CONSTRUCTION_BASE_Y, []);
    const soleId = 'skill:construction-neighbour';
    const spots = placeCreatures([soleId], new Map([[soleId, pin]]));
    expect(spots.get(soleId)!.wander).toBe(0);
  });
});
