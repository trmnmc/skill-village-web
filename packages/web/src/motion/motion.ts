/**
 * The motion vocabulary from spec §4.2, copied from the animation trailer.
 * Every function is pure in (time, phase), which is what makes the village's
 * whole feel testable without drawing a frame.
 */

const HOP_CYCLE = 2.6;
const HOP_ANTICIPATE = 0.18;
const HOP_AIRBORNE = 0.54;
const HOP_RECOVER = 0.23;
const HOP_HEIGHT = 64;

const BUBBLE_IN = 0.38;
/** Exported for the scene: ending a thinking bubble means giving it this much life. */
export const BUBBLE_OUT = 0.28;

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * A stable per-creature phase offset in [0, 1). Every cycle below is shifted by
 * it, so no two creatures breathe or blink together — spec §4.2 calls this the
 * single detail that carries most of the living-community feeling.
 */
export function phaseFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Idle breathing. Volume-preserving: it widens exactly as much as it shortens. */
export function breathe(t: number, phi: number, flying: boolean): { sx: number; sy: number } {
  const sy = flying
    ? 1 + Math.sin(t * 3.1 + phi * 5) * 0.02
    : 1 + Math.sin(t * 2.0 + phi * 5) * 0.028;
  return { sx: 1 - (sy - 1) * 0.7, sy };
}

/** A 130ms blink roughly every 3.4s. */
export function isBlinking(t: number, phi: number): boolean {
  return ((t * 1000 + phi * 1700) % 3400) < 130;
}

/**
 * Which way the eyes point: -1 left, 0 centre, 1 right. With a target beyond
 * 40px the creature looks at it; otherwise a slow sine drifts the gaze around.
 */
export function gaze(t: number, phi: number, lookAt?: number, selfX?: number): -1 | 0 | 1 {
  if (lookAt != null && selfX != null && Math.abs(lookAt - selfX) > 40) {
    return lookAt > selfX ? 1 : -1;
  }
  const lk = Math.sin(t * 0.62 + phi * 2.3);
  return lk > 0.55 ? 1 : lk < -0.55 ? -1 : 0;
}

/**
 * One hop of the 2.6s cycle: anticipation squash, an arc, then a landing squash
 * that recovers. `landedAt` names the moment of the most recent landing so the
 * caller can fire exactly one puff per cycle.
 */
export function hopState(t: number, t0: number): { dy: number; sy: number; landedAt: number | null } {
  const elapsed = t - t0;
  if (elapsed < 0) return { dy: 0, sy: 1, landedAt: null };

  const p = elapsed % HOP_CYCLE;

  // One formula for the landing moment, computed the same way in every branch.
  // Deriving it per-branch instead lets float error make two expressions for the
  // same instant disagree, and the caller then fires a second puff for one hop.
  const completed = Math.floor((elapsed - HOP_ANTICIPATE - HOP_AIRBORNE) / HOP_CYCLE);
  const landedAt = completed >= 0 ? t0 + completed * HOP_CYCLE + HOP_ANTICIPATE + HOP_AIRBORNE : null;

  if (p < HOP_ANTICIPATE) {
    return { dy: 0, sy: 1 - 0.16 * (p / HOP_ANTICIPATE), landedAt };
  }

  if (p < HOP_ANTICIPATE + HOP_AIRBORNE) {
    const q = (p - HOP_ANTICIPATE) / HOP_AIRBORNE;
    return { dy: -Math.sin(q * Math.PI) * HOP_HEIGHT, sy: 1.07, landedAt };
  }

  const q = clamp((p - HOP_ANTICIPATE - HOP_AIRBORNE) / HOP_RECOVER, 0, 1);
  return { dy: 0, sy: 0.84 + 0.16 * q, landedAt };
}

/** Wing flap in degrees, mirrored per side by the caller. */
export function wingAngle(t: number, phi: number): number {
  return Math.sin(t * 16 + phi * 3) * 26 - 8;
}

/**
 * How far a grounded villager has ambled from its home spot, in pixels along
 * the row. Two slow incommensurate sines: their sum meanders instead of
 * metronoming, so the stroll never repeats on a readable beat and never
 * exceeds the leash the layout granted (the /1.5 normalises the sum's peak
 * to exactly the amplitude). Frequencies are pixels-per-second slow — the
 * drift reads as strolling, not sliding.
 */
export function wanderOffset(t: number, phi: number, amplitude: number): number {
  return (
    (amplitude * (Math.sin(t * 0.19 + phi * 7) + 0.5 * Math.sin(t * 0.311 + phi * 13))) / 1.5
  );
}

/** The shadow narrows as the creature rises. This is what sells the hop as real. */
export function shadowSquash(dy: number): number {
  return clamp(1 + dy / 130, 0.55, 1);
}

/** The classic overshoot ease the trailer uses for speech bubbles. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Spec §4.2: bubbles pop in on easeOutBack over 0.38s, shrink out over 0.28s. */
export function bubbleScale(age: number, lifetime: number): number {
  if (age <= 0) return 0;
  if (age >= lifetime) return 0;
  if (age < BUBBLE_IN) return easeOutBack(age / BUBBLE_IN);
  const untilEnd = lifetime - age;
  if (untilEnd < BUBBLE_OUT) return clamp(untilEnd / BUBBLE_OUT, 0, 1);
  return 1;
}

/** Reading time: quick for a quip, capped for a ramble. */
export function bubbleLifetime(text: string): number {
  return clamp(2 + text.length / 25, 2.5, 7);
}
