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
/** Baseline the props are anchored around; depth rows reach both ways from it. */
export const GROUND_Y = 620;

/** Depth rows behind the baseline, toward the horizon. */
const BACK_ROWS = 3;
/** Depth rows in front of the baseline, toward the viewer. */
const FRONT_ROWS = 2;
const ROWS = BACK_ROWS + FRONT_ROWS + 1;
const ROW_DEPTH = 46;
const MARGIN = 90;

/**
 * How far the furthest depth row reaches above the baseline: only the back
 * rows count here — the front rows extend the field the other way, toward
 * the viewer, and never move the horizon.
 */
const DEPTH_REACH = BACK_ROWS * ROW_DEPTH;

/** The front row's feet: the closest to the viewer a villager ever stands. */
export const GROUND_FRONT = GROUND_Y + FRONT_ROWS * ROW_DEPTH;

/** Feet height for a depth row: row 0 is the front-most, each next one steps back. */
const rowY = (row: number) => GROUND_FRONT - row * ROW_DEPTH;

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

const HOMES = ZONES.find((z) => z.id === 'homes')!;

/**
 * Homes scenery anchors, in world pixels. village.ts draws the props from
 * these and placeCreatures derives its keep-out bands from them, so a moved
 * tree moves its keep-out with it — the two can never drift apart.
 */
export const HOMES_HOUSE_XS: readonly number[] = [180, 900, 1700].map((dx) => HOMES.x + dx);
export const HOMES_TREE_XS: readonly number[] = [60, 620, 1240, 2050, 2420].map((dx) => HOMES.x + dx);

/** Baselines the props are drawn on; village.ts anchors its draw calls here. */
export const HOUSE_BASE_Y = GROUND_Y - 30;
export const TREE_BASE_Y = GROUND_Y - 20;
export const SIGN_BASE_Y = GROUND_Y - 6;

/** A zone sign is a 100px board; village.ts centres one on every zone. */
export const SIGN_W = 100;
export const signLeft = (zone: Zone) => zone.x + zone.w / 2 - SIGN_W / 2;

/**
 * Body-edge air between a villager and a prop, matching the 6px MIN_SEPARATION
 * leaves between two touching widest bodies.
 */
const PROP_AIR = 6;

export interface KeepOut {
  left: number;
  right: number;
}

interface Prop {
  /** Visual x-footprint in world pixels — for a house that includes the roof eaves. */
  left: number;
  right: number;
  /** Vertical extent of the drawn pixels; heights mirror the draw functions in village.ts. */
  top: number;
  base: number;
}

const PROPS: readonly Prop[] = [
  ...HOMES_HOUSE_XS.map((x) => ({
    left: x - 8, right: x + 94, top: HOUSE_BASE_Y - 102, base: HOUSE_BASE_Y,
  })),
  ...HOMES_TREE_XS.map((x) => ({
    left: x, right: x + 40, top: TREE_BASE_Y - 110, base: TREE_BASE_Y,
  })),
  {
    left: signLeft(HOMES), right: signLeft(HOMES) + SIGN_W,
    top: SIGN_BASE_Y - 62, base: SIGN_BASE_Y,
  },
];

/** Overlapping or touching bands folded together, so a band edge is always standable ground. */
function mergeBands(bands: readonly KeepOut[]): readonly KeepOut[] {
  return [...bands]
    .sort((a, b) => a.left - b.left)
    .reduce<KeepOut[]>((merged, band) => {
      const last = merged.at(-1);
      if (last && band.left <= last.right) last.right = Math.max(last.right, band.right);
      else merged.push({ ...band });
      return merged;
    }, []);
}

/**
 * Where a villager standing at `feetY` may not put its *centre*: each prop
 * whose pixels its feet would land among, widened by half the widest body
 * plus air. Depth decides membership, not the x-band alone: a front-row
 * villager (feet below every prop's base) stands *in front of* the scenery
 * and reads that way, and the back row's feet clear even the rooflines — so
 * only the rows whose feet fall inside a prop's vertical span are kept off
 * it. That is also what keeps the rows' capacity: the two middle rows carry
 * the bands, the front and back rows keep their full width.
 */
export function homesKeepOutAt(feetY: number): readonly KeepOut[] {
  return mergeBands(
    PROPS.filter((p) => feetY >= p.top && feetY <= p.base).map((p) => ({
      left: p.left - WIDEST_BODY / 2 - PROP_AIR,
      right: p.right + WIDEST_BODY / 2 + PROP_AIR,
    })),
  );
}

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

function onScenery(x: number, blocked: readonly KeepOut[]): boolean {
  return blocked.some((band) => x > band.left && x < band.right);
}

function clears(x: number, taken: readonly number[], blocked: readonly KeepOut[]): boolean {
  return !onScenery(x, blocked) && taken.every((other) => Math.abs(x - other) >= MIN_SEPARATION);
}

/**
 * The nearest x to `wanted` inside [lo, hi] that is not on scenery, ignoring
 * other villagers. The last resort when a row is too crowded to space out:
 * spacing gives way before the scenery rule does, because two overlapped
 * villagers read as a crowd while one standing on a roof reads as a bug.
 */
function nearestGround(wanted: number, lo: number, hi: number, blocked: readonly KeepOut[]): number {
  const x = Math.min(hi, Math.max(lo, wanted));
  const inside = blocked.find((band) => x > band.left && x < band.right);
  if (!inside) return x;
  const edges = [inside.left, inside.right].filter((edge) => edge >= lo && edge <= hi);
  if (edges.length === 0) return x; // the whole row is prop — cannot happen with today's scenery
  return edges.reduce((best, edge) =>
    Math.abs(edge - wanted) < Math.abs(best - wanted) ? edge : best,
  );
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
 * occupied creature's exclusion zone, the edges of each scenery band, and the
 * row's own ends: any other clear position has one of those between it and
 * `wanted`, so it is never the nearest. If the row is so crowded that nothing
 * clears (over ~21 villagers in one row of Homes once the scenery bands are
 * subtracted), the creature takes the nearest clear ground and overlaps its
 * neighbours rather than going missing or standing on a prop.
 */
function nearestClearSpot(
  wanted: number,
  taken: readonly number[],
  lo: number,
  hi: number,
  blocked: readonly KeepOut[],
): number {
  const candidates = [wanted, lo, hi];
  for (const other of taken) candidates.push(other - MIN_SEPARATION, other + MIN_SEPARATION);
  for (const band of blocked) candidates.push(band.left, band.right);

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < lo || candidate > hi) continue;
    if (!clears(candidate, taken, blocked)) continue;
    if (best === null) { best = candidate; continue; }
    const gap = Math.abs(candidate - wanted);
    const bestGap = Math.abs(best - wanted);
    // Ties go to the smaller x, so the result never depends on candidate order.
    if (gap < bestGap || (gap === bestGap && candidate < best)) best = candidate;
  }
  return best ?? nearestGround(wanted, lo, hi, blocked);
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
  const bandsByRow = Array.from({ length: ROWS }, (_, row) => homesKeepOutAt(rowY(row)));

  for (const id of seating) {
    const h = hash(id);
    const row = h % ROWS;
    // Two independent draws from the hash: one for the row, one for the offset.
    const along = ((h >>> 8) % 10000) / 10000;
    const wanted = Math.round(lo + along * (hi - lo));

    const taken = occupied.get(row) ?? [];
    const x = nearestClearSpot(wanted, taken, lo, hi, bandsByRow[row]!);
    taken.push(x);
    occupied.set(row, taken);

    spots.set(id, { x, y: rowY(row) });
  }

  return spots;
}
