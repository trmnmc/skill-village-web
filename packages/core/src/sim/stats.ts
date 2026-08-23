import type { Stage, Stats } from '../types.js';

/**
 * The resting baseline mood and energy settle at while the player is away —
 * approached from above by a well-tended creature and from below by a drained
 * one, because rest restores. Deliberately ABOVE behaviour.ts's SLEEP_BELOW:
 * an untended village should doze and look scruffy, never fall into a
 * permanent coma it has no way to wake from.
 */
export const STAT_FLOOR = 30;
export const STAT_MAX = 100;

/**
 * Exponential relaxation toward STAT_FLOOR with a 12-hour half life puts a creature within about
 * 1.5 points of the floor after three days, which is the spec's "scruffy after
 * roughly three days" without ever crossing into loss.
 */
export const DECAY_HALF_LIFE_HOURS = 12;

/** Adults become elders here. */
export const ELDER_LEVEL = 10;

/** Total xp required to reach a level. Level 1 is free; the curve is quadratic. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 50 * (n - 1) * (n - 1);
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export function decayStat(value: number, hoursAway: number): number {
  if (hoursAway < 0) throw new Error(`decayStat: hoursAway must not be negative, got ${hoursAway}`);
  const remaining = Math.pow(0.5, hoursAway / DECAY_HALF_LIFE_HOURS);
  return STAT_FLOOR + (value - STAT_FLOOR) * remaining;
}

/** Bond and xp are never touched: the game only ever moves them upward. */
export function decayStats(stats: Stats, hoursAway: number): Stats {
  return {
    ...stats,
    mood: decayStat(stats.mood, hoursAway),
    energy: decayStat(stats.energy, hoursAway),
  };
}

export type CareVerb = 'pet' | 'play' | 'chat' | 'train';

interface CareEffect {
  mood: number;
  energy: number;
  bond: number;
  xp: number;
}

/**
 * Training gives the most xp because it is the only verb that improves the real
 * file on disk; playing costs energy because it is the only physical one.
 */
const CARE_EFFECTS: Record<CareVerb, CareEffect> = {
  pet: { mood: 4, energy: 0, bond: 2, xp: 1 },
  play: { mood: 9, energy: -6, bond: 4, xp: 3 },
  chat: { mood: 6, energy: -1, bond: 6, xp: 5 },
  train: { mood: 8, energy: -3, bond: 8, xp: 25 },
};

const clamp = (v: number) => Math.min(STAT_MAX, Math.max(0, v));

export function applyCare(stats: Stats, verb: CareVerb): Stats {
  const effect = CARE_EFFECTS[verb];
  return {
    mood: clamp(stats.mood + effect.mood),
    energy: clamp(stats.energy + effect.energy),
    bond: clamp(stats.bond + effect.bond),
    xp: stats.xp + effect.xp,
  };
}

/**
 * Stage only ever advances. A hatchling becomes an adult when its file lands on
 * disk — that is the moment it stops being a draft and starts being a real tool.
 */
export function nextStage(current: Stage, level: number, fileInstalled: boolean): Stage {
  if (current === 'elder') return 'elder';
  // Hatching is an explicit player action (starting the interview), not something
  // stats can trigger, so an egg is never promoted here.
  if (current === 'egg') return 'egg';
  if (current === 'hatchling') return fileInstalled ? 'adult' : 'hatchling';
  return level >= ELDER_LEVEL ? 'elder' : 'adult';
}
