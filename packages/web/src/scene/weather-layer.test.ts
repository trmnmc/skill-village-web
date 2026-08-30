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
  cloudSuppression,
  overcastCloudSpecs,
  fairCloudSpecs,
  CLOUD_LAYERS,
  OVERCAST_CLOUD_CLUSTERS,
  FAIR_CLOUD_CLUSTERS,
  STORM_CLOUD_CLUSTERS,
  strikeOrigin,
  driftedClusterRects,
  CLOUD_DRIFT_PERIOD,
  CLOUD_MAX_EXTENT,
  CLOUD_DRIFT_LEFT_MARGIN,
  BILLOW_CEILING,
  hash,
  strikeParams,
  activeStrike,
  strikeEnvelope,
  boltSegments,
  flickerActive,
} from './weather-layer.js';
import { mix, contrast, PALETTES } from '../theme/palettes.js';
import { graySkies } from '../theme/weather/kinds.js';
import { stormLayerTones } from './weather-layer.js';

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

  it('overlaps blocks along each band so the arc reads solid, never dotted', () => {
    const blocks = rainbowBlocks(800, 180);
    for (let band = 0; band < 5; band++) {
      const bandBlocks = blocks.filter((b) => b.band === band);
      for (let i = 1; i < bandBlocks.length; i++) {
        const gap = Math.hypot(
          bandBlocks[i]!.x - bandBlocks[i - 1]!.x,
          bandBlocks[i]!.y - bandBlocks[i - 1]!.y,
        );
        // Strictly inside one block: consecutive squares always overlap.
        expect(gap).toBeLessThan(bandBlocks[i]!.size * 0.95);
      }
    }
  });

  it('stacks the five bands edge to edge, so there is no sky showing between them', () => {
    const blocks = rainbowBlocks(800, 180);
    // Radius of each band, measured from the arc's apex block (the highest y).
    const apex = (band: number) =>
      blocks.filter((b) => b.band === band).reduce((lo, b) => (b.y < lo.y ? b : lo));
    for (let band = 1; band < 5; band++) {
      const step = apex(band).y - apex(band - 1).y;
      // Each inner band sits one block-width below the one outside it. The
      // apex is whichever sample landed nearest the top, not the exact top,
      // so this is within a few percent rather than exact.
      expect(step).toBeGreaterThan(apex(band).size * 0.9);
      expect(step).toBeLessThan(apex(band).size * 1.1);
    }
  });

  it('never paints below the horizon — the arc meets the ground line and stops', () => {
    for (const horizonY of [120, 180, 511]) {
      for (const b of rainbowBlocks(1600, horizonY)) {
        expect(b.y + b.size).toBeLessThanOrEqual(horizonY + 1e-9);
      }
    }
  });

  it('is huge: the bow spans multiples of the sky\'s height, the way a real one dwarfs the landscape', () => {
    const horizonY = 500;
    const blocks = rainbowBlocks(1600, horizonY);
    const xs = blocks.map((b) => b.x);
    const span = Math.max(...xs) - Math.min(...xs);
    // Feet far apart — well over twice the sky is tall, not a small hoop.
    expect(span).toBeGreaterThan(horizonY * 2);
  });

  it('rises most of the way up the sky, leaving only a margin above the apex', () => {
    const horizonY = 500;
    const apexY = Math.min(...rainbowBlocks(1600, horizonY).map((b) => b.y));
    expect(apexY).toBeLessThan(horizonY * 0.25);
    expect(apexY).toBeGreaterThanOrEqual(0);
  });

  it('is a shallow cap of a much larger circle, so its curve is gentle rather than hoop-like', () => {
    const horizonY = 500;
    const blocks = rainbowBlocks(1600, horizonY);
    const span = Math.max(...blocks.map((b) => b.x)) - Math.min(...blocks.map((b) => b.x));
    const rise = horizonY - Math.min(...blocks.map((b) => b.y));
    // A semicircle would have span == 2*rise; a big distant bow is far wider
    // than it is tall.
    expect(span / rise).toBeGreaterThan(2.4);
  });

  it('flattens as the sun climbs: a higher sun drops the antisolar centre and widens the bow', () => {
    const spanAt = (sunY01: number) => {
      const xs = rainbowBlocks(1600, 500, 0.5, sunY01).map((b) => b.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spanAt(1)).toBeGreaterThan(spanAt(0));
  });

  it('keeps the bands a slender ribbon, not a fat painted hoop', () => {
    const blocks = rainbowBlocks(1600, 500);
    const thickness = blocks[0]!.size * 5;
    const rise = 500 - Math.min(...blocks.map((b) => b.y));
    expect(thickness / rise).toBeLessThan(0.2);
  });

  it('stays centred horizontally whatever the viewport width', () => {
    for (const width of [800, 1600, 2400]) {
      const xs = rainbowBlocks(width, 400).map((b) => b.x);
      // Within a pixel: the outermost samples sit a fraction of a step either
      // side of the exact feet, so the midpoint is symmetric but not to 1e-6.
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - width / 2)).toBeLessThan(1);
    }
  });
});

