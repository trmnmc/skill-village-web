/**
 * The swing of a creature held by the scruff: a damped pendulum driven by how
 * fast the cursor is travelling.
 *
 * Unlike everything else in `motion.ts`, this cannot be pure in (time, phase)
 * — a swing depends on the path the hand took, not on the clock — so it keeps
 * the two numbers a spring needs between frames. It is still headless: no
 * KAPLAY, no game objects, just degrees in and degrees out.
 *
 * Angles are KAPLAY's `.angle`, in degrees. Measured on screen rather than
 * derived: a positive angle swings the part of an object *below* its origin
 * toward +x. So a creature hanging from the cursor needs a *negative* angle to
 * trail a rightward drag, which is the sign this file produces and
 * `dangle.test.ts` pins. (Do not re-derive it from `Vec2.fromAngle`, which
 * points +90° downward and reads as the opposite convention — that reasoning
 * gets you a creature whose feet lead the hand instead of following it.)
 */

import { clamp } from './motion.js';

/**
 * Degrees of tilt the drive asks for per 1000 px/s of cursor travel. Note the
 * speed is measured in *world* pixels, which the camera's zoom makes smaller
 * than the screen pixels the hand actually crosses — tuned against the real
 * thing on screen, not against the raw mouse numbers.
 */
const TILT_PER_SPEED = 45;

/** The hardest a flick can ever lay a creature over. */
export const MAX_TILT = 25;

/**
 * Spring constants. The damping ratio works out near 0.5 — underdamped, so
 * letting go overshoots vertical by a sixth of the swing and wobbles back
 * over about a second. That overshoot is the whole point: a critically damped
 * creature slides to a stop like a UI panel, not like something alive.
 */
const STIFFNESS = 120;
const DAMPING = 11;

/**
 * A frame this long is a tab that was backgrounded, not a slow one. Explicit
 * Euler on a spring this stiff diverges once `dt` passes roughly 2/ω (~0.18s
 * here); clamping the step means a returning tab resumes swinging instead of
 * coming back as NaN.
 */
const MAX_STEP = 1 / 30;

export interface Dangle {
  /**
   * Advance one frame. `cursorVx` is the hand's horizontal speed in px/s.
   * Returns the new hang angle in degrees.
   */
  update(dt: number, cursorVx: number): number;
  /** The angle the last `update` returned. */
  angle(): number;
}

export function createDangle(): Dangle {
  let angle = 0;
  let vel = 0;

  return {
    update(dt, cursorVx) {
      // Clamp the *drive*, not the result: a spring free to overshoot a
      // clamped target would still be caught by the same ceiling on the way
      // past it, so the tilt is bounded either way — but clamping here keeps
      // a 50,000 px/s flick from storing a season's worth of energy in the
      // spring and unwinding it for the rest of the drag.
      const target = clamp((-cursorVx / 1000) * TILT_PER_SPEED, -MAX_TILT, MAX_TILT);
      const step = clamp(dt, 0, MAX_STEP);
      vel += ((target - angle) * STIFFNESS - vel * DAMPING) * step;
      angle = clamp(angle + vel * step, -MAX_TILT, MAX_TILT);
      return angle;
    },
    angle() {
      return angle;
    },
  };
}
