import { describe, it, expect } from 'vitest';
import {
  STAT_FLOOR, STAT_MAX, ELDER_LEVEL,
  decayStat, decayStats, levelForXp, xpForLevel, applyCare, nextStage,
} from './stats.js';
import type { Stats } from '../types.js';

const fresh = (): Stats => ({ mood: 100, energy: 100, bond: 40, xp: 0 });

describe('decayStat', () => {
  it('does not move when no time has passed', () => {
    expect(decayStat(100, 0)).toBe(100);
  });

  it('decreases monotonically as time away grows', () => {
    let previous = 100;
    for (const hours of [1, 6, 12, 24, 48, 72]) {
      const value = decayStat(100, hours);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('bottoms out at the floor rather than reaching zero', () => {
    expect(decayStat(100, 24 * 365)).toBeCloseTo(STAT_FLOOR, 5);
    expect(decayStat(100, 10_000)).toBeGreaterThanOrEqual(STAT_FLOOR);
  });

  it('is close to the floor after about three days, per the spec', () => {
    const afterThreeDays = decayStat(100, 72);
    expect(afterThreeDays).toBeLessThan(STAT_FLOOR + 12);
    expect(afterThreeDays).toBeGreaterThan(STAT_FLOOR);
  });

  it('keeps the floor above the renderer SLEEP_BELOW line of 25, so resting creatures stay awake', () => {
    expect(STAT_FLOOR).toBeGreaterThan(25);
  });

  it('holds a value already resting exactly on the floor', () => {
    expect(decayStat(STAT_FLOOR, 100)).toBeCloseTo(STAT_FLOOR, 5);
  });

  it('rejects negative time rather than silently inflating a stat', () => {
    expect(() => decayStat(50, -1)).toThrow(/hours/i);
  });
});

describe('decayStats', () => {
  it('decays mood and energy but never bond or xp', () => {
    const before = { mood: 100, energy: 80, bond: 55, xp: 900 };
    const after = decayStats(before, 48);
    expect(after.mood).toBeLessThan(before.mood);
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.bond).toBe(before.bond);
    expect(after.xp).toBe(before.xp);
  });
});

describe('levels', () => {
  it('starts every creature at level 1', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('never decreases as xp grows', () => {
    let previous = 0;
    for (let xp = 0; xp < 20_000; xp += 137) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('round trips against xpForLevel', () => {
    for (let level = 1; level <= 20; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1 || 1);
    }
  });
});

describe('applyCare', () => {
  it('raises mood and bond when chatting', () => {
    const after = applyCare(fresh(), 'chat');
    expect(after.bond).toBeGreaterThan(40);
  });

  it('never pushes a stat above the maximum', () => {
    let stats: Stats = { mood: 99, energy: 99, bond: 99, xp: 0 };
    for (let i = 0; i < 50; i++) stats = applyCare(stats, 'play');
    expect(stats.mood).toBeLessThanOrEqual(STAT_MAX);
    expect(stats.bond).toBeLessThanOrEqual(STAT_MAX);
  });

  it('never lowers bond or xp, whatever the verb', () => {
    for (const verb of ['pet', 'play', 'chat', 'train'] as const) {
      const before = fresh();
      const after = applyCare(before, verb);
      expect(after.bond).toBeGreaterThanOrEqual(before.bond);
      expect(after.xp).toBeGreaterThanOrEqual(before.xp);
    }
  });

  it('gives training the largest xp gain, since it improves the real file', () => {
    const base = fresh();
    const train = applyCare(base, 'train').xp;
    for (const verb of ['pet', 'play', 'chat'] as const) {
      expect(train).toBeGreaterThan(applyCare(base, verb).xp);
    }
  });

  it('costs energy when playing but not when petting', () => {
    expect(applyCare(fresh(), 'play').energy).toBeLessThan(100);
    expect(applyCare(fresh(), 'pet').energy).toBe(100);
  });
});

describe('nextStage', () => {
  it('leaves an egg alone, because hatching is a player action, not a stat threshold', () => {
    expect(nextStage('egg', 1, false)).toBe('egg');
    expect(nextStage('egg', 99, true)).toBe('egg');
  });

  it('promotes a hatchling to adult the moment its file is installed', () => {
    expect(nextStage('hatchling', 1, true)).toBe('adult');
    expect(nextStage('hatchling', 1, false)).toBe('hatchling');
  });

  it('promotes an adult to elder at the level threshold', () => {
    expect(nextStage('adult', ELDER_LEVEL - 1, true)).toBe('adult');
    expect(nextStage('adult', ELDER_LEVEL, true)).toBe('elder');
  });

  it('never demotes, because nothing in this game goes backwards', () => {
    expect(nextStage('elder', 1, true)).toBe('elder');
    expect(nextStage('adult', 1, false)).toBe('adult');
  });
});

describe('decayStat — the floor is a resting point, not a one-way trapdoor', () => {
  it('lifts a creature that somehow sits below the floor back up toward it', () => {
    // Rest restores. Without this a creature driven under the floor (by play
    // costs, or by a save written under an older floor) stayed there forever.
    const risen = decayStat(10, 24);
    expect(risen).toBeGreaterThan(10);
    expect(risen).toBeLessThanOrEqual(STAT_FLOOR);
  });

  it('converges on the floor from either direction', () => {
    expect(decayStat(5, 10_000)).toBeCloseTo(STAT_FLOOR, 5);
    expect(decayStat(100, 10_000)).toBeCloseTo(STAT_FLOOR, 5);
  });
});
