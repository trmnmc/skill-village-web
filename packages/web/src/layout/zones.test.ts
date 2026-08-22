import { describe, it, expect } from 'vitest';
import { ZONES, WORLD_W, GROUND_Y, GROUND_TOP, placeCreatures } from './zones.js';

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

  it('keeps a creature in place when others arrive', () => {
    const before = placeCreatures(ids);
    const after = placeCreatures([...ids, 'agent:newcomer']);
    for (const id of ids) {
      expect(after.get(id)).toEqual(before.get(id));
    }
  });

  it('keeps everyone inside the homes zone', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    for (const { x } of placeCreatures(ids).values()) {
      expect(x).toBeGreaterThanOrEqual(homes.x);
      expect(x).toBeLessThanOrEqual(homes.x + homes.w);
    }
  });

  it('spreads them out rather than stacking them', () => {
    const xs = [...placeCreatures(ids).values()].map((s) => s.x);
    expect(new Set(xs).size).toBeGreaterThan(ids.length / 2);
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

  it('varies depth so the village reads as a field, not a line', () => {
    const ys = new Set([...placeCreatures(ids).values()].map((s) => s.y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('handles an empty village', () => {
    expect(placeCreatures([]).size).toBe(0);
  });
});