describe('cloudSuppression', () => {
  it('leaves the fair-weather clouds alone on kinds that should keep a cloudy sky', () => {
    for (const kind of ['clear', 'wind', 'leaves'] as const) {
      expect(cloudSuppression(kind, 1)).toBe(0);
    }
  });

  it('empties the sky for the heat haze, the one kind that wants a bare glare', () => {
    expect(cloudSuppression('heat', 1)).toBe(1);
  });

  it('keeps clouds behind a rainbow - a bow only ever appears with rain about', () => {
    expect(cloudSuppression('rainbow', 1)).toBe(0);
  });

  it('still hands the overcast kinds over to their own blob decks', () => {
    for (const kind of ['rain', 'storm', 'snow', 'fog', 'cloudy'] as const) {
      expect(cloudSuppression(kind, 1)).toBe(1);
    }
  });

  it('follows the ramp rather than snapping, so a journey transition crossfades', () => {
    expect(cloudSuppression('heat', 0.5)).toBe(0.5);
    expect(cloudSuppression('rain', 0.25)).toBe(0.25);
    expect(cloudSuppression('clear', 0.5)).toBe(0);
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

  it('materializes every rect of the four puff clusters', () => {
    const perCluster = OVERCAST_CLOUD_CLUSTERS.map((c) => c.rects.length);
    expect(overcastCloudSpecs('cloudy', false, 0, 0, 480, 182)).toHaveLength(
      perCluster.reduce((a, b) => a + b, 0),
    );
  });

  it('keeps the reference tone per kind as the body colour (rect 0 is each cluster\'s body slab)', () => {
    const toneOf = (kind: 'cloudy' | 'rain' | 'snow' | 'fog') => overcastCloudSpecs(kind, false, 0, 0, 480, 182)[0]!.color;
    expect(toneOf('cloudy')).toBe('#B4BABE');
    expect(toneOf('rain')).toBe('#9AA6AE');
    expect(toneOf('snow')).toBe('#C8D0D6');
    expect(toneOf('fog')).toBe('#CFCCC0');
  });

  it('shades each cluster in three gentle tones: a lit cap, the body, a darker belly', () => {
    const colours = new Set(overcastCloudSpecs('cloudy', false, 0, 0, 480, 182).map((b) => b.color));
    expect(colours.size).toBe(3);
    // 0.16/0.15 mixes — soft steps, down from the reference's 0.3/0.28
    // after the playtest called the old jumps "gradients too extreme".
    expect(colours.has(mix('#B4BABE', '#FFFFFF', 0.16))).toBe(true);
    expect(colours.has(mix('#B4BABE', '#1A2028', 0.15))).toBe(true);
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
    // Shifts are measured modulo the 700 ref-px drift period — a pan can
    // carry a cloud across the wrap boundary, which reads as re-entering
    // from the other side, not as a huge shift.
    const period = mapX(CLOUD_DRIFT_PERIOD, 480);
    const shift = (a: number, b: number) => {
      const d = Math.abs(a - b);
      return Math.min(d, period - d);
    };
    const still = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182);
    const panned = overcastCloudSpecs('cloudy', false, 0, 400, 480, 182);
    // Output is far-layer-first; the near block starts after every far rect.
    const nearStart = OVERCAST_CLOUD_CLUSTERS.filter((c) => c.layer === 0)
      .reduce((n, c) => n + c.rects.length, 0);
    const farShift = shift(panned[0]!.x, still[0]!.x); // far cluster body slab
    const nearShift = shift(panned[nearStart]!.x, still[nearStart]!.x); // near cluster body slab
    expect(farShift).toBeCloseTo(mapX(400 * CLOUD_LAYERS[0]!.parallax, 480), 4);
    expect(nearShift).toBeCloseTo(mapX(400 * CLOUD_LAYERS[2]!.parallax, 480), 4);
    expect(nearShift).toBeGreaterThan(farShift);
  });

  it('drifts the near layer faster than the far layer', () => {
    const a = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182);
    const b = overcastCloudSpecs('cloudy', false, 30, 0, 480, 182);
    // Anchors drift leftward; 30s is far below any wrap for either layer
    // speed, so raw deltas compare cleanly. Index into the first NEAR-layer
    // rect properly: `b[2]` was a near rect back when a cluster was two slab
    // rects, but a puffRects dome is ~9 rects, so index 2 still sat inside
    // the first far cluster and the assertion passed only on per-rect billow
    // noise — noise the one-body billow has since removed.
    const nearStart = OVERCAST_CLOUD_CLUSTERS.filter((c) => c.layer === 0)
      .reduce((n, c) => n + c.rects.length, 0);
    const farDelta = Math.abs(b[0]!.x - a[0]!.x);
    const nearDelta = Math.abs(b[nearStart]!.x - a[nearStart]!.x);
    expect(nearDelta).toBeGreaterThan(farDelta);
  });

  it('never produces a NaN or unbounded x once tSec outgrows the wrap period many times over', () => {
    for (const b of overcastCloudSpecs('cloudy', false, 100_000, 3000, 480, 182)) {
      expect(Number.isFinite(b.x)).toBe(true);
    }
  });

  it('billows upward: the authored size is the floor, and clouds swell well past it', () => {
    const far = OVERCAST_CLOUD_CLUSTERS.filter((c) => c.layer === 0);
    const nearStart = far.reduce((n, c) => n + c.rects.length, 0);
    const floor = OVERCAST_CLOUD_CLUSTERS.find((c) => c.layer === 2)!.rects[0]!.w;
    const at = (t: number) => overcastCloudSpecs('cloudy', false, t, 0, 480, 182)[nearStart]!;
    const widths = Array.from({ length: 40 }, (_, i) => at(i * 2.7).w);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(floor * 0.999); // never smaller than authored
      expect(w).toBeLessThan(floor * BILLOW_CEILING * 1.02); // ...and swelling stays a swell, not a bloom
    }
    // "Bigger sometimes" is real: the swell visits well above the floor.
    expect(Math.max(...widths)).toBeGreaterThan(floor * 1.2);
    // One frame at 60fps changes the width imperceptibly — billow never jitters.
    expect(Math.abs(at(10 + 1 / 60).w - at(10).w)).toBeLessThan(0.2);
  });

  it('a cluster billows as ONE body: every rect swells by the same factor and sealed steps stay sealed', () => {
    // The owner's 2026-08-30 verdict on the night storm: "uneven stacked and
    // overlapped rectangles". Per-rect billow seeds were the cause — ten
    // rects of one authored dome swelling and swaying out of sync shred the
    // silhouette. A cumulus is one mass: it swells together or not at all.
    const near = OVERCAST_CLOUD_CLUSTERS.filter((c) => c.layer === 2).at(-1)!;
    const n = near.rects.length;
    const at = (t: number) => overcastCloudSpecs('cloudy', false, t, 0, 480, 182).slice(-n);
    const ref = at(0);
    for (const t of [3.7, 11.9, 47.3, 200.1]) {
      const now = at(t);
      const grow = now[0]!.w / ref[0]!.w;
      for (let i = 1; i < n; i++) {
        expect(now[i]!.w / ref[i]!.w, `rect ${i} at t=${t}`).toBeCloseTo(grow, 6);
      }
      // Steps authored edge to edge stay edge to edge mid-swell: no sky
      // opening between a dome's steps, no step sliding over its neighbour.
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (near.rects[j]!.y + near.rects[j]!.h !== near.rects[i]!.y) continue;
          expect(now[j]!.y + now[j]!.h, `seal ${j}->${i} at t=${t}`).toBeCloseTo(now[i]!.y, 4);
        }
      }
    }
  });

  it('scales intra-cluster offsets and sizes by fy(horizonY) on both axes (class-2 cluster)', () => {
    const base = overcastCloudSpecs('cloudy', false, 0, 0, 480, 182); // fy(182) = 1
    const doubled = overcastCloudSpecs('cloudy', false, 0, 0, 480, 364); // fy(364) = 2
    // The near block's slab and its first lobe step: every intra-cluster
    // distance — authored dx plus the billow sway — doubles exactly when fy
    // doubles, as do the rect sizes.
    const nearStart = OVERCAST_CLOUD_CLUSTERS.filter((c) => c.layer === 0)
      .reduce((n, c) => n + c.rects.length, 0);
    const baseOffset = base[nearStart + 1]!.x - base[nearStart]!.x;
    const doubledOffset = doubled[nearStart + 1]!.x - doubled[nearStart]!.x;
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
    const total = FAIR_CLOUD_CLUSTERS.reduce((n, c) => n + c.rects.length, 0);
    expect(fairCloudSpecs('day', 0, 0, 480, 182, 0)).toHaveLength(total);
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

  it('billows upward from the authored floor, never below it', () => {
    // The near cluster draws last; its body slab leads its block.
    const near = FAIR_CLOUD_CLUSTERS.find((c) => c.layer === 2)!;
    const floor = near.rects[0]!.w;
    const widths = Array.from({ length: 40 }, (_, i) =>
      fairCloudSpecs('day', i * 2.7, 0, 480, 182, 0).at(-near.rects.length)!.w,
    );
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(floor * 0.999); // the near cluster's own slab
      expect(w).toBeLessThan(floor * BILLOW_CEILING * 1.02);
    }
    expect(Math.max(...widths)).toBeGreaterThan(floor * 1.2);
  });
});

