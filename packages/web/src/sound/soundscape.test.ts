import { describe, it, expect } from 'vitest';
import { mixAt, type AmbienceMix } from './soundscape.js';

/** Local-clock date helper: hours/minutes on an arbitrary fixed day. */
const at = (h: number, m = 0) => new Date(2026, 7, 24, h, m, 0);

const fields: (keyof AmbienceMix)[] = [
  'windFreq', 'windGain', 'birdRate', 'cricketGain', 'musicLevel', 'musicWarmth',
];

describe('mixAt', () => {
  it('deep night is crickets and low wind — no birds, no music', () => {
    const night = mixAt(at(3, 0));
    expect(night.birdRate).toBe(0);
    expect(night.musicLevel).toBe(0);
    expect(night.cricketGain).toBeGreaterThan(0.02);
    expect(night.windFreq).toBeLessThan(400);
  });

  it('the dawn chorus peaks at 06:45 — denser than either shoulder', () => {
    const peak = mixAt(at(6, 45)).birdRate;
    expect(peak).toBeGreaterThan(mixAt(at(6, 10)).birdRate);
    expect(peak).toBeGreaterThan(mixAt(at(7, 20)).birdRate);
  });

  it('the day plateau holds: 10:00 and 14:00 are identical', () => {
    expect(mixAt(at(10, 0))).toEqual(mixAt(at(14, 0)));
  });

  it('crickets are gone at noon and fade monotonically in across dusk', () => {
    expect(mixAt(at(12, 0)).cricketGain).toBe(0);
    const samples = [at(17, 45), at(18, 30), at(19, 20), at(20, 0), at(21, 0)].map(
      (d) => mixAt(d).cricketGain,
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });

  it('lerps, never steps: 19:00 sits strictly between its dusk keyframes', () => {
    const mid = mixAt(at(19, 0)).birdRate;
    const before = mixAt(at(18, 45)).birdRate;
    const after = mixAt(at(19, 20)).birdRate;
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(after);
  });

  it('midnight is continuous: 23:59 and 00:01 agree to within a whisker', () => {
    const a = mixAt(at(23, 59));
    const b = mixAt(at(0, 1));
    for (const f of fields) {
      expect(Math.abs(a[f] - b[f])).toBeLessThan(0.01 * Math.max(1, a[f]));
    }
  });
});
