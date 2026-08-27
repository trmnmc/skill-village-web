import { describe, expect, it } from 'vitest';
import { workStats, THRIVING_MOOD, CONTENT_MOOD, DAY_MS } from './work.js';
import { STAT_FLOOR } from './stats.js';

describe('workStats', () => {
  it('worked within a day: thriving (hops — above behaviour thresholds 75/70)', () => {
    expect(workStats(0).mood).toBe(THRIVING_MOOD);
    expect(workStats(23 * 3_600_000)).toEqual({ mood: 85, energy: 80 });
  });

  it('eases from thriving to content across the first week', () => {
    expect(workStats(4 * DAY_MS).mood).toBeCloseTo(72.5, 5);
    expect(workStats(7 * DAY_MS).mood).toBeCloseTo(CONTENT_MOOD, 5);
  });

  it('droops past a week, relaxing toward the floor but never below it', () => {
    expect(workStats(12 * DAY_MS).mood).toBeCloseTo(STAT_FLOOR + 30 / 2, 5); // one half-life past day 7
    expect(workStats(365 * DAY_MS).mood).toBeGreaterThanOrEqual(STAT_FLOOR);
    expect(workStats(365 * DAY_MS).mood).toBeLessThan(31);
  });

  it('is monotone non-increasing and continuous at both joints', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 30; d += 0.25) {
      const { mood } = workStats(d * DAY_MS);
      expect(mood).toBeLessThanOrEqual(prev + 1e-9);
      prev = mood;
    }
  });

  it('a clock that jumped backwards reads as freshly worked, never as negative time', () => {
    expect(workStats(-5 * DAY_MS).mood).toBe(THRIVING_MOOD);
  });

  it('energy trails mood by 5, floored', () => {
    expect(workStats(0).energy).toBe(80);
    expect(workStats(365 * DAY_MS).energy).toBeGreaterThanOrEqual(STAT_FLOOR);
  });
});
