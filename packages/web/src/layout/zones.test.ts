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
  HOMES_KEEP_OUT,
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
      // A displaced villager may also have to hop the scenery bands — nothing
      // may stand inside one — so the reach bound grows by their width; and a
      // packed stretch is at most everyone's personal diameters end to end.
      const bandWidth = HOMES_KEEP_OUT.reduce((sum, b) => sum + (b.right - b.left), 0);
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

  it('covers every house and tree with a keep-out band', () => {
    // The bands are derived from the same anchors village.ts draws from, so
    // this is the tripwire for someone emptying or narrowing the list: every
    // prop's anchor must sit strictly inside some band.
    for (const x of [...HOMES_HOUSE_XS, ...HOMES_TREE_XS]) {
      expect(HOMES_KEEP_OUT.some((b) => b.left < x && x < b.right)).toBe(true);
    }
  });

  it('never stands a villager in a scenery keep-out band, whatever its row', () => {
    // The houses, trees and the Homes sign are drawn inside the same x-band
    // the villagers are seated in. Depth once exempted the front and back
    // rows (their pixels genuinely clear the props), but the eye disagreed:
    // a villager in front of a house hides it, one just above a roofline
    // reads as perched on it. Every row keeps clear now.
    const violations: string[] = [];
    for (const [id, { x }] of placeCreatures(ids)) {
      for (const band of HOMES_KEEP_OUT) {
        if (x > band.left && x < band.right) {
          violations.push(`${id} at x=${x} inside [${band.left}, ${band.right}]`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps villagers off the scenery even when rows are past capacity', () => {
    // Overcrowding degrades creature spacing first (villagers may overlap each
    // other), never the scenery rule: the fallback seats a creature at the
    // nearest clear ground, so nobody ever stands on a roof to make room.
    const crowd = Array.from({ length: 300 }, (_, i) => `skill:crowd${i}`);
    const violations: string[] = [];
    for (const [id, { x }] of placeCreatures(crowd)) {
      for (const band of HOMES_KEEP_OUT) {
        if (x > band.left && x < band.right) {
          violations.push(`${id} at x=${x} inside [${band.left}, ${band.right}]`);
        }
      }
    }
    expect(violations).toEqual([]);
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
