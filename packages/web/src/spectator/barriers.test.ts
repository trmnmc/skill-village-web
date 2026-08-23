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

  it('keeps MIN_SEPARATION between every pair, whatever their depth rows', () => {
    // The 2026-08-23 playtest finding: separation used to hold only within a
    // depth row, and rows sit 46px apart while bodies are ~128px tall — two
    // villagers in different rows at near-equal x covered each other. The
    // spectator tableau is static, so a stack never walks itself apart.
    // Six villagers, two clear segments: hash luck must never stack them.
    const six = ids.slice(0, 6);
    const xs = [...placeAvoiding(six, range, barriers).values()]
      .map((s) => s.x)
      .sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('spills a crowd out of a full segment instead of stacking it', () => {
    // Segment capacity is finite; when an id's hash-preferred segment is
    // full, the villager takes the next segment with a free seat. Up to the
    // total capacity of all segments, nobody may ever overlap anybody.
    const usable = segmentRange(range, barriers, MIN_SEPARATION)
      .map((s) => ({ lo: s.lo + CLEAR, hi: s.hi - CLEAR }));
    const capacity = usable
      .map((s) => Math.floor((s.hi - s.lo) / MIN_SEPARATION) + 1)
      .reduce((sum, c) => sum + c, 0);
    const crowd = Array.from({ length: capacity }, (_, i) => `swarm:crowd${i}`);
    const xs = [...placeAvoiding(crowd, range, barriers).values()]
      .map((s) => s.x)
      .sort((a, b) => a - b);
    expect(xs).toHaveLength(capacity);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('depends on the set of villagers, not the order they are handed over', () => {
    // Spill means a seat depends on who was placed before it, so the seating
    // order is fixed inside placeAvoiding — same stable-geography promise as
    // placeCreatures, or a re-sorted feed would rearrange the meadow.
    const shuffled = [...ids].reverse();
    expect([...placeAvoiding(shuffled, range, barriers)].sort()).toEqual(
      [...placeAvoiding(ids, range, barriers)].sort(),
    );
  });

  it('never stacks the live six-project roster (playtest regression, 2026-08-23)', () => {
    // The real commons and scenery the day the finding landed: Moon seated at
    // x=1256 and Homeforge at x=1263, seven pixels apart in neighbouring
    // rows — one creature completely behind the other. Constants copied, not
    // imported: if scene.ts's layout drifts this still guards the algorithm.
    const commons: XSpan = { lo: 640, hi: 1700 };
    const scenery: XSpan[] = [
      { lo: 598, hi: 662 },
      { lo: 888, hi: 1006 },
      { lo: 1148, hi: 1212 },
      { lo: 1408, hi: 1526 },
      { lo: 1688, hi: 1752 },
    ];
    const roster = [
      'swarm:aphorism-cli', 'swarm:homeforge', 'swarm:moon',
      'swarm:prompt-spark', 'swarm:prompt-spark-northstar', 'swarm:repo-atlas',
    ];
    const spots = placeAvoiding(roster, commons, scenery);
    expect(spots.size).toBe(roster.length);
    const xs = [...spots.values()].map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });
});
