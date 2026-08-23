import { describe, it, expect } from 'vitest';
import {
  ZONES,
  WORLD_W,
  GROUND_Y,
  GROUND_TOP,
  MIN_SEPARATION,
  HOMES_HOUSE_XS,
  HOMES_TREE_XS,
  homesKeepOutAt,
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
      // A displaced villager may also have to hop the row's scenery bands —
      // nothing may stand inside one — so the reach bound grows by their width.
      const bandWidth = homesKeepOutAt(arrivalRow).reduce((sum, b) => sum + (b.right - b.left), 0);

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
        expect(Math.abs(now.x - was.x)).toBeLessThanOrEqual(rowSize * MIN_SEPARATION + bandWidth);
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
      expect(y).toBeLessThanOrEqual(GROUND_Y);
      expect(y - 5).toBeGreaterThan(GROUND_TOP);
    }
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

  it('covers every house and tree with a keep-out band for the rows among their pixels', () => {
    // The bands are derived from the same anchors village.ts draws from, so
    // this is the tripwire for someone emptying or narrowing the list: for a
    // middle row (whose feet land among every prop's pixels) every prop's
    // anchor must sit strictly inside some band.
    const middleRowY = GROUND_Y - 46;
    const bands = homesKeepOutAt(middleRowY);
    for (const x of [...HOMES_HOUSE_XS, ...HOMES_TREE_XS]) {
      expect(bands.some((b) => b.left < x && x < b.right)).toBe(true);
    }
  });

  it('gives the front and back rows no bands — they clear the scenery by depth', () => {
    // Front-row feet sit below every prop's base, so a front villager stands
    // *in front of* the scenery; back-row feet clear even the rooflines. Only
    // the middle rows ever share pixels with a prop, and blocking more than
    // that would cost the row capacity the village needs.
    expect(homesKeepOutAt(GROUND_Y)).toEqual([]);
    expect(homesKeepOutAt(GROUND_Y - 3 * 46)).toEqual([]);
  });

  it('never stands a villager among the scenery pixels of its own row', () => {
    // The houses, trees and the Homes sign are drawn inside the same x-band
    // the villagers are seated in, and creatures z-sort above props — so a
    // villager whose feet land among a prop's pixels is drawn standing *on*
    // the house, not behind it. Placement is the only thing preventing that.
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
