import { MIN_SEPARATION, hashId, placeInRange, type Spot } from '../layout/zones.js';

/** A horizontal footprint in world pixels, `lo` inclusive to `hi` exclusive-ish. */
export interface XSpan {
  lo: number;
  hi: number;
}

/**
 * Subtract barrier footprints from a range, keeping the clear gaps between
 * them. Gaps narrower than `minWidth` are dropped — a sliver that cannot hold
 * a whole creature would seat one half-inside the scenery it exists to avoid.
 */
export function segmentRange(range: XSpan, barriers: XSpan[], minWidth: number): XSpan[] {
  const cuts = barriers
    .map((b) => ({ lo: Math.max(b.lo, range.lo), hi: Math.min(b.hi, range.hi) }))
    .filter((b) => b.hi > b.lo)
    .sort((a, b) => a.lo - b.lo);

  const segments: XSpan[] = [];
  let cursor = range.lo;
  for (const cut of cuts) {
    if (cut.lo - cursor >= minWidth) segments.push({ lo: cursor, hi: cut.lo });
    cursor = Math.max(cursor, cut.hi);
  }
  if (range.hi - cursor >= minWidth) segments.push({ lo: cursor, hi: range.hi });
  return segments;
}

/** Half a creature of clearance, so a seat at a segment edge still clears the scenery. */
const CLEARANCE = MIN_SEPARATION / 2;

/**
 * placeInRange, but the scenery pushes back: the range is split into clear
 * segments around the barriers, each id is assigned a segment by its own hash
 * (weighted by segment width, so the wide meadow gets the crowd and a narrow
 * gap gets the stragglers), and the game's own seating runs inside each
 * segment. Deterministic like everything else: the same villagers always
 * produce the same village.
 *
 * If the barriers swallow the whole range, seating falls back to the plain
 * range — a creature overlapping a house beats a creature going missing,
 * the same call zones.ts makes when a row is over-full.
 */
export function placeAvoiding(ids: readonly string[], range: XSpan, barriers: XSpan[]): Map<string, Spot> {
  const usable = segmentRange(range, barriers, MIN_SEPARATION)
    .map((s) => ({ lo: s.lo + CLEARANCE, hi: s.hi - CLEARANCE }))
    .filter((s) => s.hi - s.lo >= 1);

  if (usable.length === 0) return placeInRange(ids, range.lo, range.hi);

  const widths = usable.map((s) => s.hi - s.lo);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const bySegment: string[][] = usable.map(() => []);
  for (const id of ids) {
    let t = hashId(id) % total;
    let i = 0;
    while (i < widths.length - 1 && t >= widths[i]!) {
      t -= widths[i]!;
      i += 1;
    }
    bySegment[i]!.push(id);
  }

  const spots = new Map<string, Spot>();
  usable.forEach((segment, i) => {
    for (const [id, spot] of placeInRange(bySegment[i]!, segment.lo, segment.hi)) {
      spots.set(id, spot);
    }
  });
  return spots;
}
