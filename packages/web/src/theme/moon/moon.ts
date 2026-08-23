import { computeMoon } from './astro.js';

export interface MoonView { phaseName: string; illumination: number; waxing: boolean }

/** The night sky's moon: real phase, hemisphere handled at render time. */
export function moonForDate(date: Date): MoonView {
  const m = computeMoon(date);
  return { phaseName: m.phaseName, illumination: m.illumination, waxing: m.cycleFraction < 0.5 };
}

/** 0 = full-moon silver night, 1 = new-moon black; modulates stars/fireflies. */
export function nightDarkness(illumination: number): number {
  return 1 - Math.max(0, Math.min(1, illumination));
}
