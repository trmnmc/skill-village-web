import { describe, it, expect } from 'vitest';
import {
  ZONES,
  WORLD_W,
  GROUND_Y,
  GROUND_FRONT,
  GROUND_TOP,
  MIN_SEPARATION,
  HOMES_HOUSE_XS,
  HOMES_TREE_XS,
  HOMES_SIGN_X,
  HOMES_LO,
  HOMES_HI,
  homesKeepOutAt,
  personalSpace,
  placeCreatures,
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

  it('nudges only same-row neighbours, and only within reach, when a villager arrives', () => {
    // Guaranteed spacing and per-id-only placement cannot both hold: with a
    // finite number of non-overlapping spots, a newcomer landing on an
    // occupied one has to move somebody. So this does not assert that nobody
    // moves — that is false. It asserts the disruption stays local, stays
    // bounded, and is the same disruption every time.
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
      const rowSize = [...after.values()].filter((s) => s.y === arrivalRow).length;
      // A displaced villager may also have to hop its row's scenery bands —
      // nothing may stand inside one — so the reach bound grows by their
      // width; a packed stretch is at most everyone's personal diameters end
      // to end.
      const bandWidth = homesKeepOutAt(arrivalRow).reduce((sum, b) => sum + (b.right - b.left), 0);
      const maxDiameter = 2 * Math.max(...list.map((id) => personalSpace(id)));

      for (const id of ids) {
        const was = before.get(id)!;
        const now = after.get(id)!;
        // Depth comes straight from the id's own hash, so nobody ever changes
        // row — an arrival cannot ripple into a different band of the field.
        expect(now.y).toBe(was.y);
        if (now.x === was.x) continue;
        expect(now.y).toBe(arrivalRow);
        // A displaced villager steps clear of the cluster it was standing in.
        // It can never travel further than that row could pack end to end.
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
    // A depth gradient is what sells the composition: most villagers mill
    // about the baseline and the far field, and only a few bold ones come
    // near the camera. Uniform rows put a sixth of the village in the front
    // row and it read as a crowd pressed against the glass.
    const many = Array.from({ length: 600 }, (_, i) => `skill:many${i}`);
    const counts = new Map<number, number>();
    for (const { y } of placeCreatures(many).values()) {
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    const front = counts.get(GROUND_FRONT) ?? 0;
    const second = counts.get(GROUND_FRONT - 46) ?? 0;
    expect(front).toBeGreaterThan(0);
    for (const [y, n] of counts) {
      if (y === GROUND_FRONT) continue;
      expect(front, `front row vs row y=${y}`).toBeLessThan(n);
      if (y === GROUND_FRONT - 46) continue;
      expect(second, `second row vs row y=${y}`).toBeLessThan(n);
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
    // (front-most row), and protected from every row that would cover it.
    for (const y of [GROUND_Y - 3 * 46, GROUND_Y - 2 * 46, GROUND_FRONT]) {
      expect(inBand(y, HOMES_SIGN_X), `sign free at y=${y}`).toBe(false);
    }
    for (const y of [GROUND_Y - 46, GROUND_Y, GROUND_FRONT - 46]) {
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
