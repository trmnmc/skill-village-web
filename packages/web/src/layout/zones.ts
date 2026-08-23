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
  { id: 'homes', label: 'Homes', x: 520, w: 3200 },
  { id: 'adoption', label: 'Adoption Center', x: 3720, w: 760 },
  { id: 'notice', label: 'Notice Board', x: 4480, w: 420 },
]);

export const WORLD_W = 4900;
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
 * The row lottery, front-most first — one entry per row. The field fills
 * from the back: most villagers mill about the baseline and the far field,
 * and coming near the camera is the exception, so the front row draws the
 * fewest tickets and the second row is still shy of the rest.
 */
const ROW_WEIGHTS: readonly number[] = [1, 2, 3, 3, 3, 3];
const TOTAL_WEIGHT = ROW_WEIGHTS.reduce((sum, w) => sum + w, 0);

/** Weighted row draw from a creature's hash; ROW_WEIGHTS must cover every row. */
function rowFor(h: number): number {
  let draw = h % TOTAL_WEIGHT;
  for (let row = 0; row < ROWS; row++) {
    draw -= ROW_WEIGHTS[row]!;
    if (draw < 0) return row;
  }
  return ROWS - 1;
}

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
export const HOMES_HOUSE_XS: readonly number[] = [200, 1100, 2150].map((dx) => HOMES.x + dx);
export const HOMES_TREE_XS: readonly number[] = [80, 750, 1500, 2500, 3000].map((dx) => HOMES.x + dx);

/** Baselines the props are drawn on; village.ts anchors its draw calls here. */
export const HOUSE_BASE_Y = GROUND_Y - 30;
export const TREE_BASE_Y = GROUND_Y - 20;
export const SIGN_BASE_Y = GROUND_Y - 6;

/** A zone sign is a 100px board; village.ts centres one on every zone. */
export const SIGN_W = 100;
export const signLeft = (zone: Zone) => zone.x + zone.w / 2 - SIGN_W / 2;

/**
 * Body-edge air between a villager and a prop. Wider than the 6px between
 * two touching villagers on purpose: a creature brushing a canopy still read
 * as "in the tree" to the playtest eye, so the props get double the margin.
 */
const PROP_AIR = 12;

export interface KeepOut {
  left: number;
  right: number;
}

/** Visual x-footprints in world pixels — a house's includes the roof eaves. */
const PROPS: readonly KeepOut[] = [
  ...HOMES_HOUSE_XS.map((x) => ({ left: x - 8, right: x + 94 })),
  ...HOMES_TREE_XS.map((x) => ({ left: x, right: x + 40 })),
  { left: signLeft(HOMES), right: signLeft(HOMES) + SIGN_W },
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
 * Where a villager may not put its *centre*, whatever its depth row: every
 * prop footprint widened by half the widest body plus air. Depth once
 * exempted the front and back rows (their pixels genuinely clear the props),
 * but the eye disagreed — a villager in front of a house hides it, one just
 * above a roofline reads as perched on it — so every row keeps clear, and
 * the Homes strip is wide enough to afford that.
 */
export const HOMES_KEEP_OUT: readonly KeepOut[] = mergeBands(
  PROPS.map((p) => ({
    left: p.left - WIDEST_BODY / 2 - PROP_AIR,
    right: p.right + WIDEST_BODY / 2 + PROP_AIR,
  })),
);

/**
 * Half the breathing room a villager claims for itself, in pixels — at least
 * half a body width, plus a personal margin drawn from the id. Two villagers
 * stand no closer than the sum of their radii, so a packed stretch reads as
 * a crowd with uneven gaps rather than an evenly-drilled queue.
 */
export function personalSpace(id: string): number {
  return WIDEST_BODY / 2 + 3 + ((hash(id) >>> 16) % 22);
}

/**
 * The floor on how far apart two villagers in the same depth row stand: two
 * of the widest bodies need WIDEST_BODY between their centres just to stop
 * touching, plus the air that keeps them reading as two creatures. The
 * actual required gap for a given pair is the sum of their personalSpace
 * radii, which is never below this floor.
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

/** A villager already seated in a row: its centre and the radius it claims. */
interface Occupant {
  x: number;
  r: number;
}

function onScenery(x: number, blocked: readonly KeepOut[]): boolean {
  return blocked.some((band) => x > band.left && x < band.right);
}

function clears(
  x: number,
  r: number,
  taken: readonly Occupant[],
  blocked: readonly KeepOut[],
): boolean {
  return !onScenery(x, blocked) && taken.every((other) => Math.abs(x - other.x) >= other.r + r);
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
 * The spot nearest `wanted` that lies inside [lo, hi] and keeps every seated
 * occupant's personal space (the sum of the pair's radii) from everyone
 * already standing in this row.
 *
 * Only the creature being placed ever moves; the ones already there keep
 * their x. That is what makes a newcomer harmless — it steps aside rather
 * than shoving the village along.
 *
 * The only positions worth trying are `wanted` itself, the two edges of each
 * occupied creature's exclusion zone, the edges of each scenery band, and the
 * row's own ends: any other clear position has one of those between it and
 * `wanted`, so it is never the nearest. If the row is so crowded that nothing
 * clears, the creature takes the nearest clear ground and overlaps its
 * neighbours rather than going missing or standing on a prop.
 */
function nearestClearSpot(
  wanted: number,
  r: number,
  taken: readonly Occupant[],
  lo: number,
  hi: number,
  blocked: readonly KeepOut[],
): number {
  const candidates = [wanted, lo, hi];
  for (const other of taken) candidates.push(other.x - other.r - r, other.x + other.r + r);
  for (const band of blocked) candidates.push(band.left, band.right);

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < lo || candidate > hi) continue;
    if (!clears(candidate, r, taken, blocked)) continue;
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
  /** Who already stands where, per row. */
  const occupied = new Map<number, Occupant[]>();

  const seating = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const id of seating) {
    const h = hash(id);
    const row = rowFor(h);
    // Independent draws from the hash: the row, the offset, the personal radius.
    const along = ((h >>> 8) % 10000) / 10000;
    const wanted = Math.round(lo + along * (hi - lo));
    const r = personalSpace(id);

    const taken = occupied.get(row) ?? [];
    const x = nearestClearSpot(wanted, r, taken, lo, hi, HOMES_KEEP_OUT);
    taken.push({ x, r });
    occupied.set(row, taken);

    spots.set(id, { x, y: rowY(row) });
  }

  return spots;
}
