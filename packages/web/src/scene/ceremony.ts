/**
 * The suck-in ceremony's clock and curves — what happens when a creature is
 * dropped on the robot-house, as pure math. No KAPLAY here (the dangle.ts
 * pattern): ceremonyPlay.ts skins the flight onto the held visual, and
 * robotHouse.ts evaluates the impact curves on its own clock.
 *
 * Two presets ship for a live playtest verdict (`?ceremony=a|b`, the
 * `?ground=` pattern). They share the same flight; they differ only at
 * impact — `b` adds hit-stop (everything holds frozen a few frames at
 * contact) and a scale-punch squash. The loser gets deleted.
 */

export type CeremonyPreset = 'a' | 'b';

/** `?ceremony=` override; anything unrecognised is the default calm beat. */
export function ceremonyPreset(
  search = typeof location === 'undefined' ? '' : location.search,
): CeremonyPreset {
  return new URLSearchParams(search).get('ceremony') === 'b' ? 'b' : 'a';
}

/** Anticipation: the body tips back and stretches away from the house. */
export const WIND_S = 0.12;
/** The pull into the face-screen. */
export const PULL_S = 0.3;
/** Flight time before contact. */
export const CONTACT_AT = WIND_S + PULL_S;
/** Preset b only: how long everything holds frozen at the moment of impact. */
export const HITSTOP_S = 0.05;
/** How far the windup backs away, as a fraction of the whole flight. */
export const WINDUP_RETREAT = 0.04;
/** Arc apex height as a fraction of the horizontal flight distance. */
export const ARC_LIFT_FRAC = 0.18;
/** The hardest the house ever rocks, in degrees. */
export const MAX_ROCK_DEG = 3;
/** Preset b's scale-punch depth: scaleY dips this far below 1. */
export const PUNCH_SQUASH = 0.12;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

export interface FlightFrame {
  phase: 'windup' | 'pull' | 'contact';
  /** Drives flightPoint: slightly negative in the windup, 1 at the screen. */
  progress: number;
  sx: number;
  sy: number;
  labelAlpha: number;
}

export function flightFrame(elapsed: number): FlightFrame {
  if (elapsed < WIND_S) {
    const p = easeOutCubic(elapsed / WIND_S);
    return {
      phase: 'windup',
      progress: -WINDUP_RETREAT * p,
      sx: 1 + 0.06 * p,
      sy: 1 + 0.05 * p,
      labelAlpha: 1 - p,
    };
  }
  if (elapsed < CONTACT_AT) {
    const p = easeInCubic((elapsed - WIND_S) / PULL_S);
    return {
      phase: 'pull',
      progress: p,
      sx: 1 - 0.8 * p,
      sy: 1 + 0.9 * Math.sin(p * Math.PI),
      labelAlpha: 0,
    };
  }
  return { phase: 'contact', progress: 1, sx: 0.2, sy: 1, labelAlpha: 0 };
}

/**
 * Where the body is at a given progress: a straight lerp lifted into an arc.
 * The lift scales with the horizontal distance so short hops stay subtle and
 * a cross-yard fling gets a real trajectory.
 */
export function flightPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  const lift = Math.abs(to.x - from.x) * ARC_LIFT_FRAC * Math.sin(clamped * Math.PI);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress - lift,
  };
}

/** Preset b freezes its impact clock through the hit-stop window. */
const impactClock = (s: number, preset: CeremonyPreset) =>
  preset === 'b' ? Math.max(0, s - HITSTOP_S) : s;

/** Decaying rock around the house's footing, degrees. */
export function impactRock(s: number, preset: CeremonyPreset): number {
  const u = impactClock(s, preset);
  return MAX_ROCK_DEG * Math.exp(-u * 5) * Math.cos(u * 18);
}

/** Preset b's scale-punch; preset a keeps its shape and only rocks. */
export function impactSquash(
  s: number,
  preset: CeremonyPreset,
): { sx: number; sy: number } {
  if (preset === 'a') return { sx: 1, sy: 1 };
  if (s < HITSTOP_S) return { sx: 1 + PUNCH_SQUASH, sy: 1 - PUNCH_SQUASH };
  const u = s - HITSTOP_S;
  const w = PUNCH_SQUASH * Math.exp(-u * 6) * Math.cos(u * 14);
  return { sx: 1 + w, sy: 1 - w };
}

/** Screen flash: full through any hold, then a fast linear fade. */
export function impactFlash(s: number, preset: CeremonyPreset): number {
  const hold = preset === 'b' ? HITSTOP_S : 0;
  if (s < hold) return 1;
  return Math.max(0, 1 - (s - hold) / 0.15);
}

/** When the house may snap its transform clean and stop evaluating. */
export function impactDone(s: number): boolean {
  return s > 1.2;
}
