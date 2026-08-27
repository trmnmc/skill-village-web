import { role, type Creature } from '@village/core/visual';
import {
  clipLeashAtBands, HOMES_HI, HOMES_LO, homesKeepOutAt, keepOutAt, layoutHash, nearestGround,
  PIN_HI, PIN_LO, placeCreatures, type Pin,
  type Spot,
} from './zones.js';

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
/** The fan: nearest ring, step per pair. */
const FAN_START = 40;
const FAN_STEP = 34;
/** The short leash an instance ambles on, before scenery cuts it back. */
export const INSTANCE_LEASH = 18;

/**
 * No creature id contains `>`, so the split below is unambiguous. A helper's
 * name is validated by NAME_PATTERN; a project's comes from a directory name,
 * where `>` is illegal on Windows but ordinary on Linux — `discoverProjects`
 * skips such an entry rather than mint an id that cannot round-trip.
 */
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
 * congruent. Same depth row as the project, so feet stay on believable ground.
 *
 * No *spacing* pass — a crowd pressed close around its genie is the intended
 * reading, not a seating bug. The scenery keep-outs are another matter: they
 * are the village's standing rule that everything is grounded and nothing
 * perches on a prop, and a 40-96px fan crosses a house band easily. The rule
 * is borrowed from zones.ts whole rather than restated: the row's bands come
 * from `homesKeepOutAt` — the very function that defines a row's bands — and
 * a fanned x is pushed off them by `nearestGround`, exactly as placeCreatures
 * seats a villager.
 *
 * The window handed to nearestGround is the tether, so an instance pushed off
 * a prop still reads as part of its genie's crowd. That window always holds
 * clear ground when the anchor does — placeCreatures never seats a project on
 * a band, and the anchor itself is inside its own tether.
 *
 * Pure and deterministic: no clock, no randomness.
 */
export function instanceSpots(
  projectId: string,
  anchor: Spot,
  helperIds: readonly string[],
): Map<string, Spot> {
  // The player can pin a project anywhere on the strip, and outside Homes the
  // Homes bounds *invert* (lo > hi) — which strands the whole aura at the far
  // edge of Homes instead of beside the genie it belongs to. An anchor inside
  // Homes keeps Homes' own bounds and bands exactly, so nothing about the
  // automatic layout moves; only a pinned project reaches the wider pair.
  const inHomes = anchor.x >= HOMES_LO && anchor.x <= HOMES_HI;
  const boundLo = inHomes ? HOMES_LO : PIN_LO;
  const boundHi = inHomes ? HOMES_HI : PIN_HI;
  const bands = inHomes ? homesKeepOutAt(anchor.y) : keepOutAt(anchor.y);
  const lo = Math.max(boundLo, anchor.x - TETHER);
  const hi = Math.min(boundHi, anchor.x + TETHER);

  const spots = new Map<string, Spot>();
  [...helperIds].sort().forEach((helperId, i) => {
    const key = instanceKey(projectId, helperId);
    const side = i % 2 === 0 ? 1 : -1;
    const dist = Math.min(TETHER, FAN_START + Math.floor(i / 2) * FAN_STEP + (layoutHash(key) % 13));
    const x = nearestGround(anchor.x + side * dist, lo, hi, bands);
    const leash = Math.min(INSTANCE_LEASH, x - boundLo, boundHi - x);
    spots.set(key, { x, y: anchor.y, wander: Math.floor(clipLeashAtBands(x, leash, bands)) });
  });
  return spots;
}

/**
 * The whole village as things-to-draw. Projects and unlinked helpers seat
 * through placeCreatures exactly as today — nothing vanishes on remap day
 * (spec §4); a helper leaves the commons only when a scan links it. Linked
 * helpers are drawn once per project that uses them.
 *
 * `pins` are the villagers the player has placed by hand, keyed by creature
 * id. They reach the layout the only place they can: the `placeCreatures`
 * call below, which seats them as fixed occupants and routes the automatic
 * crowd around them. An aura is never pinned directly — it has no seat of its
 * own — but a pinned project drags its whole fan along, because the fan is
 * measured from the anchor this call returns.
 */
export function buildRenderList(
  creatures: readonly Creature[],
  pins: ReadonlyMap<string, Pin> = new Map(),
): RenderEntry[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));

  // Only a project draws an aura, so only a project's helperIds pull a helper
  // out of the commons. Reading them off every creature would drop a helper
  // named by a non-project from the commons and then give it no instance
  // either — undrawn entirely.
  const linked = new Set<string>();
  for (const c of creatures) {
    if (role(c.kind) !== 'project') continue;
    for (const helperId of c.helperIds ?? []) {
      if (byId.has(helperId)) linked.add(helperId);
    }
  }

  const villagers = creatures.filter((c) => role(c.kind) === 'project' || !linked.has(c.id));
  const spots = placeCreatures(villagers.map((c) => c.id), pins);

  const entries: RenderEntry[] = villagers.map((c) => ({
    key: c.id,
    creature: c,
    spot: spots.get(c.id)!,
    presence: role(c.kind) === 'project' ? presenceScale((c.helperIds ?? []).length) : 1,
  }));

  for (const project of villagers) {
    if (role(project.kind) !== 'project') continue;
    const anchor = spots.get(project.id)!;
    const links = (project.helperIds ?? []).filter((id) => byId.has(id));
    for (const [key, spot] of instanceSpots(project.id, anchor, links)) {
      entries.push({ key, creature: byId.get(keyCreatureId(key))!, spot, presence: 1 });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Move the robot's resident to the porch. It stands beside the house rather
 * than on its hashed spot (spec §4: a glance at the house says who the robot
 * is), and it stands there *once* — however many bodies it usually casts, its
 * key collapses to the bare creature id while it holds the post.
 *
 * A project resident stands at the porch ALONE — its aura is dropped, not
 * relocated, and that is the design, not a compromise (owner's call,
 * 2026-08-26): residency is the spotlight, and the project shines by itself.
 * Do not "fix" this by fanning the aura around the porch. Dropping also beats
 * leaving the instances fanned around the Homes anchor it just vacated: an
 * aura with no genie under it is only a crowd standing on empty ground. (For
 * a helper resident the same filter already removes every instance, and the
 * one porch entry replaces them.)
 *
 * Pure, and the input array is never touched. The result keeps buildRenderList's
 * sort so callers can rely on one key order everywhere.
 */
export function seatResident(
  entries: readonly RenderEntry[],
  residentId: string | null,
  porch: Spot,
): RenderEntry[] {
  if (residentId === null) return [...entries];
  const mine = entries.filter((e) => e.creature.id === residentId);
  if (mine.length === 0) return [...entries];
  // No creature id contains `>` (see instanceKey, and the entry-name guard in
  // discoverProjects) — which is the whole reason this prefix test is sound.
  // It can only match keys this resident anchors: `project:foo>` cannot be a
  // prefix of `project:foobar`'s keys, because a `b` stands where the `>` must.
  const auraPrefix = `${residentId}>`;
  const rest = entries.filter((e) => e.creature.id !== residentId && !e.key.startsWith(auraPrefix));
  // A copy of the porch: it is a frozen module constant, and an actor holds
  // whatever spot it is handed for the life of the body.
  rest.push({ key: residentId, creature: mine[0]!.creature, spot: { ...porch }, presence: mine[0]!.presence });
  return rest.sort((a, b) => a.key.localeCompare(b.key));
}
