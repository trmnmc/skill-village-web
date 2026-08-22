import { BODIES } from '@village/core/visual';
import { U } from '../theme.js';

export type ZoneId = 'hatchery' | 'homes' | 'adoption' | 'notice';

export interface Zone {
  id: ZoneId;
  label: string;
  /** Left edge in world pixels. */
  x: number;
  w: number;
}

/**
 * One wide strip you scroll along. Homes is much the largest because it holds
 * every villager; the other three are scenery until their milestones fill them
 * (adoption M5, hatchery M6, notice board M9).
 */
export const ZONES: readonly Zone[] = Object.freeze([
  { id: 'hatchery', label: 'Hatchery', x: 0, w: 520 },
  { id: 'homes', label: 'Homes', x: 520, w: 2600 },
  { id: 'adoption', label: 'Adoption Center', x: 3120, w: 760 },
  { id: 'notice', label: 'Notice Board', x: 3880, w: 420 },
]);

export const WORLD_W = 4300;
/** Baseline the creatures stand on; depth rows sit just behind it. */
export const GROUND_Y = 620;

const ROWS = 4;
const ROW_DEPTH = 46;
const MARGIN = 90;

/**
 * How far the furthest depth row reaches above the baseline. Row 0 stands on
 * GROUND_Y and every row behind it is one ROW_DEPTH further up the screen.
 */
const DEPTH_REACH = (ROWS - 1) * ROW_DEPTH;

/**
 * Clearance between the furthest row and the horizon. A creature's contact
 * shadow is centred on its feet, so it reaches ~5px above them; the rest is so
 * the back row reads as standing *in* the field rather than balanced on its
 * far edge. 24px looked fine in the arithmetic and airborne on the first real
 * screen — bodies and labels rise ~128px above the feet, so the field behind
 * the back row has to be on that scale, not shadow-scale.
 */
const HORIZON_MARGIN = 120;

/**
 * Top edge of the painted ground: derived from the depth rows, never typed in.
 * The drawn ground has to contain every row, and hardcoding its height is
 * exactly how the far band came to be 40px tall while the rows reached
 * DEPTH_REACH (138px) above the baseline — three quarters of the village
 * standing on sky. Change ROWS or ROW_DEPTH and the horizon follows.
 */
export const GROUND_TOP = GROUND_Y - DEPTH_REACH - HORIZON_MARGIN;

/** The widest body in the catalogue, in screen pixels. `mound` at 12 cells. */
const WIDEST_BODY = Math.max(...Object.values(BODIES).map((b) => b.w)) * U;

/**
 * How far apart two villagers in the same depth row must stand. Two of the
 * widest bodies need WIDEST_BODY between their centres just to stop touching,
 * so this is that plus the air that keeps them reading as two creatures.
 * Derived from the catalogue: add a wider body and the village spreads to suit.
 */
export const MIN_SEPARATION = WIDEST_BODY + 6;

/** Same hash as the motion phase: stable, cheap, and no dependency. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Spot {
  x: number;
  y: number;
}

function clears(x: number, taken: readonly number[]): boolean {
  return taken.every((other) => Math.abs(x - other) >= MIN_SEPARATION);
}

/**
 * The spot nearest `wanted` that lies inside [lo, hi] and keeps
 * MIN_SEPARATION from everyone already standing in this row.
 *
 * Only the creature being placed ever moves; the ones already there keep
 * their x. That is what makes a newcomer harmless — it steps aside rather
 * than shoving the village along.
 *
 * The only positions worth trying are `wanted` itself, the two edges of each
 * occupied creature's exclusion zone, and the row's own ends: any other clear
 * position has one of those between it and `wanted`, so it is never the
 * nearest. If the row is so crowded that nothing clears (over ~32 villagers
 * in one row of Homes), the creature takes the spot it asked for and overlaps
 * rather than going missing.
 */
function nearestClearSpot(wanted: number, taken: readonly number[], lo: number, hi: number): number {
  const candidates = [wanted, lo, hi];
  for (const other of taken) candidates.push(other - MIN_SEPARATION, other + MIN_SEPARATION);

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < lo || candidate > hi) continue;
    if (!clears(candidate, taken)) continue;
    if (best === null) { best = candidate; continue; }
    const gap = Math.abs(candidate - wanted);
    const bestGap = Math.abs(best - wanted);
    // Ties go to the smaller x, so the result never depends on candidate order.
    if (gap < bestGap || (gap === bestGap && candidate < best)) best = candidate;
  }
  return best ?? wanted;
}

/**
 * Deterministic placement inside Homes. A creature asks for the row and the
 * offset its own id hashes to, and gets exactly that unless somebody is
 * already standing there; when somebody is, only the arriving creature moves.
 *
 * Guaranteed spacing and placement-from-the-id-alone cannot both hold: with a
 * finite number of non-overlapping spots, two ids that hash together mean one
 * of them has to stand somewhere else. So a spot depends on the id *and* on
 * who was seated before it. Seating order is fixed here rather than inherited
 * from the caller — by code unit, which is locale-independent, unlike the
 * `localeCompare` protocol.ts sorts views with — so the layout is a pure
 * function of the *set* of ids. That is the stable-geography promise in the
 * form it can actually keep: the same villagers always produce the same
 * village, however the caller ordered them, on every reload. Membership
 * changes are the exception, and a villager can be nudged along its row to
 * make room; `village.ts` moves the actor to match.
 */
export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  const homes = ZONES.find((z) => z.id === 'homes')!;
  const lo = homes.x + MARGIN;
  const hi = homes.x + homes.w - MARGIN;
  const spots = new Map<string, Spot>();
  /** x values already handed out, per row. */
  const occupied = new Map<number, number[]>();

  const seating = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const id of seating) {
    const h = hash(id);
    const row = h % ROWS;
    // Two independent draws from the hash: one for the row, one for the offset.
    const along = ((h >>> 8) % 10000) / 10000;
    const wanted = Math.round(lo + along * (hi - lo));

    const taken = occupied.get(row) ?? [];
    const x = nearestClearSpot(wanted, taken, lo, hi);
    taken.push(x);
    occupied.set(row, taken);

    spots.set(id, { x, y: GROUND_Y - row * ROW_DEPTH });
  }

  return spots;
}
