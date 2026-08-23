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
  { id: 'homes', label: 'Homes', x: 520, w: 3000 },
  { id: 'adoption', label: 'Adoption Center', x: 3520, w: 760 },
  { id: 'notice', label: 'Notice Board', x: 4280, w: 420 },
]);

export const WORLD_W = 4700;
/** Baseline the props are anchored around; depth rows reach both ways from it. */
export const GROUND_Y = 620;

/** Depth rows behind the baseline, toward the horizon. */
const BACK_ROWS = 3;
/** Depth rows in front of the baseline, toward the viewer. */
const FRONT_ROWS = 3;
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
 * The row lottery, front-most first — one entry per row. Only the row
 * pressed right against the glass stays sparse; every other row carries its
 * share, or the bottom of the frame — the biggest stretch of screen the
 * village owns — reads as empty field.
 */
const ROW_WEIGHTS: readonly number[] = [2, 3, 3, 3, 3, 3, 3];
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
export const HOMES_HOUSE_XS: readonly number[] = [190, 1030, 2015].map((dx) => HOMES.x + dx);
export const HOMES_TREE_XS: readonly number[] = [75, 700, 1405, 2345, 2810].map((dx) => HOMES.x + dx);
/** The Homes sign's centre — the one prop that is information, not decor. */
export const HOMES_SIGN_X = HOMES.x + HOMES.w / 2;

/** Baselines the props are drawn on; village.ts anchors its draw calls here. */
export const HOUSE_BASE_Y = GROUND_Y - 30;
export const TREE_BASE_Y = GROUND_Y - 20;
export const SIGN_BASE_Y = GROUND_Y - 6;

/** A zone sign is a 100px board; village.ts centres one on every zone. */
export const SIGN_W = 100;
export const signLeft = (zone: Zone) => zone.x + zone.w / 2 - SIGN_W / 2;

/** Air between a villager's body edge and a prop it stands beside. */
const PROP_AIR = 4;
/** The sign is information — it earns a little more breathing room. */
const SIGN_AIR = 8;
/**
 * Feet this close under a prop's top edge read as perched on it even though
 * the pixels don't quite touch (a back row hovering over a roofline).
 */
const PERCH = 8;
/** How far the tallest body reaches above its feet, crown included. */
const BODY_REACH = 120;

export interface KeepOut {
  left: number;
  right: number;
}

interface Prop {
  /** Visual x-footprint in world pixels — a house's includes the roof eaves. */
  left: number;
  right: number;
  /** Vertical extent of the drawn pixels; heights mirror the draw functions in village.ts. */
  top: number;
  base: number;
  air: number;
}

const DECOR: readonly Prop[] = [
  ...HOMES_HOUSE_XS.map((x) => ({
    left: x - 8, right: x + 94, top: HOUSE_BASE_Y - 102, base: HOUSE_BASE_Y, air: PROP_AIR,
  })),
  ...HOMES_TREE_XS.map((x) => ({
    left: x, right: x + 40, top: TREE_BASE_Y - 110, base: TREE_BASE_Y, air: PROP_AIR,
  })),
];

/** The Homes sign's board — the 30px strip that carries the zone label. */
const SIGN_BOARD = {
  left: signLeft(HOMES),
  right: signLeft(HOMES) + SIGN_W,
  top: SIGN_BASE_Y - 62,
  bottom: SIGN_BASE_Y - 32,
};

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
 * Where a villager standing at `feetY` may not put its centre. Exclusion
 * follows what a body would actually cover, so the emptiness around a prop
 * is never wider than the prop's own shadow on that row — a hard ring around
 * everything read as a force field, the void as conspicuous as a queue:
 *
 * - Decor (houses, trees): blocked only for rows whose feet land among the
 *   prop's pixels, or perch just above its top edge. Rows in front stroll
 *   past — partial occlusion of decor is how a crowd blends in.
 * - The sign board is information and is never covered from any distance:
 *   blocked for every row whose body span crosses the board. The back rows
 *   pass behind it (their bodies never reach down to the board) and the
 *   front-most row passes in front below it, so the sign keeps neighbours.
 */
