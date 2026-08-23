import { describe, it, expect } from 'vitest';
import { WAYPOINTS, WAYPOINT_MS, journeyAt } from './journey.js';

describe('WAYPOINTS', () => {
  it('is the 15-stop spec loop, summer blue to night storm to sunrise', () => {
    expect(WAYPOINTS).toHaveLength(15);
    expect(WAYPOINTS[0]).toMatchObject({ palette: '1a', frame: 'day', weather: 'clear' });
    expect(WAYPOINTS[13]).toMatchObject({ palette: '1a', frame: 'night', weather: 'storm' });
    expect(WAYPOINTS[14]).toMatchObject({ palette: '1a', frame: 'dawn', weather: 'clear' });
  });

  it('cohesion invariant: adjacent stops (loop-closed) change at most two of the three axes', () => {
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const a = WAYPOINTS[i]!, b = WAYPOINTS[(i + 1) % WAYPOINTS.length]!;
      const changed = (a.palette !== b.palette ? 1 : 0) + (a.frame !== b.frame ? 1 : 0) + (a.weather !== b.weather ? 1 : 0);
      expect(changed, `${a.label} -> ${b.label}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('journeyAt', () => {
  it('is stateless and wall-clock derived', () => {
    expect(journeyAt(0)).toMatchObject({ a: WAYPOINTS[0], b: WAYPOINTS[1], t: 0 });
    expect(journeyAt(WAYPOINT_MS * 1.5).a).toBe(WAYPOINTS[1]);
    expect(journeyAt(WAYPOINT_MS * 1.5).t).toBeCloseTo(0.5);
  });
  it('closes the loop', () => {
    const last = journeyAt(WAYPOINT_MS * 14.5);
    expect(last.a).toBe(WAYPOINTS[14]);
    expect(last.b).toBe(WAYPOINTS[0]);
  });
});
