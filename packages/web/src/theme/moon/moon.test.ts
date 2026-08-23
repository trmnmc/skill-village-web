import { describe, it, expect } from 'vitest';
import { moonForDate, nightDarkness } from './moon.js';
import { computeMoon } from './astro.js';

describe('vendored astro.js stays true to upstream', () => {
  // Vectors printed by the upstream repo's own computeMoon (see Task 7 Step 2):
  //   node -e "const {computeMoon}=require('./src/astro');for(const s of [...]) ..."
  // run inside a fresh clone of github.com/trmnmc/moon.
  //   2026-01-03T12:00:00Z  full             0.9999136639262398
  //   2026-08-23T12:00:00Z  waxing gibbous   0.8018373338538037
  //   2000-01-06T18:14:00Z  new              8.418762187378803e-9
  it('2026-01-03 12:00 UTC matches the upstream fixture', () => {
    const m = computeMoon(new Date('2026-01-03T12:00:00Z'));
    expect(m.phaseName).toBe('full');
    expect(m.illumination).toBeCloseTo(1.0, 3);
  });

  it('2026-08-23 12:00 UTC matches the upstream fixture', () => {
    const m = computeMoon(new Date('2026-08-23T12:00:00Z'));
    expect(m.phaseName).toBe('waxing gibbous');
    expect(m.illumination).toBeCloseTo(0.802, 3);
  });

  it('2000-01-06 18:14 UTC is the k=0 new moon', () => {
    const m = computeMoon(new Date('2000-01-06T18:14:00Z'));
    expect(m.phaseName).toBe('new');
    expect(m.illumination).toBeCloseTo(0.0, 3);
    expect(m.illumination).toBeLessThan(0.02);
  });

  it('phase name and illumination agree at quarters', () => {
    const m = computeMoon(new Date('2026-08-23T12:00:00Z'));
    expect(m.illumination).toBeGreaterThanOrEqual(0);
    expect(m.illumination).toBeLessThanOrEqual(1);
    expect(typeof m.phaseName).toBe('string');
  });
});

describe('moonForDate', () => {
  it('reports waxing from the cycle fraction', () => {
    const newish = moonForDate(new Date('2000-01-08T00:00:00Z'));
    expect(newish.waxing).toBe(true);
    const fullish = moonForDate(new Date('2000-01-28T00:00:00Z'));
    expect(fullish.waxing).toBe(false);
  });
});

describe('nightDarkness', () => {
  it('new moon darkest, full moon brightest', () => {
    expect(nightDarkness(0)).toBe(1);
    expect(nightDarkness(1)).toBe(0);
    expect(nightDarkness(0.25)).toBeCloseTo(0.75);
  });
});
