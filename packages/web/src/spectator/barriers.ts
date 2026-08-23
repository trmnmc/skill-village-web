import { MIN_SEPARATION, hashId, placeInRangeAcrossRows, seatCapacity, type Spot } from '../layout/zones.js';

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
 * placeInRangeAcrossRows, but the scenery pushes back: the range is split
 * into clear segments around the barriers, each id asks for the segment its
 * own hash points at (weighted by segment width, so the wide meadow gets the
 * crowd and a narrow gap gets the stragglers), and the tableau seating runs
 * inside each segment — across every depth row, because spectator villagers
 * never stroll and a cross-row stack would stand covered forever.
 *
 * A segment only holds seatCapacity creatures without overlap, so a villager
 * whose hash segment is full spills to the next segment with a free seat
 * (wrapping). Spill makes a seat depend on who was placed before it, so the
 * seating order is fixed here by code unit — the layout stays a pure
 * function of the *set* of ids, the same stable-geography promise
 * placeCreatures keeps. Adjacent usable segments sit a barrier plus two
 * clearances apart — always more than MIN_SEPARATION — so the promise holds
 * across segment edges too.
 *
 * When every segment is full, or the barriers swallow the whole range, the
 * overflow stands where its hash points and overlaps — a creature on top of
 * another beats a creature going missing, the same call zones.ts makes when
 * a row is over-full.
 */
export function placeAvoiding(ids: readonly string[], range: XSpan, barriers: XSpan[]): Map<string, Spot> {
  const usable = segmentRange(range, barriers, MIN_SEPARATION)
    .map((s) => ({ lo: s.lo + CLEARANCE, hi: s.hi - CLEARANCE }))
    .filter((s) => s.hi - s.lo >= 1);

  if (usable.length === 0) return placeInRangeAcrossRows(ids, range.lo, range.hi);

  const widths = usable.map((s) => s.hi - s.lo);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const capacity = usable.map((s) => seatCapacity(s.lo, s.hi));
  const bySegment: string[][] = usable.map(() => []);
  const seating = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const id of seating) {
    let t = hashId(id) % total;
    let i = 0;
    while (i < widths.length - 1 && t >= widths[i]!) {
      t -= widths[i]!;
      i += 1;
    }
    let chosen = i;
    for (let step = 0; step < usable.length; step++) {
      const probe = (i + step) % usable.length;
      if (bySegment[probe]!.length < capacity[probe]!) {
        chosen = probe;
        break;
      }
    }
    bySegment[chosen]!.push(id);
  }

  const spots = new Map<string, Spot>();
  usable.forEach((segment, i) => {
    for (const [id, spot] of placeInRangeAcrossRows(bySegment[i]!, segment.lo, segment.hi)) {
      spots.set(id, spot);
    }
  });
  return spots;
}
