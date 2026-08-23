import type { Frame, PaletteId } from './palettes.js';

export type DayPlan = { kind: 'weave' } | { kind: 'single'; palette: PaletteId };
export interface Keyframe {
  atMin: number;
  palette: PaletteId;
  frame: Frame;
  /**
   * Pull this keyframe's sky toward the Kelvin daylight reference. Set only on
   * a single-palette day's `day` keyframes: those days would otherwise hold a
   * special palette's own noon — Marigold's pale yellow, Berry Dusk's lilac —
   * straight through the hours the spec reserves for the 5500–6500K daylight
   * plateau. The weave's own `1b` day keyframe is deliberately NOT flagged: it
   * is the spec's ~4300K warm-white morning, a Kelvin step in its own right.
   */
  daylight?: boolean;
}
export interface SolarAnchors { sunriseMin: number; sunsetMin: number }

export const DEFAULT_ANCHORS: SolarAnchors = { sunriseMin: 405, sunsetMin: 1125 };

/** The last keyframe a plan ends its day on — what midnight blends from. */
function finalNight(plan: DayPlan): { palette: PaletteId; frame: Frame } {
  return plan.kind === 'weave' ? { palette: '1a', frame: 'night' } : { palette: plan.palette, frame: 'night' };
}

/**
 * The day's color keyframes (spec §2), offsets hung off the solar anchors so
 * Real mode's true sunrise/sunset shift the whole curve. Keyframes only mark
 * where a blend ENDS; between equal neighbors the sky holds (the plateaus).
 */
export function buildTimeline(plan: DayPlan, prevPlan: DayPlan, anchors: SolarAnchors = DEFAULT_ANCHORS): Keyframe[] {
  const { sunriseMin: r, sunsetMin: s } = anchors;
  const prev = finalNight(prevPlan);
  if (plan.kind === 'weave') {
    return [
      { atMin: -180, ...prev },
      { atMin: r - 75, palette: '1a', frame: 'night' },
      { atMin: r - 35, palette: '1a', frame: 'dawn' },
      { atMin: r, palette: '1b', frame: 'dawn' },
      { atMin: r + 35, palette: '1b', frame: 'day' },
      { atMin: r + 105, palette: '1a', frame: 'day' },
      { atMin: s - 120, palette: '1a', frame: 'day' },
      { atMin: s - 60, palette: '1a', frame: 'dusk' },
      { atMin: s, palette: '1b', frame: 'dusk' },
      { atMin: s + 35, palette: '1b', frame: 'night' },
      { atMin: s + 135, palette: '1a', frame: 'night' },
    ];
  }
  const p = plan.palette;
  return [
    { atMin: -180, ...prev },
    { atMin: r - 75, ...prev },
    { atMin: r, palette: p, frame: 'dawn' },
    { atMin: r + 105, palette: p, frame: 'day', daylight: true },
    { atMin: s - 120, palette: p, frame: 'day', daylight: true },
    { atMin: s, palette: p, frame: 'dusk' },
    { atMin: s + 135, palette: p, frame: 'night' },
  ];
}

/** Neighboring keyframes around a minute, with blend progress t in [0,1]. */
export function sampleTimeline(frames: Keyframe[], minuteOfDay: number): { a: Keyframe; b: Keyframe; t: number } {
  let a = frames[0]!, b = frames[frames.length - 1]!;
  if (minuteOfDay <= a.atMin) return { a, b: a, t: 0 };
  for (let i = 1; i < frames.length; i++) {
    if (minuteOfDay <= frames[i]!.atMin) {
      a = frames[i - 1]!; b = frames[i]!;
      const span = b.atMin - a.atMin;
      return { a, b, t: span <= 0 ? 1 : (minuteOfDay - a.atMin) / span };
    }
  }
  return { a: b, b, t: 0 }; // after the last anchor: hold deep night
}
