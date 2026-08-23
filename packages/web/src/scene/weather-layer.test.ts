import { describe, it, expect } from 'vitest';
import {
  frac,
  rainDrop,
  snowFlake,
  fx,
  fy,
  mapX,
  mapY,
  rainbowBlocks,
  overcastCloudSpecs,
  fairCloudSpecs,
  OVERCAST_CLOUD_CLUSTERS,
  FAIR_CLOUD_ALWAYS,
  FAIR_CLOUD_DAY_ONLY,
  hash,
  strikeParams,
  activeStrike,
  strikeEnvelope,
  boltSegments,
  flickerActive,
} from './weather-layer.js';
import { mix } from '../theme/palettes.js';

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

describe('overcastCloudSpecs', () => {
  it('is deterministic: the same (kind, night, t, width, horizonY) always produces the same blobs', () => {
    expect(overcastCloudSpecs('cloudy', false, 3.2, 800, 180)).toEqual(overcastCloudSpecs('cloudy', false, 3.2, 800, 180));
  });

  it('returns all 6 rects across the reference\'s 4 clusters (14/32, 150, 248/270, 384)', () => {
    expect(overcastCloudSpecs('cloudy', false, 0, 480, 182)).toHaveLength(6);
  });

  it('selects the reference tone per kind', () => {
    const toneOf = (kind: 'cloudy' | 'rain' | 'snow' | 'fog') => overcastCloudSpecs(kind, false, 0, 480, 182)[0]!.color;
    expect(toneOf('cloudy')).toBe('#B4BABE');
    expect(toneOf('rain')).toBe('#9AA6AE');
    expect(toneOf('snow')).toBe('#C8D0D6');
    expect(toneOf('fog')).toBe('#CFCCC0');
  });

  it('mixes the tone 50% toward #1A2028 at night, verbatim from the reference', () => {
    const dayColor = overcastCloudSpecs('cloudy', false, 0, 480, 182)[0]!.color;
    const nightColor = overcastCloudSpecs('cloudy', true, 0, 480, 182)[0]!.color;
    expect(nightColor).toBe(mix(dayColor, '#1A2028', 0.5));
    expect(nightColor).not.toBe(dayColor);
  });

  it('uses a flat alpha of 0.85 per blob (ramp is applied by the caller, not this pure function)', () => {
    for (const b of overcastCloudSpecs('rain', false, 5, 480, 182)) expect(b.alpha).toBe(0.85);
  });

  it('drift wraps deterministically: 3 ref px/s over a 640 ref-px period repeats every 640/3 seconds', () => {
    const a = overcastCloudSpecs('fog', false, 12.7, 480, 182);
    const b = overcastCloudSpecs('fog', false, 12.7 + 640 / 3, 480, 182);
    for (let i = 0; i < a.length; i++) expect(b[i]!.x).toBeCloseTo(a[i]!.x, 6);
  });

  it('never produces a NaN or unbounded x once tSec*3 exceeds the wrap period many times over', () => {
    for (const b of overcastCloudSpecs('cloudy', false, 100_000, 480, 182)) {
      expect(Number.isFinite(b.x)).toBe(true);
    }
  });

  it('scales intra-cluster offsets and sizes by fy(horizonY) on both axes (class-2 cluster)', () => {
    const base = overcastCloudSpecs('cloudy', false, 0, 480, 182); // fy(182) = 1
    const doubled = overcastCloudSpecs('cloudy', false, 0, 480, 364); // fy(364) = 2
    // Cluster A: index 0 is the anchor rect (0 intra offset), index 1 is its
    // companion rect (18 ref-px intra offset) — the gap between them should
    // double exactly when fy doubles, while the anchor itself (mapX-driven,
    // independent of horizonY) stays put.
    expect(doubled[0]!.x).toBeCloseTo(base[0]!.x, 6);
    const baseOffset = base[1]!.x - base[0]!.x;
    const doubledOffset = doubled[1]!.x - doubled[0]!.x;
    expect(doubledOffset).toBeCloseTo(baseOffset * 2, 6);
    expect(doubled[0]!.w).toBeCloseTo(base[0]!.w * 2, 6);
    expect(doubled[0]!.h).toBeCloseTo(base[0]!.h * 2, 6);
  });
});

