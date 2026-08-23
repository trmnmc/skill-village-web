import type { PaletteId } from './palettes.js';
import type { DayPlan } from './timeline.js';

const SPECIALS: PaletteId[] = ['1c', '1d', '1e', '1f'];

/** ISO-8601 week number (local dates; the village lives on the wall clock). */
export function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day + 3); // the week's Thursday decides the year
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(jan4.getFullYear(), 0, 4 - jan4Day);
  return 1 + Math.round((d.getTime() - week1Mon.getTime()) / (7 * 86400000));
}

/**
 * Monotonic week index from 2024-01-01 (a Monday at local midnight).
 * Ensures week numbers always increment across calendar years, so consecutive
 * Saturdays/Sundays never share a palette even at year boundaries (unlike isoWeek,
 * which resets to 1 annually and would cause palette repeats modulo 4).
 */
function weekIndex(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day); // Move to the Monday of this week at local midnight
  const base = new Date(2024, 0, 1); // 2024-01-01 was a Monday
  return Math.round((d.getTime() - base.getTime()) / (7 * 86400000));
}

/**
 * Spec §3: weekday weave, ISO-week-rotating weekend singles (Sat != Sun,
 * Sat != last Sat), one seeded surprise weekday per week. Deterministic:
 * same date, same plan, every reload, every tab.
 *
 * Uses monotonic weekIndex (not isoWeek) for palette rotations to ensure
 * consecutive weekend days never share a palette, even across year boundaries.
 */
export function planForDate(date: Date): DayPlan {
  const dow = date.getDay(); // 0=Sun..6=Sat
  const week = weekIndex(date);
  if (dow === 6) return { kind: 'single', palette: SPECIALS[week % 4]! };
  if (dow === 0) return { kind: 'single', palette: SPECIALS[(week + 2) % 4]! };
  const surpriseDow = 1 + ((week * 7 + 3) % 5); // Mon..Fri
  if (dow === surpriseDow) return { kind: 'single', palette: SPECIALS[(week + 1) % 4]! };
  return { kind: 'weave' };
}
