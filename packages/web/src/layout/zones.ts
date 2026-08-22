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
 * far edge.
 */
const HORIZON_MARGIN = 24;

/**
 * Top edge of the painted ground: derived from the depth rows, never typed in.
 * The drawn ground has to contain every row, and hardcoding its height is
 * exactly how the far band came to be 40px tall while the rows reached
 * DEPTH_REACH (138px) above the baseline — three quarters of the village
 * standing on sky. Change ROWS or ROW_DEPTH and the horizon follows.
 */
export const GROUND_TOP = GROUND_Y - DEPTH_REACH - HORIZON_MARGIN;

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

/**
 * Deterministic placement inside Homes. A creature's spot depends only on its
 * own id, so the village has a stable geography: your villagers are where you
 * left them, and a newcomer never shuffles everyone else along.
 */
export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  const homes = ZONES.find((z) => z.id === 'homes')!;
  const usable = homes.w - MARGIN * 2;
  const spots = new Map<string, Spot>();

  for (const id of ids) {
    const h = hash(id);
    const row = h % ROWS;
    // Two independent draws from the hash: one for the row, one for the offset.
    const along = ((h >>> 8) % 10000) / 10000;
    spots.set(id, {
      x: Math.round(homes.x + MARGIN + along * usable),
      y: GROUND_Y - row * ROW_DEPTH,
    });
  }

  return spots;
}