describe('fairCloudSpecs', () => {
  it('is deterministic: the same (dawn, t, width, horizonY, overcastRamp) always produces the same blobs', () => {
    expect(fairCloudSpecs(false, 3.2, 800, 180, 0)).toEqual(fairCloudSpecs(false, 3.2, 800, 180, 0));
  });

  it('draws only the always-cluster (2 rects) at dawn', () => {
    expect(fairCloudSpecs(true, 0, 480, 182, 0)).toHaveLength(2);
  });

  it('draws both clusters (4 rects) in full day — the "day only" second cluster', () => {
    expect(fairCloudSpecs(false, 0, 480, 182, 0)).toHaveLength(4);
  });

  it('is warm cream at dawn, plain white in full day', () => {
    expect(fairCloudSpecs(true, 0, 480, 182, 0)[0]!.color).toBe('#FFF3E0');
    expect(fairCloudSpecs(false, 0, 480, 182, 0)[0]!.color).toBe('#FFFFFF');
  });

  it('alpha is 0.75 at overcastRamp 0 (base sky furniture, not weather-ramp-scaled)', () => {
    for (const b of fairCloudSpecs(false, 9, 480, 182, 0)) expect(b.alpha).toBe(0.75);
  });

  it('crossfades linearly as overcastRamp rises from 0 to 1: 0.375 at 0.5, 0 at 1', () => {
    for (const b of fairCloudSpecs(false, 9, 480, 182, 0.5)) expect(b.alpha).toBeCloseTo(0.375, 10);
    for (const b of fairCloudSpecs(false, 9, 480, 182, 1)) expect(b.alpha).toBe(0);
  });

  it('non-overcast weather kinds (wind, leaves, heat, rainbow, clear) pass overcastRamp 0 regardless of their own ramp, so fair clouds stay at full alpha', () => {
    // The caller derives overcastRamp as `OVERCAST.has(kind) ? ramp : 0` — for
    // a non-overcast kind that's always 0 no matter how high that kind's own
    // ramp climbs, so this just re-confirms the 0-ramp case at a high tSec.
    for (const b of fairCloudSpecs(false, 9, 480, 182, 0)) expect(b.alpha).toBe(0.75);
  });

  it('drift wraps deterministically: 1.5 ref px/s over a 640 ref-px period repeats every 640/1.5 seconds', () => {
    const a = fairCloudSpecs(false, 4.4, 480, 182, 0);
    const b = fairCloudSpecs(false, 4.4 + 640 / 1.5, 480, 182, 0);
    for (let i = 0; i < a.length; i++) expect(b[i]!.x).toBeCloseTo(a[i]!.x, 6);
  });

  it('scales intra-cluster offsets and sizes by fy(horizonY) on both axes (class-2 cluster)', () => {
    const base = fairCloudSpecs(false, 0, 480, 182, 0); // fy(182) = 1
    const doubled = fairCloudSpecs(false, 0, 480, 364, 0); // fy(364) = 2
    expect(doubled[0]!.x).toBeCloseTo(base[0]!.x, 6);
    const baseOffset = base[1]!.x - base[0]!.x;
    const doubledOffset = doubled[1]!.x - doubled[0]!.x;
    expect(doubledOffset).toBeCloseTo(baseOffset * 2, 6);
    expect(doubled[0]!.w).toBeCloseTo(base[0]!.w * 2, 6);
    expect(doubled[0]!.h).toBeCloseTo(base[0]!.h * 2, 6);
  });
});

