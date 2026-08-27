import type { Creature } from '@village/core/visual';
import { HOMES_HI, HOMES_LO, layoutHash, placeCreatures, type Spot } from './zones.js';

/**
 * One thing to draw: a villager (a project, or a helper with no links — the
 * commons), or a helper *instance* standing beside one project that uses it.
 * One creature, many render instances (remap spec §4): the creature keeps one
 * persona, one stats block, one panel; only the bodies multiply.
 */
export interface RenderEntry {
  /** The creature id for a villager; `<projectId>><helperId>` for an instance. */
  key: string;
  creature: Creature;
  spot: Spot;
  /** Body scale multiplier — the genie framing. 1 for everything but projects. */
  presence: number;
}

/** Mild and capped: a ten-helper project is a big genie, not a kaiju. */
export function presenceScale(helperCount: number): number {
  return Math.min(1.3, 1 + 0.06 * helperCount);
}

/** How far an instance may stand from its project's anchor (spec §4's tether). */
export const TETHER = 96;
/** The fan: nearest ring, step per pair, and the short leash instances amble on. */
const FAN_START = 40;
const FAN_STEP = 34;
const INSTANCE_LEASH = 18;

/** `>` cannot appear in a Windows file name, so no creature id contains it. */
export function instanceKey(projectId: string, helperId: string): string {
  return `${projectId}>${helperId}`;
}

/** The creature a render key belongs to: the helper inside an instance key, else itself. */
export function keyCreatureId(key: string): string {
  const cut = key.indexOf('>');
  return cut === -1 ? key : key.slice(cut + 1);
}

/**
 * Deterministic fan around a project's anchor: sides alternate, rings step
 * outward, and a per-key jitter keeps two projects' auras from being
 * congruent. Same depth row as the project, so feet stay on believable
 * ground; no keep-out or spacing pass — a crowd pressed close around its
 * genie is the intended reading, not a seating bug.
 */
export function instanceSpots(
  projectId: string,
  anchor: Spot,
  helperIds: readonly string[],
): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  [...helperIds].sort().forEach((helperId, i) => {
    const key = instanceKey(projectId, helperId);
    const side = i % 2 === 0 ? 1 : -1;
    const dist = Math.min(TETHER, FAN_START + Math.floor(i / 2) * FAN_STEP + (layoutHash(key) % 13));
    const x = Math.min(HOMES_HI, Math.max(HOMES_LO, anchor.x + side * dist));
    spots.set(key, { x, y: anchor.y, wander: INSTANCE_LEASH });
  });
  return spots;
}

/**
 * The whole village as things-to-draw. Projects and unlinked helpers seat
 * through placeCreatures exactly as today — nothing vanishes on remap day
 * (spec §4); a helper leaves the commons only when a scan links it. Linked
 * helpers are drawn once per project that uses them.
 */
export function buildRenderList(creatures: readonly Creature[]): RenderEntry[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));

  const linked = new Set<string>();
  for (const c of creatures) {
    for (const helperId of c.helperIds ?? []) {
      if (byId.has(helperId)) linked.add(helperId);
    }
  }

  const villagers = creatures.filter((c) => c.kind === 'project' || !linked.has(c.id));
  const spots = placeCreatures(villagers.map((c) => c.id));

  const entries: RenderEntry[] = villagers.map((c) => ({
    key: c.id,
    creature: c,
    spot: spots.get(c.id)!,
    presence: c.kind === 'project' ? presenceScale((c.helperIds ?? []).length) : 1,
  }));

  for (const project of villagers) {
    if (project.kind !== 'project') continue;
    const anchor = spots.get(project.id)!;
    const links = (project.helperIds ?? []).filter((id) => byId.has(id));
    for (const [key, spot] of instanceSpots(project.id, anchor, links)) {
      entries.push({ key, creature: byId.get(keyCreatureId(key))!, spot, presence: 1 });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}
