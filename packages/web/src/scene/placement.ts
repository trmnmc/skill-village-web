/**
 * The pure half of the player-pinning wiring: everything `village.ts` needs
 * to turn a drop into a stored pin and a pin (plus residency) into a seating
 * chart, with no KAPLAY scene attached. Kept separate so it can be unit
 * tested directly — `village.ts` itself is a closure returned from an async
 * `startVillage()` that boots a canvas, and nothing inside it is callable in
 * isolation.
 */
import { placeCreatures, pinSpot, type Pin, type Spot } from '../layout/zones.js';
import { PORCH_SPOT } from '../layout/robot.js';

/**
 * Resolve a raw drop into the pin that gets stored. `others` excludes the
 * dropped villager's own current pin before handing off to `pinSpot` — an id
 * spaced against its own previous position would be pushed away from the
 * spot it is about to overwrite instead of landing on it.
 */
export function resolveDrop(pins: ReadonlyMap<string, Pin>, id: string, x: number, y: number): Pin {
  const others = [...pins.entries()].filter(([otherId]) => otherId !== id).map(([, at]) => at);
  return pinSpot(x, y, others);
}

/**
 * `resolveDrop`, corrected for how far below the cursor a held creature's
 * feet actually hang. `held.ts` grabs a creature at the scruff and lets its
 * body dangle down from there (`GRAB_INSET` plus the body's baked height —
 * see `HeldCreature.footOffset`), so resolving straight off the cursor's own
 * y reads a row or two further back, toward the horizon, than where the body
 * was visibly touching down. `footOffset` is 0 for a drag whose sprites never
 * finished loading (nothing was drawn in the hand), which falls back to the
 * cursor's own position exactly as before this existed.
 */
export function resolveHeldDrop(
  pins: ReadonlyMap<string, Pin>,
  id: string,
  x: number,
  cursorY: number,
  footOffset: number,
): Pin {
  return resolveDrop(pins, id, x, cursorY + footOffset);
}

/**
 * Seat every villager — pins and all — then stand the robot's resident on
 * the porch regardless of any pin it holds. Residency beats a pin the same
 * way it already beats the automatic hash-seat: the house always shows who
 * lives there. `village.ts`'s `reseat()` and `setView` both call this one
 * function rather than each re-applying the override, so the two can never
 * drift apart.
 */
export function seatAll(
  ids: readonly string[],
  pins: ReadonlyMap<string, Pin>,
  residentId: string | null,
): Map<string, Spot> {
  const spots = placeCreatures(ids, pins);
  if (residentId && spots.has(residentId)) spots.set(residentId, { ...PORCH_SPOT });
  return spots;
}
