import { describe, it, expect } from 'vitest';
import { frac, rainDrop, snowFlake, fx, fy, mapX, mapY, rainbowBlocks } from './weather-layer.js';

describe('frac', () => {
  it('returns the fractional part for positive numbers', () => {
    expect(frac(2.75)).toBeCloseTo(0.75, 10);
    expect(frac(3)).toBe(0);
  });

  it('wraps negative numbers into [0,1) the same way the reference painter relies on', () => {
    // frac(x) = x - Math.floor(x); Math.floor(-1.25) = -2, so frac = 0.75.
    expect(frac(-1.25)).toBeCloseTo(0.75, 10);
  });

  it('always returns a value in [0, 1)', () => {
    for (const x of [0, 0.999, 1, 1.5, -0.001, 100.1, -100.1]) {
      const f = frac(x);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('rainDrop', () => {
  it('is deterministic: the same (i, t, heavy) always produces the same drop', () => {
    expect(rainDrop(5, 1.3, false)).toEqual(rainDrop(5, 1.3, false));
    expect(rainDrop(5, 1.3, true)).toEqual(rainDrop(5, 1.3, true));
  });

  it('returns finite values inside the reference-space scene bounds (480x270 canvas)', () => {
    for (let i = 0; i < 100; i++) {
      const d = rainDrop(i, 1.3, i % 2 === 0);
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
      expect(Number.isFinite(d.len)).toBe(true);
      expect(Number.isFinite(d.alpha)).toBe(true);
      // Reference rpx ranges roughly [0, 500] plus up to ~±0.28*278 of slant
      // either side; reference rpy ranges [-12, 278). Generous headroom on
      // both, in raw reference-space pixels (the draw site maps these
      // through mapX/mapY, not this function).
      expect(d.x).toBeGreaterThan(-200);
      expect(d.x).toBeLessThan(700);
      expect(d.y).toBeGreaterThanOrEqual(-13);
      expect(d.y).toBeLessThan(279);
      expect(d.alpha).toBeGreaterThanOrEqual(0.14);
      expect(d.alpha).toBeLessThanOrEqual(0.14 + 0.18);
      expect(d.len).toBeGreaterThan(0);
    }
  });

  it('matches the reference formula exactly (transcription fidelity), in raw reference space', () => {
    const i = 12;
    const t = 4.2;
    for (const heavy of [false, true]) {
      const r1 = frac(i * 0.6180339);
      const r2 = frac(i * 0.7548776);
      const r3 = frac(i * 0.5698402);
      const speed = (heavy ? 200 : 115) * (0.7 + r3 * 0.6);
      const len = (heavy ? 7 : 5) + r2 * 4;
      const refY = (((r1 * 900) + t * speed) % 290) - 12;
      const refX = r2 * 500 + (heavy ? -refY * 0.28 : -refY * 0.08);
      const alpha = 0.14 + r3 * 0.18;
      const expected = { x: refX, y: refY, len, alpha };
      const actual = rainDrop(i, t, heavy);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
      expect(actual.len).toBeCloseTo(expected.len, 6);
      expect(actual.alpha).toBeCloseTo(expected.alpha, 6);
    }
  });

  it('leans harder sideways per unit of fall when heavy (steeper rain slant)', () => {
    // The slant coefficient (x's dependence on y) is 0.28 for heavy rain vs
    // 0.08 for light rain in the reference. Holding i and t fixed isolates
    // that coefficient from the shared r2*500 base offset both share.
    const i = 30;
    const t = 2.0;
    const light = rainDrop(i, t, false);
    const heavy = rainDrop(i, t, true);
    const r2 = frac(i * 0.7548776);
    const base = r2 * 500;
    const lightSlant = Math.abs(light.x - base) / Math.max(1e-6, Math.abs(light.y));
    const heavySlant = Math.abs(heavy.x - base) / Math.max(1e-6, Math.abs(heavy.y));
    expect(heavySlant).toBeGreaterThan(lightSlant);
  });
});

describe('snowFlake', () => {
  it('is deterministic: the same (i, t) always produces the same flake', () => {
    expect(snowFlake(7, 1.3)).toEqual(snowFlake(7, 1.3));
  });

  it('returns finite, in-bounds values in raw reference space', () => {
    for (let i = 0; i < 60; i++) {
      const f = snowFlake(i, 1.3);
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
      expect([2, 3]).toContain(f.size);
      expect(f.alpha).toBeGreaterThanOrEqual(0.3);
      expect(f.alpha).toBeLessThanOrEqual(0.8);
      expect(f.y).toBeGreaterThanOrEqual(-6);
      expect(f.y).toBeLessThan(286);
    }
  });

  it('matches the reference formula exactly (transcription fidelity), in raw reference space', () => {
    const i = 9;
    const t = 3.7;
    const s1 = frac(i * 0.6180339);
    const s2 = frac(i * 0.7548776);
    const s3 = frac(i * 0.5698402);
    const fall = 13 + s3 * 17;
    const refY = (((s1 * 900) + t * fall) % 285) - 5;
    const refX = s2 * 480 + Math.sin(t * (0.35 + s3 * 0.5) + i) * (6 + s1 * 10);
    const size = s1 < 0.15 ? 3 : 2;
    const alpha = 0.3 + s3 * 0.5;
    const actual = snowFlake(i, t);
    expect(actual.x).toBeCloseTo(refX, 6);
    expect(actual.y).toBeCloseTo(refY, 6);
    expect(actual.size).toBe(size);
    expect(actual.alpha).toBeCloseTo(alpha, 6);
  });

  it('sway is bounded: a snowflake cannot teleport sideways between nearby frames', () => {
    // The reference sways x by sin(t*(0.35..0.85)+i) * (6..16 reference px).
    // Over dt=0.1s the fastest possible swing is amplitude(16) *
    // maxAngularSpeed(0.85) * dt ≈ 1.36 reference px (mean-value bound on
    // sin's derivative). 5 reference px is a generous bound that still
    // catches a real regression (e.g. a sign error inflating the amplitude
    // by an order of magnitude) without being sensitive to exact tuning.
    for (let i = 0; i < 60; i++) {
      const a = snowFlake(i, 10);
      const b = snowFlake(i, 10.1);
      expect(Math.abs(b.x - a.x)).toBeLessThan(5);
    }
  });
});

describe('fx', () => {
  it('is width / 480', () => {
    expect(fx(480)).toBeCloseTo(1, 10);
    expect(fx(960)).toBeCloseTo(2, 10);
    expect(fx(240)).toBeCloseTo(0.5, 10);
  });
});

describe('fy', () => {
  it('is horizonY / 182', () => {
    expect(fy(182)).toBeCloseTo(1, 10);
    expect(fy(91)).toBeCloseTo(0.5, 10);
    expect(fy(364)).toBeCloseTo(2, 10);
  });
});

describe('mapX', () => {
  it('scales a reference x by fx(width)', () => {
    expect(mapX(240, 480)).toBeCloseTo(240, 10);
    expect(mapX(240, 960)).toBeCloseTo(480, 10);
    expect(mapX(0, 800)).toBeCloseTo(0, 10);
  });
});

describe('mapY', () => {
  it('scales a sky-band reference y (<=182) linearly by fy(horizonY)', () => {
    expect(mapY(91, 200, 600)).toBeCloseTo(91 * fy(200), 10);
    expect(mapY(0, 200, 600)).toBeCloseTo(0, 10);
  });

  it('meets the piecewise boundary exactly at refY=182: mapY(182,h,H) === fy(h)*182 === h', () => {
    const horizonY = 173;
    const height = 620;
    expect(mapY(182, horizonY, height)).toBeCloseTo(fy(horizonY) * 182, 10);
    expect(mapY(182, horizonY, height)).toBeCloseTo(horizonY, 10);
  });

  it('reaches exactly the bottom of the screen at refY=270: mapY(270,h,H) === H', () => {
    const horizonY = 173;
    const height = 620;
    expect(mapY(270, horizonY, height)).toBeCloseTo(height, 10);
  });

  it('interpolates linearly across the ground band between the horizon and the bottom', () => {
    const horizonY = 180;
    const height = 700;
    // Halfway through the ground band (refY=226) should land halfway
    // between the horizon and the bottom of the screen.
    const midRefY = 182 + (270 - 182) / 2;
    expect(mapY(midRefY, horizonY, height)).toBeCloseTo(horizonY + (height - horizonY) / 2, 6);
  });
});

describe('rainbowBlocks', () => {
  it('is deterministic: the same (width, horizonY) always produces the same blocks', () => {
    expect(rainbowBlocks(800, 180)).toEqual(rainbowBlocks(800, 180));
  });

  it('produces all five bands', () => {
    const blocks = rainbowBlocks(800, 180);
    const bands = new Set(blocks.map((b) => b.band));
    expect(bands).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('keeps each band contiguous: neighboring blocks are no further apart than one block size', () => {
    const blocks = rainbowBlocks(800, 180);
    for (let band = 0; band < 5; band++) {
      const bandBlocks = blocks.filter((b) => b.band === band);
      expect(bandBlocks.length).toBeGreaterThan(1);
      for (let i = 1; i < bandBlocks.length; i++) {
        const prev = bandBlocks[i - 1]!;
        const cur = bandBlocks[i]!;
        const gap = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        // A small epsilon absorbs floating-point noise on the theoretical
        // chord-length <= size bound (chord = 2R sin(θ/2) <= Rθ = size).
        expect(gap).toBeLessThanOrEqual(cur.size + 1e-9);
      }
    }
  });

  it('produces roughly 134 blocks for the outermost band (170 ref-px radius, 4/rr step)', () => {
    const blocks = rainbowBlocks(800, 180);
    const band0 = blocks.filter((b) => b.band === 0);
    // pi / (4/170) = 170*pi/4 ≈ 133.5, so 133 or 134 samples depending on
    // where the last step lands relative to the pi..2pi range.
    expect(band0.length).toBeGreaterThanOrEqual(130);
    expect(band0.length).toBeLessThanOrEqual(137);
  });
});
