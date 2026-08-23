import { describe, it, expect } from 'vitest';
import { ROBOT_HOUSE_BOX, ROBOT_HOUSE_X, inRobotHouse, PORCH_SPOT } from './robot.js';
import { ZONES, GROUND_Y } from './zones.js';

describe('the robot-house plot', () => {
  it('stands inside the Homes zone', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    expect(ROBOT_HOUSE_X).toBeGreaterThan(homes.x);
    expect(ROBOT_HOUSE_X + ROBOT_HOUSE_BOX.w).toBeLessThan(homes.x + homes.w);
  });

  it('the hit box accepts its centre and rejects the field beside it', () => {
    const cx = ROBOT_HOUSE_BOX.x + ROBOT_HOUSE_BOX.w / 2;
    const cy = ROBOT_HOUSE_BOX.y + ROBOT_HOUSE_BOX.h / 2;
    expect(inRobotHouse(cx, cy)).toBe(true);
    expect(inRobotHouse(cx + 400, cy)).toBe(false);
    expect(inRobotHouse(cx, GROUND_Y + 200)).toBe(false);
  });

  it('the porch stands on the ground, beside the house, outside the drop box', () => {
    expect(PORCH_SPOT.y).toBe(GROUND_Y);
    expect(inRobotHouse(PORCH_SPOT.x, PORCH_SPOT.y - 34)).toBe(false); // body midpoint clear of the box
  });

  it('the drop box clears every decor house and tree in Homes', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    const houseSpans = [180, 900, 1700].map((dx) => [homes.x + dx - 8, homes.x + dx + 94]);
    const treeSpans = [60, 620, 1240, 2050, 2420].map((dx) => [homes.x + dx, homes.x + dx + 40]);
    const boxLeft = ROBOT_HOUSE_BOX.x;
    const boxRight = ROBOT_HOUSE_BOX.x + ROBOT_HOUSE_BOX.w;
    for (const [lo, hi] of [...houseSpans, ...treeSpans]) {
      expect(boxRight <= lo || boxLeft >= hi).toBe(true);
    }
  });
});