export function homesKeepOutAt(feetY: number): readonly KeepOut[] {
  const bands: KeepOut[] = DECOR.filter(
    (p) => feetY >= p.top - PERCH && feetY <= p.base,
  ).map((p) => ({
    left: p.left - WIDEST_BODY / 2 - p.air,
    right: p.right + WIDEST_BODY / 2 + p.air,
  }));

  if (feetY >= SIGN_BOARD.top && feetY - BODY_REACH <= SIGN_BOARD.bottom) {
    bands.push({
      left: SIGN_BOARD.left - WIDEST_BODY / 2 - SIGN_AIR,
      right: SIGN_BOARD.right + WIDEST_BODY / 2 + SIGN_AIR,
    });
  }

  return mergeBands(bands);
}

/**
 * Half the breathing room a villager claims for itself, in pixels — at least
 * half a body width, plus a personal margin drawn from the id. Two villagers
 * stand no closer than the sum of their radii, so a packed stretch reads as
 * a crowd with uneven gaps rather than an evenly-drilled queue.
 */
export function personalSpace(id: string): number {
  return WIDEST_BODY / 2 + 3 + ((hash(id) >>> 16) % 22);
}

/** The seatable stretch of Homes: inside the zone with MARGIN kept from both ends. */
export const HOMES_LO = HOMES.x + MARGIN;
export const HOMES_HI = HOMES.x + HOMES.w - MARGIN;

/** Everything a row's seating needs, derived once per row. */
interface RowGround {
  bands: readonly KeepOut[];
  /**
   * The seatable stretch minus the row's bands, as ordered segments. Wanted
   * positions are hashed onto *this*, not onto the whole stretch: hashing
   * onto the whole stretch and snapping blocked villagers to the nearest
   * band edge stood half the village at the bands' shared edge x-values —
   * the same x in every row, which drew as vertical columns of creatures.
   */
  free: readonly KeepOut[];
  freeTotal: number;
}

const ROW_GROUND: readonly RowGround[] = Array.from({ length: ROWS }, (_, row) => {
  const bands = homesKeepOutAt(rowY(row));
  const free: KeepOut[] = [];
  let cursor = HOMES_LO;
  for (const band of bands) {
    if (band.right <= cursor || band.left >= HOMES_HI) continue;
    if (band.left > cursor) free.push({ left: cursor, right: band.left });
    cursor = Math.max(cursor, band.right);
    if (cursor >= HOMES_HI) break;
  }
  if (cursor < HOMES_HI) free.push({ left: cursor, right: HOMES_HI });
  return { bands, free, freeTotal: free.reduce((sum, seg) => sum + (seg.right - seg.left), 0) };
});

/** Map a hash draw in [0, 1) onto a row's free segments, as if laid end to end. */
function groundAt(along: number, ground: RowGround): number {
  let pos = along * ground.freeTotal;
  for (const seg of ground.free) {
    const len = seg.right - seg.left;
    if (pos <= len) return Math.round(seg.left + pos);
    pos -= len;
  }
  return ground.free.at(-1)!.right;
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
  /**
   * How far this villager may amble from home, in pixels along the row. Cut
   * from its real clearances at placement time: full excursions toward a
   * neighbour still leave MIN_SEPARATION between the pair even when both are
   * at their limits, and no excursion reaches a keep-out band or the row's
   * ends. Zero for a villager seated with no room — crowded rows stand still.
   */
  wander: number;
}