describe('cloud geometry tables (transcription fidelity)', () => {
  // Verbatim from the reference painter (village-scene.js lines 300–308).
  // These tables drive every overcast/fair-weather cloud shape on screen; a
  // transposed digit here would still pass every other test in this file
  // (they only check drift/scale *behavior*, not the literal numbers), so
  // pin the exact rects directly.

  /** Flattens a cluster def into (baseX+dx, y, w, h) tuples, in raw reference space. */
  function flatten(cluster: { baseX: number; rects: { dx: number; y: number; w: number; h: number }[] }) {
    return cluster.rects.map((r) => [cluster.baseX + r.dx, r.y, r.w, r.h]);
  }

  it('OVERCAST_CLOUD_CLUSTERS matches the reference exactly', () => {
    expect(OVERCAST_CLOUD_CLUSTERS.flatMap(flatten)).toEqual([
      [14, 18, 96, 14],
      [32, 10, 52, 10],
      [150, 40, 74, 12],
      [248, 14, 112, 16],
      [270, 6, 62, 10],
      [384, 42, 82, 12],
    ]);
  });

  it('FAIR_CLOUD_ALWAYS matches the reference exactly', () => {
    expect(flatten(FAIR_CLOUD_ALWAYS)).toEqual([
      [70, 42, 40, 10],
      [80, 34, 24, 8],
    ]);
  });

  it('FAIR_CLOUD_DAY_ONLY matches the reference exactly', () => {
    expect(flatten(FAIR_CLOUD_DAY_ONLY)).toEqual([
      [270, 66, 34, 9],
      [278, 59, 20, 7],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Lightning redesign (Task 3): seeded ~30s strikes, no strobe. See
// weather-layer.ts's "Storm lightning" section for the pure functions under
// test here — hash, the strike scheduler/params, the envelope, bolt
// geometry, and the flicker schedule (which suppresses itself during a
// strike).
// ---------------------------------------------------------------------------

describe('hash', () => {
  it('is deterministic for the same (n, salt)', () => {
    expect(hash(5, 2)).toBe(hash(5, 2));
  });

  it('always returns a value in [0, 1)', () => {
    for (let n = 0; n < 50; n++) {
      for (let salt = 0; salt < 8; salt++) {
        const h = hash(n, salt);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
  });

  it('matches the sky.ts shooting-star idiom formula exactly, generalized with a salt', () => {
    const n = 7;
    const salt = 3;
    const x = Math.sin((n + salt * 77.7) * 12.9898) * 43758.5453;
    expect(hash(n, salt)).toBeCloseTo(frac(x), 10);
  });

  it('decorrelates salts: different salts for the same n produce different values (spot check)', () => {
    expect(hash(3, 0)).not.toBeCloseTo(hash(3, 1), 6);
  });
});

describe('strikeParams', () => {
  it('is deterministic for the same slot', () => {
    expect(strikeParams(4)).toEqual(strikeParams(4));
  });

  it('anchors x01 within [0.15, 0.85)', () => {
    for (let slot = 0; slot < 50; slot++) {
      const { x01 } = strikeParams(slot);
      expect(x01).toBeGreaterThanOrEqual(0.15);
      expect(x01).toBeLessThan(0.85);
    }
  });

  it('picks one of three shape variants', () => {
    for (let slot = 0; slot < 50; slot++) {
      const { variant } = strikeParams(slot);
      expect([0, 1, 2]).toContain(variant);
    }
  });

  it('matches the seeded formula exactly (transcription fidelity)', () => {
    const slot = 11;
    expect(strikeParams(slot)).toEqual({
      x01: 0.15 + hash(slot, 1) * 0.7,
      variant: Math.floor(hash(slot, 2) * 3),
    });
  });
});

describe('activeStrike', () => {
  it('is deterministic: the same tSec always yields the same strike state', () => {
    expect(activeStrike(53.4)).toEqual(activeStrike(53.4));
  });

  it('matches the seeded-scheduler formula exactly inside a strike window', () => {
    const slot = 0;
    const start = slot * 32 + 2 + hash(slot, 0) * 24;
    const dtInside = 0.35;
    const strike = activeStrike(start + dtInside);
    expect(strike).not.toBeNull();
    expect(strike!.dt).toBeCloseTo(dtInside, 6);
    const params = strikeParams(slot);
    expect(strike!.x01).toBeCloseTo(params.x01, 10);
    expect(strike!.variant).toBe(params.variant);
  });

  it('is null just before a strike window starts and once its 0.7s duration elapses', () => {
    const slot = 3;
    const start = slot * 32 + 2 + hash(slot, 0) * 24;
    expect(activeStrike(start - 0.001)).toBeNull();
    expect(activeStrike(start + 0.6999)).not.toBeNull();
    // A tiny margin past the exact 0.7s boundary avoids float-cancellation
    // flakiness from reconstructing dt as (start + 0.7) - start.
    expect(activeStrike(start + 0.701)).toBeNull();
  });

  it('produces exactly one ~0.7s strike window per 32s slot (cadence)', () => {
    const stepsPerSlot = 3200; // 0.01s resolution
    for (let slot = 0; slot < 5; slot++) {
      let activeSamples = 0;
      for (let i = 0; i < stepsPerSlot; i++) {
        const t = slot * 32 + (i / stepsPerSlot) * 32;
        if (activeStrike(t)) activeSamples++;
      }
      // 0.7s of 32s at 0.01s resolution is ~70 samples; generous slack
      // absorbs the boundary sample.
      expect(activeSamples).toBeGreaterThan(60);
      expect(activeSamples).toBeLessThan(80);
    }
  });

  it('never produces two disjoint active windows inside one slot', () => {
    for (let slot = 0; slot < 5; slot++) {
      let runs = 0;
      let wasActive = false;
      for (let i = 0; i <= 3200; i++) {
        const t = slot * 32 + (i / 3200) * 32;
        const active = activeStrike(t) !== null;
        if (active && !wasActive) runs++;
        wasActive = active;
      }
      expect(runs).toBeLessThanOrEqual(1);
    }
  });
});

describe('strikeEnvelope', () => {
  it('is all-zero before the strike starts and at/after its 0.70s duration', () => {
    expect(strikeEnvelope(-0.01)).toEqual({ bolt: 0, flash: 0, glow: 0 });
    expect(strikeEnvelope(0.7)).toEqual({ bolt: 0, flash: 0, glow: 0 });
    expect(strikeEnvelope(1)).toEqual({ bolt: 0, flash: 0, glow: 0 });
  });

  it('pre-flicker window [0, 0.08): dim bolt, no flash, half glow', () => {
    expect(strikeEnvelope(0)).toEqual({ bolt: 0.35, flash: 0, glow: 0.5 });
    expect(strikeEnvelope(0.07)).toEqual({ bolt: 0.35, flash: 0, glow: 0.5 });
  });

  it('dark beat window [0.08, 0.14): everything off', () => {
    expect(strikeEnvelope(0.08)).toEqual({ bolt: 0, flash: 0, glow: 0 });
    expect(strikeEnvelope(0.13)).toEqual({ bolt: 0, flash: 0, glow: 0 });
  });

  it('main window [0.14, 0.38): full bolt/glow, flash ramping down from 1', () => {
    expect(strikeEnvelope(0.14)).toEqual({ bolt: 1, flash: 1, glow: 1 });
    const mid = strikeEnvelope(0.26);
    expect(mid.bolt).toBe(1);
    expect(mid.glow).toBe(1);
    expect(mid.flash).toBeCloseTo(1 - (0.26 - 0.14) / 0.24, 10);
  });

  it('flash reaches exactly 0 by 0.38 (boundary continuity)', () => {
    const justBefore = strikeEnvelope(0.38 - 1e-9);
    expect(justBefore.flash).toBeCloseTo(0, 6);
    expect(strikeEnvelope(0.38).flash).toBe(0);
  });

  it('afterglow window [0.38, 0.70): bolt/glow decay together from 1 to 0, no flash', () => {
    expect(strikeEnvelope(0.38)).toEqual({ bolt: 1, flash: 0, glow: 1 });
    const late = strikeEnvelope(0.6);
    const expectedBolt = 1 - (0.6 - 0.38) / 0.32;
    expect(late.bolt).toBeCloseTo(expectedBolt, 10);
    expect(late.glow).toBeCloseTo(expectedBolt, 10);
    expect(late.flash).toBe(0);
  });

  it('boundary continuity at 0.38: bolt is 1 approaching the main→decay transition on both sides', () => {
    const before = strikeEnvelope(0.38 - 1e-6);
    const at = strikeEnvelope(0.38);
    expect(before.bolt).toBeCloseTo(1, 6);
    expect(at.bolt).toBeCloseTo(1, 6);
  });
});

describe('boltSegments', () => {
  it('is deterministic for the same variant', () => {
    expect(boltSegments(1)).toEqual(boltSegments(1));
  });

  it('produces 11 trunk + 3 fork + 11 glow = 25 segments', () => {
    const segs = boltSegments(0);
    expect(segs.filter((s) => s.kind === 'trunk')).toHaveLength(11);
    expect(segs.filter((s) => s.kind === 'fork')).toHaveLength(3);
    expect(segs.filter((s) => s.kind === 'glow')).toHaveLength(11);
    expect(segs).toHaveLength(25);
  });

  it('trunk starts at ref (0, 38)', () => {
    const trunk = boltSegments(1).filter((s) => s.kind === 'trunk');
    expect(trunk[0]!.x).toBe(0);
    expect(trunk[0]!.y).toBe(38);
  });

  it('trunk segments are connected: each starts where the previous segment\'s dy ended', () => {
    const trunk = boltSegments(2).filter((s) => s.kind === 'trunk');
    for (let i = 1; i < trunk.length; i++) {
      const prev = trunk[i - 1]!;
      const cur = trunk[i]!;
      // h = dy + 1, so the previous segment's dy step is h - 1.
      expect(cur.y).toBeCloseTo(prev.y + (prev.h - 1), 6);
    }
  });

  it('the first two trunk segments are the brighter #FFF6C8, the rest #FFE896', () => {
    const trunk = boltSegments(0).filter((s) => s.kind === 'trunk');
    expect(trunk[0]!.color).toBe('#FFF6C8');
    expect(trunk[1]!.color).toBe('#FFF6C8');
    for (let i = 2; i < trunk.length; i++) expect(trunk[i]!.color).toBe('#FFE896');
  });

  it('fork segments start at trunk segment 5\'s origin', () => {
    const segs = boltSegments(1);
    const trunk = segs.filter((s) => s.kind === 'trunk');
    const fork = segs.filter((s) => s.kind === 'fork');
    expect(fork[0]!.x).toBe(trunk[5]!.x);
    expect(fork[0]!.y).toBe(trunk[5]!.y);
  });

  it('glow rects sit one per trunk segment at (x-3, y, 9, dy+1)', () => {
    const segs = boltSegments(1);
    const trunk = segs.filter((s) => s.kind === 'trunk');
    const glow = segs.filter((s) => s.kind === 'glow');
    for (let i = 0; i < trunk.length; i++) {
      expect(glow[i]!.x).toBeCloseTo(trunk[i]!.x - 3, 6);
      expect(glow[i]!.y).toBeCloseTo(trunk[i]!.y, 6);
      expect(glow[i]!.w).toBe(9);
      expect(glow[i]!.h).toBeCloseTo(trunk[i]!.h, 6);
    }
  });

  it('produces different shapes for different variants (not a constant bolt)', () => {
    expect(boltSegments(0)).not.toEqual(boltSegments(1));
    expect(boltSegments(1)).not.toEqual(boltSegments(2));
  });
});

describe('flickerActive', () => {
  it('is deterministic for the same tSec', () => {
    expect(flickerActive(12.3)).toBe(flickerActive(12.3));
  });

  it('matches the seeded flicker window inside a 9s slot', () => {
    const slot9 = 2;
    const start = slot9 * 9 + hash(slot9, 3) * 8.5;
    expect(flickerActive(start - 0.001)).toBe(false);
    expect(flickerActive(start)).toBe(true);
    expect(flickerActive(start + 0.17)).toBe(true);
    // A tiny margin past the exact 0.18s boundary avoids float-cancellation
    // flakiness from reconstructing dt as (start + 0.18) - start.
    expect(flickerActive(start + 0.181)).toBe(false);
  });

  it('suppresses a flicker that would otherwise fire during an active strike', () => {
    // Search for a slot9 whose scheduled flicker instant genuinely collides
    // with some 32s slot's active strike window, to prove suppression isn't
    // a vacuous implication.
    let found = false;
    for (let slot9 = 0; slot9 < 2000 && !found; slot9++) {
      const flickerStart = slot9 * 9 + hash(slot9, 3) * 8.5;
      const t = flickerStart + 0.05; // inside the 0.18s flicker window
      if (activeStrike(t)) {
        found = true;
        expect(flickerActive(t)).toBe(false);
      }
    }
    expect(found).toBe(true);
  });
});