describe('cloud geometry tables (puff invariants)', () => {
  // The reference's verbatim slab geometry (village-scene.js lines 300–308)
  // was retired after the first human storm playtest — flat 15%-height slabs
  // read as shelves, not clouds. Every cluster is now generated through
  // `puffRects`, so instead of pinning literals these pin the invariants the
  // generator must keep: a flat belly base, lit caps above the body mass,
  // cumulus proportions, and extents inside the drift window's seam margin.

  const ALL_CLUSTERS = [...OVERCAST_CLOUD_CLUSTERS, ...FAIR_CLOUD_CLUSTERS, ...STORM_CLOUD_CLUSTERS];

  it('every cluster carries all three tone roles', () => {
    for (const c of ALL_CLUSTERS) {
      const tones = new Set(c.rects.map((r) => r.tone));
      expect(tones.has('body')).toBe(true);
      expect(tones.has('lit')).toBe(true);
      expect(tones.has('belly')).toBe(true);
    }
  });

  it('rect 0 is the body slab — spec builders key a cluster\'s kind tone off it', () => {
    for (const c of ALL_CLUSTERS) expect(c.rects[0]!.tone).toBe('body');
  });

  it('the belly base is the lowest rect and every lit cap sits above the slab top', () => {
    for (const c of ALL_CLUSTERS) {
      const slab = c.rects[0]!;
      const bottoms = c.rects.map((r) => r.y + r.h);
      const belly = c.rects.filter((r) => r.tone === 'belly');
      expect(Math.max(...belly.map((r) => r.y + r.h))).toBe(Math.max(...bottoms));
      for (const cap of c.rects.filter((r) => r.tone === 'lit')) {
        expect(cap.y + cap.h).toBeLessThanOrEqual(slab.y);
      }
    }
  });

  it('reads as cumulus, not contrail: total height at least 30% of width', () => {
    for (const c of ALL_CLUSTERS) {
      const top = Math.min(...c.rects.map((r) => r.y));
      const bottom = Math.max(...c.rects.map((r) => r.y + r.h));
      const width = Math.max(...c.rects.map((r) => r.dx + r.w));
      expect((bottom - top) / width).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('stays inside the drift window seam margin: no authored extent past CLOUD_MAX_EXTENT', () => {
    for (const c of ALL_CLUSTERS) {
      expect(Math.max(...c.rects.map((r) => r.dx + r.w))).toBeLessThanOrEqual(CLOUD_MAX_EXTENT);
    }
  });

  it('the drift window clears a fully billowed cluster on both sides', () => {
    // The seam invariant itself, not just its consequence: a cluster that
    // wraps must be entirely off-screen at both bounds, or a visible cloud
    // teleports across the sky in one frame.
    const sway = 3;
    const maxDrawn = CLOUD_MAX_EXTENT * BILLOW_CEILING + sway;
    expect(CLOUD_DRIFT_LEFT_MARGIN).toBeGreaterThanOrEqual(maxDrawn);
    expect(CLOUD_DRIFT_PERIOD - CLOUD_DRIFT_LEFT_MARGIN).toBeGreaterThanOrEqual(480);
  });

  it('never teleports a visible cluster: at the wrap seam every rect is fully off-screen', () => {
    // The regression this pins: a drift window narrower than a cluster's
    // billowed extent makes part of a still-visible cloud jump across the
    // sky in one frame (the 560/-40 window did exactly that). Sweep a full
    // near-layer wrap at 30fps; any on-screen rect may move only a few px
    // between frames.
    const width = 480;
    const dt = 1 / 30;
    const maxFrameShift = mapX(10, width); // generous: drift+sway move well under 1 ref px/frame
    for (const specsAt of [
      (t: number) => overcastCloudSpecs('cloudy', false, t, 0, width, 182),
      (t: number) => fairCloudSpecs('day', t, 0, width, 182, 0),
    ]) {
      for (let t = 0; t < 150; t += dt) {
        const now = specsAt(t);
        const next = specsAt(t + dt);
        for (let i = 0; i < now.length; i++) {
          const a = now[i]!;
          const visible = a.x + a.w > 0 && a.x < width;
          if (!visible) continue;
          expect(Math.abs(next[i]!.x - a.x)).toBeLessThan(maxFrameShift);
        }
      }
    }
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

describe('strikeOrigin', () => {
  /** The storm's own materialized blobs, as the painter builds them. */
  const blobs = (t = 0, camRefX = 0) =>
    driftedClusterRects(STORM_CLOUD_CLUSTERS, 3, t, camRefX, 480, 182);

  it('is born from a real cloud, not a fixed height in clear air', () => {
    const o = strikeOrigin(blobs(), 0.5, 480, 620, 182);
    expect(o.fromCloud).toBe(true);
    const slabs = blobs().filter((b) => b.slab && b.layerIndex >= 1);
    // The origin is exactly some near/mid slab's bottom-centre.
    expect(
      slabs.some((b) => Math.abs(b.x + b.w / 2 - o.x) < 1e-6 && Math.abs(b.y + b.h - o.y) < 1e-6),
    ).toBe(true);
  });

  it('picks the cloud nearest the slot\'s intended sky position', () => {
    const bs = blobs();
    const slabs = bs.filter((b) => b.slab && b.layerIndex >= 1);
    for (const x01 of [0.15, 0.4, 0.6, 0.85]) {
      const o = strikeOrigin(bs, x01, 480, 620, 182);
      const best = Math.min(...slabs.map((b) => Math.abs(b.x + b.w / 2 - x01 * 480)));
      expect(Math.abs(o.x - x01 * 480)).toBeCloseTo(best, 6);
    }
  });

  it('never draws from the far haze layer — a bolt behind the deck reads as fog', () => {
    const bs = blobs();
    const farSlabs = bs.filter((b) => b.slab && b.layerIndex === 0);
    for (const x01 of [0.15, 0.5, 0.85]) {
      const o = strikeOrigin(bs, x01, 480, 620, 182);
      expect(farSlabs.some((b) => Math.abs(b.y + b.h - o.y) < 1e-6 && Math.abs(b.x + b.w / 2 - o.x) < 1e-6)).toBe(false);
    }
  });

  it('follows its cloud as the sky drifts, rather than sitting at a fixed x', () => {
    const xs = [0, 4, 8, 12].map((t) => strikeOrigin(blobs(t), 0.5, 480, 620, 182).x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  it('falls back to the raw anchor when no candidate cloud is on screen', () => {
    const o = strikeOrigin([], 0.5, 480, 620, 182);
    expect(o.fromCloud).toBe(false);
    expect(o.x).toBeCloseTo(240, 10);
    expect(o.y).toBeCloseTo(mapY(38, 182, 620), 10);
  });
});

describe('activeStrike', () => {
  it('is deterministic: the same tSec always yields the same strike state', () => {
    expect(activeStrike(53.4)).toEqual(activeStrike(53.4));
  });

  it('matches the seeded-scheduler formula exactly inside a strike window', () => {
    const slot = 0;
    const start = slot * 64 + 2 + hash(slot, 0) * 56;
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
    const start = slot * 64 + 2 + hash(slot, 0) * 56;
    expect(activeStrike(start - 0.001)).toBeNull();
    expect(activeStrike(start + 0.6999)).not.toBeNull();
    // A tiny margin past the exact 0.7s boundary avoids float-cancellation
    // flakiness from reconstructing dt as (start + 0.7) - start.
    expect(activeStrike(start + 0.701)).toBeNull();
  });

  it('produces exactly one ~0.7s strike window per 64s slot (cadence)', () => {
    const stepsPerSlot = 6400; // 0.01s resolution
    for (let slot = 0; slot < 5; slot++) {
      let activeSamples = 0;
      for (let i = 0; i < stepsPerSlot; i++) {
        const t = slot * 64 + (i / stepsPerSlot) * 64;
        if (activeStrike(t)) activeSamples++;
      }
      // 0.7s of 64s at 0.01s resolution is ~70 samples; generous slack
      // absorbs the boundary sample.
      expect(activeSamples).toBeGreaterThan(60);
      expect(activeSamples).toBeLessThan(80);
    }
  });

  it('never produces two disjoint active windows inside one slot', () => {
    for (let slot = 0; slot < 5; slot++) {
      let runs = 0;
      let wasActive = false;
      for (let i = 0; i <= 6400; i++) {
        const t = slot * 64 + (i / 6400) * 64;
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

describe('rainbowBlocks — light, not paint', () => {
  it('dissolves toward the legs: the apex is strongest, the feet fade out', () => {
    const blocks = rainbowBlocks(1600, 500).filter((b) => b.band === 2);
    const apex = blocks.reduce((hi, b) => (b.y < hi.y ? b : hi));
    const lowest = blocks.reduce((lo, b) => (b.y > lo.y ? b : lo));
    expect(apex.alpha).toBeGreaterThan(lowest.alpha * 2);
    expect(lowest.alpha).toBeLessThan(0.25);
    for (const b of blocks) expect(b.alpha).toBeGreaterThanOrEqual(0);
  });

  it('softens both edges of the band stack, so it feathers into the sky', () => {
    const apexOf = (band: number) => {
      const inBand = rainbowBlocks(1600, 500).filter((b) => b.band === band);
      return inBand.reduce((hi, b) => (b.y < hi.y ? b : hi));
    };
    const middle = apexOf(2).alpha;
    expect(apexOf(0).alpha).toBeLessThan(middle);
    expect(apexOf(4).alpha).toBeLessThan(middle);
  });

  it('sits opposite the sun, the way a real bow is centred on the antisolar point', () => {
    const centreOf = (sunX01: number) => {
      const xs = rainbowBlocks(1600, 500, sunX01).map((b) => b.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    // Morning sun in the east puts the bow to the west, and vice versa.
    expect(centreOf(0.2)).toBeGreaterThan(centreOf(0.8));
    // A sun straight overhead leaves it centred.
    expect(Math.abs(centreOf(0.5) - 800)).toBeLessThan(1);
  });

  it('keeps the bow on screen even with the sun at the horizon', () => {
    for (const sunX01 of [0, 1]) {
      const xs = rainbowBlocks(1600, 500, sunX01).map((b) => b.x);
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(centre).toBeGreaterThan(1600 * 0.25);
      expect(centre).toBeLessThan(1600 * 0.75);
    }
  });

  it('still never paints below the horizon, whatever the sun is doing', () => {
    for (const sunX01 of [0, 0.35, 0.5, 1]) {
      for (const b of rainbowBlocks(1600, 500, sunX01)) {
        expect(b.y + b.size).toBeLessThanOrEqual(500 + 1e-9);
      }
    }
  });
});

describe('stormLayerTones', () => {
  const ids = Object.keys(PALETTES) as (keyof typeof PALETTES)[];
  const nightStormSky1 = (id: keyof typeof PALETTES) => graySkies(PALETTES[id].skies.night, 'storm', 1, true)[1];
  const dayStormSky1 = (id: keyof typeof PALETTES) => graySkies(PALETTES[id].skies.day, 'storm', 1, false)[1];

  it('near and mid decks read against the night storm sky in every palette', () => {
    // The first night-storm playtest verdict: cloud bodies vanished into the
    // sky, leaving highlight caps floating and rain shafts standing detached.
    for (const id of ids) {
      const sky = nightStormSky1(id);
      const tones = stormLayerTones(true, sky);
      expect(contrast(tones[2]!.body, sky), `${id}: near body ${tones[2]!.body} vs sky ${sky}`).toBeGreaterThanOrEqual(1.3);
      expect(contrast(tones[1]!.body, sky), `${id}: mid body ${tones[1]!.body} vs sky ${sky}`).toBeGreaterThanOrEqual(1.12);
    }
  });

  it('day decks keep their dark-cloud read in every palette', () => {
    for (const id of ids) {
      const sky = dayStormSky1(id);
      const tones = stormLayerTones(false, sky);
      expect(contrast(tones[2]!.body, sky), `${id}: near body vs day sky`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('depth ladder: contrast against the sky falls with distance, day and night', () => {
    for (const id of ids) {
      for (const night of [true, false]) {
        const sky = night ? nightStormSky1(id) : dayStormSky1(id);
        const tones = stormLayerTones(night, sky);
        const ladder = tones.map((t) => contrast(t.body, sky));
        expect(ladder[2]!).toBeGreaterThan(ladder[1]!);
        expect(ladder[1]!).toBeGreaterThan(ladder[0]!);
      }
    }
  });

  it('each tone keeps its internal shading order: lit above body above belly', () => {
    for (const night of [true, false]) {
      const tones = stormLayerTones(night, nightStormSky1('1a'));
      for (const t of tones) {
        expect(contrast(t.lit, '#000000')).toBeGreaterThan(contrast(t.body, '#000000'));
        expect(contrast(t.body, '#000000')).toBeGreaterThan(contrast(t.belly, '#000000'));
      }
    }
  });
});