/** The longest leash any villager gets, however open its ground. */
const WANDER_CAP = 60;

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
  taken: readonly Occupant[],
  blocked: readonly KeepOut[],
  gapTo: (other: Occupant) => number,
): boolean {
  return !onScenery(x, blocked) && taken.every((other) => Math.abs(x - other.x) >= gapTo(other));
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
 * The clear position nearest `wanted` inside [lo, hi] under a given spacing
 * rule, or null when the row holds no such position.
 *
 * The only positions worth trying are `wanted` itself, the two edges of each
 * occupied creature's exclusion zone, the edges of each scenery band, and the
 * row's own ends: any other clear position has one of those between it and
 * `wanted`, so it is never the nearest.
 */
function findNearest(
  wanted: number,
  taken: readonly Occupant[],
  lo: number,
  hi: number,
  blocked: readonly KeepOut[],
  gapTo: (other: Occupant) => number,
): number | null {
  const candidates = [wanted, lo, hi];
  for (const other of taken) candidates.push(other.x - gapTo(other), other.x + gapTo(other));
  for (const band of blocked) candidates.push(band.left, band.right);

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < lo || candidate > hi) continue;
    if (!clears(candidate, taken, blocked, gapTo)) continue;
    if (best === null) { best = candidate; continue; }
    const gap = Math.abs(candidate - wanted);
    const bestGap = Math.abs(best - wanted);
    // Ties go to the smaller x, so the result never depends on candidate order.
    if (gap < bestGap || (gap === bestGap && candidate < best)) best = candidate;
  }
  return best;
}

interface RowMember {
  id: string;
  /** The id's raw draw in [0, 1): its rank order along the row. */
  along: number;
  /** An independent draw in [0, 1): where it drifts inside its own stratum. */
  jitter: number;
  /** World x it will ask for — assigned once the row's membership is known. */
  wanted: number;
  r: number;
}

/**
 * Seat one row's members in order under a spacing rule. Returns the x per id,
 * or null if somebody could not be seated — a greedy pass spends ground as it
 * goes, so "somebody failed" means the row cannot hold everyone at this rule.
 */
function seatRow(
  members: readonly RowMember[],
  ground: RowGround,
  gapFor: (a: RowMember, other: Occupant) => number,
): Map<string, number> | null {
  const taken: Occupant[] = [];
  const xs = new Map<string, number>();
  for (const member of members) {
    const x = findNearest(member.wanted, taken, HOMES_LO, HOMES_HI, ground.bands, (other) =>
      gapFor(member, other),
    );
    if (x === null) return null;
    taken.push({ x, r: member.r });
    xs.set(member.id, x);
  }
  return xs;
}

/** The smallest clear-of-scenery x at or right of `from`; null past the row's end. */
function nearestGroundRight(from: number, blocked: readonly KeepOut[]): number | null {
  let x = Math.max(from, HOMES_LO);
  // Bands are merged and sorted, so one left-to-right pass settles it.
  for (const band of blocked) {
    if (x > band.left && x < band.right) x = band.right;
  }
  return x <= HOMES_HI ? x : null;
}

/**
 * Pack the row at the floor, left to right in wanted order. Greedy seating
 * wastes ground (villagers scattered mid-segment fragment it); this rung
 * trades wanted-proximity for the row's full carrying capacity, keeping only
 * the villagers' left-to-right order. Members past even that capacity — the
 * grid ran off the row's end — seat spacing-blind on the nearest clear
 * ground: they may overlap, but nobody goes missing and nobody stands on a
 * prop, and everyone who did fit keeps the floor.
 */
