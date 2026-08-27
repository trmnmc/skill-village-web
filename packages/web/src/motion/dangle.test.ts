import { describe, it, expect } from 'vitest';
import { createDangle, MAX_TILT } from './dangle.js';

/** Feed the same cursor speed for `seconds` at 60fps and return the final angle. */
function drive(d: ReturnType<typeof createDangle>, vx: number, seconds: number): number {
  let angle = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) angle = d.update(1 / 60, vx);
  return angle;
}

describe('dangle', () => {
  it('hangs straight down until the cursor moves', () => {
    const d = createDangle();
    expect(d.angle()).toBe(0);
    expect(drive(d, 0, 1)).toBe(0);
  });

  // The sign this whole feature rests on, and the one thing here that was
  // wrong on the first attempt. A held creature must TRAIL the hand: haul it
  // right and its feet swing left, like anything else dangling from a fist.
  // In KAPLAY a positive `.angle` swings below-origin content toward +x
  // (measured on screen, not derived), so trailing a rightward drag is a
  // negative angle.
  it('trails behind the drag: rightward cursor swings the feet left', () => {
    expect(drive(createDangle(), 800, 1)).toBeLessThan(-5);
  });

  it('mirrors for a leftward drag', () => {
    const right = drive(createDangle(), 800, 1);
    const left = drive(createDangle(), -800, 1);
    expect(left).toBeCloseTo(-right, 6);
    expect(left).toBeGreaterThan(5);
  });

  it('never swings past the clamp, however hard the flick', () => {
    for (const vx of [2_000, 50_000, 1e9]) {
      const d = createDangle();
      let worst = 0;
      for (let i = 0; i < 600; i++) worst = Math.max(worst, Math.abs(d.update(1 / 60, vx)));
      expect(worst).toBeLessThanOrEqual(MAX_TILT + 1e-9);
    }
  });

  it('settles back to hanging once the cursor stops, wobbling through vertical on the way', () => {
    const d = createDangle();
    drive(d, 900, 1);
    let crossedBelowZero = false;
    let angle = d.angle();
    for (let i = 0; i < 180; i++) {
      angle = d.update(1 / 60, 0);
      if (angle < -0.5) crossedBelowZero = true;
    }
    // Underdamped, so it overshoots vertical before it gives up — that
    // overshoot is the wobble the drop is supposed to read as.
    expect(crossedBelowZero).toBe(true);
    expect(Math.abs(angle)).toBeLessThan(0.5);
  });

  it('survives a stalled frame without exploding', () => {
    const d = createDangle();
    // A backgrounded tab hands back one enormous dt. Integrated raw, a spring
    // this stiff would blow up and never recover.
    const angle = d.update(4, 900);
    expect(Number.isFinite(angle)).toBe(true);
    expect(Math.abs(angle)).toBeLessThanOrEqual(MAX_TILT + 1e-9);
  });

  it('reports the same angle it last returned', () => {
    const d = createDangle();
    const returned = d.update(1 / 60, 700);
    expect(d.angle()).toBe(returned);
  });
});
