import { STAT_FLOOR } from './stats.js';

export const DAY_MS = 86_400_000;

/** Worked within a day: thriving — above behaviour.ts's hop thresholds. */
export const THRIVING_MOOD = 85;
export const THRIVING_DAYS = 1;
/** Worked within a week: content — awake, not bouncing. */
export const CONTENT_MOOD = 60;
export const CONTENT_DAYS = 7;
/** Past a week the droop relaxes toward STAT_FLOOR on this half-life. */
export const DROOP_HALF_LIFE_DAYS = 5;

export interface WorkStats {
  mood: number;
  energy: number;
}

/**
 * A project's mood and energy as a pure function of how long since Claude
 * last worked in it (remap spec §5). Only real work heals — care never moves
 * these two. Tunable constants, not state: retuning this curve must never
 * need a migration, which is why callers derive at tick time and the stored
 * stats are only a cache of this function.
 *
 * Negative input (a clock that jumped backwards) reads as freshly worked,
 * matching applyTick's no-free-mood clamp in spirit: never punish, never
 * reward, a clock correction.
 */
export function workStats(msSinceWorked: number): WorkStats {
  const days = Math.max(0, msSinceWorked) / DAY_MS;
  let mood: number;
  if (days <= THRIVING_DAYS) {
    mood = THRIVING_MOOD;
  } else if (days <= CONTENT_DAYS) {
    const t = (days - THRIVING_DAYS) / (CONTENT_DAYS - THRIVING_DAYS);
    mood = THRIVING_MOOD + (CONTENT_MOOD - THRIVING_MOOD) * t;
  } else {
    const past = days - CONTENT_DAYS;
    mood = STAT_FLOOR + (CONTENT_MOOD - STAT_FLOOR) * Math.pow(0.5, past / DROOP_HALF_LIFE_DAYS);
  }
  return { mood, energy: Math.max(STAT_FLOOR, mood - 5) };
}
