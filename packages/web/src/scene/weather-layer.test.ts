import { describe, it, expect } from 'vitest';
import { frac, rainDrop, snowFlake, fx, fy, mapX, mapY, rainbowBlocks, overcastCloudSpecs, fairCloudSpecs, CLOUD_LAYERS } from './weather-layer.js';
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

describe('CLOUD_LAYERS', () => {
  it('orders three depth layers far to near: parallax, drift, and alpha all rise together', () => {
    expect(CLOUD_LAYERS).toHaveLength(3);
    for (let i = 1; i < CLOUD_LAYERS.length; i++) {
      expect(CLOUD_LAYERS[i]!.parallax).toBeGreaterThan(CLOUD_LAYERS[i - 1]!.parallax);
      expect(CLOUD_LAYERS[i]!.speed).toBeGreaterThan(CLOUD_LAYERS[i - 1]!.speed);
      expect(CLOUD_LAYERS[i]!.alpha).toBeGreaterThan(CLOUD_LAYERS[i - 1]!.alpha);
    }
  });
});

describe('overcastCloudSpecs', () => {
  it('is deterministic: the same (kind, night, t, camRefX, width, horizonY) always produces the same blobs', () => {
    expect(overcastCloudSpecs('cloudy', false, 3.2, 120, 800, 180)).toEqual(overcastCloudSpecs('cloudy', false, 3.2, 120, 800, 180));
  });

  it('returns 8 rects: the reference\'s 4 clusters, the two big ones grown a belly strip', () => {
    expect(overcastCloudSpecs('cloudy', false, 0, 0, 480, 182)).toHaveLength(8);
  });

  it('keeps the reference tone per kind as the body colour (far clusters are single body rects)', () => {
    const toneOf = (kind: 'cloudy' | 'rain' | 'snow' | 'fog') => overcastCloudSpecs(kind, false, 0, 0, 480, 182)[0]!.color;
    expect(toneOf('cloudy')).toBe('#B4BABE');
    expect(toneOf('rain')).toBe('#9AA6AE');
    expect(toneOf('snow')).toBe('#C8D0D6');
    expect(toneOf('fog')).toBe('#CFCCC0');
  });

  it('shades each near cluster in three tones: a lit cap, the body, a darker belly', () => {
    const colours = new Set(overcastCloudSpecs('cloudy', false, 0, 0, 480, 182).map((b) => b.color));
    expect(colours.size).toBe(3);
    expect(colours.has(mix('#B4BABE', '#FFFFFF', 0.3))).toBe(true);
    expect(colours.has(mix('#B4BABE', '#1A2028', 0.28))).toBe(true);
  });

  it('mixes every tone 50% toward #1A2028 at night, extending the reference\'s body rule to the caps and bellies', () => {
    const day = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182);
    const night = overcastCloudSpecs('cloudy', true, 0, 0, 480, 182);
    for (let i = 0; i < day.length; i++) {
      expect(night[i]!.color).toBe(mix(day[i]!.color, '#1A2028', 0.5));
    }
  });

  it('dims the far layer: near-cluster rects keep the reference 0.85, far ones sit below it', () => {
    const blobs = overcastCloudSpecs('rain', false, 5, 0, 480, 182);
    const alphas = new Set(blobs.map((b) => b.alpha));
    expect(Math.max(...alphas)).toBeCloseTo(0.85, 6);
    expect(Math.min(...alphas)).toBeLessThan(0.85);
    for (const b of blobs) expect(b.alpha).toBeGreaterThan(0);
  });

  it('parallaxes by depth: a camera pan shifts near clusters further than far ones', () => {
    // Shifts are measured modulo the 560 ref-px drift period — a pan can
    // carry a cloud across the wrap boundary, which reads as re-entering
    // from the other side, not as a huge shift.
    const period = mapX(560, 480);
    const shift = (a: number, b: number) => {
      const d = Math.abs(a - b);
      return Math.min(d, period - d);
    };
    const still = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182);
    const panned = overcastCloudSpecs('cloudy', false, 0, 400, 480, 182);
    const farShift = shift(panned[0]!.x, still[0]!.x); // far cluster body
    const nearShift = shift(panned[2]!.x, still[2]!.x); // near cluster body
    expect(farShift).toBeCloseTo(mapX(400 * CLOUD_LAYERS[0]!.parallax, 480), 4);
    expect(nearShift).toBeCloseTo(mapX(400 * CLOUD_LAYERS[2]!.parallax, 480), 4);
    expect(nearShift).toBeGreaterThan(farShift);
  });

  it('drifts the near layer faster than the far layer', () => {
    const a = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182);
    const b = overcastCloudSpecs('cloudy', false, 30, 0, 480, 182);
    // Anchors drift leftward, wrapping over 560 ref px; 30s is far below any
    // wrap for either layer speed, so raw deltas compare cleanly.
    const farDelta = Math.abs(b[0]!.x - a[0]!.x);
    const nearDelta = Math.abs(b[2]!.x - a[2]!.x);
    expect(nearDelta).toBeGreaterThan(farDelta);
  });

  it('never produces a NaN or unbounded x once tSec outgrows the wrap period many times over', () => {
    for (const b of overcastCloudSpecs('cloudy', false, 100_000, 3000, 480, 182)) {
      expect(Number.isFinite(b.x)).toBe(true);
    }
  });

  it('billows: rect sizes breathe slowly around their authored dimensions', () => {
    const at = (t: number) => overcastCloudSpecs('cloudy', false, t, 0, 480, 182)[2]!;
    const widths = [0, 7, 14, 21, 28].map((t) => at(t).w);
    expect(new Set(widths).size).toBeGreaterThan(1); // it moves
    for (const w of widths) {
      expect(w).toBeGreaterThan(96 * 0.85); // this near cluster's body is 96 ref px wide
      expect(w).toBeLessThan(96 * 1.15); // ...and billow stays a breath, not a morph
    }
    // One frame at 60fps changes the width imperceptibly — billow never jitters.
    expect(Math.abs(at(10 + 1 / 60).w - at(10).w)).toBeLessThan(0.1);
  });

  it('scales intra-cluster offsets and sizes by fy(horizonY) on both axes (class-2 cluster)', () => {
    const base = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182); // fy(182) = 1
    const doubled = overcastCloudSpecs('cloudy', false, 0, 0, 480, 364); // fy(364) = 2
    // Index 2 is the first near cluster's body, index 3 its lit cap. Every
    // intra-cluster distance — authored dx plus the billow sway — doubles
    // exactly when fy doubles, as do the rect sizes.
    const baseOffset = base[3]!.x - base[2]!.x;
    const doubledOffset = doubled[3]!.x - doubled[2]!.x;
    expect(doubledOffset).toBeCloseTo(baseOffset * 2, 6);
    expect(doubled[2]!.w).toBeCloseTo(base[2]!.w * 2, 6);
    expect(doubled[2]!.h).toBeCloseTo(base[2]!.h * 2, 6);
  });
});