function seatRowPacked(members: readonly RowMember[], ground: RowGround): Map<string, number> {
  const ordered = [...members].sort(
    (a, b) => a.wanted - b.wanted || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const xs = new Map<string, number>();
  let cursor = HOMES_LO;
  for (const member of ordered) {
    const x = nearestGroundRight(cursor, ground.bands);
    if (x === null) {
      xs.set(member.id, nearestGround(member.wanted, HOMES_LO, HOMES_HI, ground.bands));
      continue;
    }
    xs.set(member.id, x);
    cursor = x + MIN_SEPARATION;
  }
  return xs;
}

/**
 * Deterministic placement inside Homes. A creature's id hashes to its depth
 * row and to its *rank* along that row; the rank picks its stratum of the
 * row's free ground and a second draw places it inside the stratum.
 *
 * The layout is a pure function of the *set* of ids: seating order is fixed
 * here rather than inherited from the caller — by code unit, which is
 * locale-independent, unlike the `localeCompare` protocol.ts sorts views
 * with — so the same villagers always produce the same village, however the
 * caller ordered them, on every reload. Membership changes are the
 * exception: a newcomer widens its row's strata, so its row-mates each
 * shuffle a step while every other row stands still; `village.ts` moves the
 * actors to match.
 *
 * Comfort degrades per row, in whole-row steps: everyone's personal margins
 * first; then greedy seating at the MIN_SEPARATION floor (a late arrival
 * must not overlap just because earlier ones were seated generously); then a
 * left-to-right pack at the floor, which trades wanted-proximity for the
 * row's full carrying capacity; and only a row past even that seats
 * spacing-blind on clear ground. Scenery stays clear throughout.
 */
export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  const byRow = new Map<number, RowMember[]>();
  for (const id of [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const h = hash(id);
    // Independent draws from the hash: the row, the rank, the stratum drift,
    // and (inside personalSpace) the radius.
    const row = rowFor(h);
    const members = byRow.get(row) ?? [];
    members.push({
      id,
      along: ((h >>> 8) % 10000) / 10000,
      jitter: ((h >>> 24) & 0xff) / 256,
      wanted: 0,
      r: personalSpace(id),
    });
    byRow.set(row, members);
  }

  const spots = new Map<string, Spot>();
  for (const [row, members] of byRow) {
    const ground = ROW_GROUND[row]!;
    // Stratified, not uniform: hashing positions independently leaves Poisson
    // voids — stretches of empty field beside bunched-up stretches. Each
    // villager instead gets its own slice of the row's free ground, ordered
    // by its hash draw, and drifts inside it by a second draw. The crowd
    // fills the row the way a real one does: evenly, but never on a grid.
    const ordered = [...members].sort(
      (a, b) => a.along - b.along || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    ordered.forEach((member, i) => {
      member.wanted = groundAt((i + 0.15 + 0.7 * member.jitter) / ordered.length, ground);
    });

    const xs =
      seatRow(ordered, ground, (a, other) => other.r + a.r) ??
      seatRow(ordered, ground, () => MIN_SEPARATION) ??
      seatRowPacked(ordered, ground);

    // The wander leash: half the spare gap to each neighbour (both may be at
    // their limits at once), never past a band edge or the row's ends.
    const seated = [...xs.entries()].map(([id, x]) => ({ id, x })).sort((a, b) => a.x - b.x);
    seated.forEach((e, i) => {
      const left = i === 0 ? e.x - HOMES_LO : (e.x - seated[i - 1]!.x - MIN_SEPARATION) / 2;
      const right =
        i === seated.length - 1 ? HOMES_HI - e.x : (seated[i + 1]!.x - e.x - MIN_SEPARATION) / 2;
      let leash = Math.min(WANDER_CAP, left, right);
      for (const band of ground.bands) {
        if (band.right <= e.x) leash = Math.min(leash, e.x - band.right);
        else if (band.left >= e.x) leash = Math.min(leash, band.left - e.x);
      }
      spots.set(e.id, { x: e.x, y: rowY(row), wander: Math.max(0, Math.floor(leash)) });
    });
  }

  return spots;
}

/**
 * Deterministic placement inside any horizontal range — the spectator
 * meadow's seating contract, carried over from before the Homes rework.
 * Deliberately simpler than placeCreatures: the classic four back rows (the
 * showroom's pens were framed for them), no scenery bands (an arbitrary
 * range has no props), and no wander (penned creatures hold their spots).
 * The personal-space rule carries over so pens read as crowds, not queues.
 */
export function placeInRange(ids: readonly string[], lo: number, hi: number): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  /** Who already stands where, per row. */
  const occupied = new Map<number, Occupant[]>();

  for (const id of [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const h = hash(id);
    const row = h % 4;
    const wanted = Math.round(lo + (((h >>> 8) % 10000) / 10000) * (hi - lo));
    const r = personalSpace(id);

    const taken = occupied.get(row) ?? [];
    const x =
      findNearest(wanted, taken, lo, hi, [], (other) => other.r + r) ??
      findNearest(wanted, taken, lo, hi, [], () => MIN_SEPARATION) ??
      Math.min(hi, Math.max(lo, wanted));
    taken.push({ x, r });
    occupied.set(row, taken);

    spots.set(id, { x, y: GROUND_Y - row * ROW_DEPTH, wander: 0 });
  }

  return spots;
}
