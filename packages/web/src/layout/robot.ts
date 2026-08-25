import { GROUND_Y, ZONES, type Spot } from './zones.js';

/**
 * The robot-house plot (spec §4). Placed in the clear stretch of Homes
 * between the decor house at homes.x+900 and the tree at homes.x+1240, so it
 * reads as one of the buildings rather than furniture in the crowd.
 */
const HOMES = ZONES.find((z) => z.id === 'homes')!;

export const ROBOT_HOUSE_X = HOMES.x + 1040;
/** Same baseline the decor houses sit on. */
export const ROBOT_HOUSE_Y = GROUND_Y - 30;

/**
 * The drop target. Wider and taller than the drawn building on purpose: a
 * drag is a gross gesture, and "close enough to the house" must count.
 */
export const ROBOT_HOUSE_BOX = Object.freeze({
  x: ROBOT_HOUSE_X - 16,
  y: ROBOT_HOUSE_Y - 118,
  w: 130,
  h: 130,
});

export function inRobotHouse(worldX: number, worldY: number): boolean {
  return (
    worldX >= ROBOT_HOUSE_BOX.x &&
    worldX <= ROBOT_HOUSE_BOX.x + ROBOT_HOUSE_BOX.w &&
    worldY >= ROBOT_HOUSE_BOX.y &&
    worldY <= ROBOT_HOUSE_BOX.y + ROBOT_HOUSE_BOX.h
  );
}

/**
 * Where the resident stands: on the front row beside the house, visible at a
 * glance (spec §4: the creature is shown at the house, never hidden inside).
 */
export const PORCH_SPOT: Spot = Object.freeze({ x: ROBOT_HOUSE_X + 150, y: GROUND_Y, wander: 0 });
