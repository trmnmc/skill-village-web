import { describe, expect, it } from 'vitest';
import { MIN_SEPARATION } from '../layout/zones.js';
import { placeAvoiding, segmentRange, type XSpan } from './barriers.js';

const CLEAR = MIN_SEPARATION / 2;
const range: XSpan = { lo: 640, hi: 1560 };

describe('segmentRange', () => {
  it('returns the whole range when nothing blocks it', () => {
    expect(segmentRange(range, [], MIN_SEPARATION)).toEqual([range]);
  });

  it('cuts the range around each barrier, in order', () => {
    const segments = segmentRange(range, [{ lo: 888, hi: 1014 }, { lo: 1408, hi: 1534 }], MIN_SEPARATION);
    expect(segments).toEqual([
      { lo: 640, hi: 888 },
      { lo: 1014, hi: 1408 },
    ]);
    // The sliver right of the second barrier (1534..1560) is narrower than
    // MIN_SEPARATION and is dropped rather than seating a creature half-off it.
  });

  it('ignores barriers entirely outside the range and clips ones that straddle it', () => {
    const segments = segmentRange(range, [{ lo: 0, hi: 100 }, { lo: 598, hi: 662 }], MIN_SEPARATION);
    expect(segments).toEqual([{ lo: 662, hi: 1560 }]);
  });

  it('handles unsorted, overlapping barriers', () => {
    const segments = segmentRange(range, [{ lo: 1000, hi: 1200 }, { lo: 900, hi: 1100 }], MIN_SEPARATION);
    expect(segments).toEqual([
      { lo: 640, hi: 900 },
      { lo: 1200, hi: 1560 },
    ]);
  });
});

describe('placeAvoiding', () => {
  const barriers: XSpan[] = [
    { lo: 888, hi: 1014 },
    { lo: 1408, hi: 1534 },
  ];
  const ids = ['swarm:a', 'swarm:b', 'swarm:c', 'swarm:d', 'swarm:e', 'swarm:f',
    'swarm:g', 'swarm:h', 'swarm:i', 'swarm:j', 'swarm:k', 'swarm:l'];

  it('places every id exactly once, inside the range', () => {
    const spots = placeAvoiding(ids, range, barriers);
    expect([...spots.keys()].sort()).toEqual([...ids].sort());
    for (const spot of spots.values()) {
      expect(spot.x).toBeGreaterThanOrEqual(range.lo);
      expect(spot.x).toBeLessThanOrEqual(range.hi);
    }
  });

  it('never seats a creature overlapping a barrier footprint', () => {
    const spots = placeAvoiding(ids, range, barriers);
    for (const spot of spots.values()) {
      for (const b of barriers) {
        const clearOfBarrier = spot.x <= b.lo - CLEAR || spot.x >= b.hi + CLEAR;
        expect(clearOfBarrier).toBe(true);
      }
    }
  });

  it('is deterministic: same ids, same village', () => {
    expect(placeAvoiding(ids, range, barriers)).toEqual(placeAvoiding(ids, range, barriers));
  });

  it('spreads a crowd across more than one clear segment', () => {
    const spots = placeAvoiding(ids, range, barriers);
    const left = [...spots.values()].filter((s) => s.x < 888).length;
    const right = [...spots.values()].filter((s) => s.x > 1014).length;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it('falls back to the whole range when barriers cover everything — overlap beats going missing', () => {
    const spots = placeAvoiding(ids, range, [{ lo: 0, hi: 5000 }]);
    expect(spots.size).toBe(ids.length);
    for (const spot of spots.values()) {
      expect(spot.x).toBeGreaterThanOrEqual(range.lo);
      expect(spot.x).toBeLessThanOrEqual(range.hi);
    }
  });
});