describe('fairCloudSpecs', () => {
  it('is deterministic: the same (phase, t, camRefX, width, horizonY, overcastRamp) always produces the same blobs', () => {
    expect(fairCloudSpecs('day', 3.2, 120, 800, 180, 0)).toEqual(fairCloudSpecs('day', 3.2, 120, 800, 180, 0));
  });

  it('fills the sky in full day: every layer, day-only clusters included', () => {
    expect(fairCloudSpecs('day', 0, 0, 480, 182, 0)).toHaveLength(12);
  });

  it('withholds the day-only cluster outside full day', () => {
    const dayCount = fairCloudSpecs('day', 0, 0, 480, 182, 0).length;
    for (const phase of ['dawn', 'dusk', 'night'] as const) {
      const count = fairCloudSpecs(phase, 0, 0, 480, 182, 0).length;
      expect(count).toBeGreaterThan(0); // ambient: the sky is never cloudless
      expect(count).toBeLessThan(dayCount);
    }
  });

  it('tones follow the phase: white by day, warm at dawn, ember at dusk, moonlit slate at night', () => {
    const bodyOf = (phase: 'dawn' | 'day' | 'dusk' | 'night') =>
      new Set(fairCloudSpecs(phase, 0, 0, 480, 182, 0).map((b) => b.color));
    expect(bodyOf('day').has('#FFFFFF')).toBe(true);
    expect(bodyOf('dawn').has('#FFF3E0')).toBe(true);
    expect(bodyOf('dusk').has('#E2C9B4')).toBe(true);
    expect(bodyOf('night').has('#37414D')).toBe(true);
  });

  it('shades each cluster in more than one tone — lit cap over body reads as mass, not a flat stamp', () => {
    expect(new Set(fairCloudSpecs('day', 0, 0, 480, 182, 0).map((b) => b.color)).size).toBeGreaterThanOrEqual(3);
  });

  it('is quieter at night than by day: lower peak alpha, never zero', () => {
    const peak = (phase: 'day' | 'night') =>
      Math.max(...fairCloudSpecs(phase, 9, 0, 480, 182, 0).map((b) => b.alpha));
    expect(peak('night')).toBeGreaterThan(0);
    expect(peak('night')).toBeLessThan(peak('day'));
  });

  it('crossfades out linearly as overcastRamp rises: half alpha at 0.5, gone at 1', () => {
    const at = (ramp: number) => fairCloudSpecs('day', 9, 0, 480, 182, ramp);
    const full = at(0);
    const half = at(0.5);
    for (let i = 0; i < full.length; i++) expect(half[i]!.alpha).toBeCloseTo(full[i]!.alpha / 2, 10);
    for (const b of at(1)) expect(b.alpha).toBe(0);
  });

  it('parallaxes by depth: a camera pan shifts near clusters further than far ones', () => {
    const still = fairCloudSpecs('day', 0, 0, 480, 182, 0);
    const panned = fairCloudSpecs('day', 0, 400, 480, 182, 0);
    const shifts = still.map((b, i) => Math.abs(panned[i]!.x - b.x));
    // Far clusters lead the sorted output, near ones close it.
    expect(shifts.at(-1)!).toBeGreaterThan(shifts[0]!);
  });

  it('never produces a NaN or unbounded x at large tSec and camRefX', () => {
    for (const b of fairCloudSpecs('day', 100_000, 5000, 480, 182, 0)) {
      expect(Number.isFinite(b.x)).toBe(true);
    }
  });

  it('billows: sizes breathe slowly and stay near their authored dimensions', () => {
    const widths = [0, 9, 18, 27].map((t) => fairCloudSpecs('day', t, 0, 480, 182, 0).at(-3)!.w);
    expect(new Set(widths).size).toBeGreaterThan(1);
    for (const w of widths) {
      expect(w).toBeGreaterThan(40 * 0.85); // the near cluster's 40 ref-px body
      expect(w).toBeLessThan(40 * 1.15);
    }
  });
});
