import type { DreamSketch, GalleryState, PeddlerCase } from './types.js';

export const CASE_SIZE = 5;

/** You cannot pick the ugliest of one. Below this, the peddler stays home. */
export const MIN_JUDGEABLE_CASE = 2;

export interface RefillPlan {
  /** Veterans of earlier visits, still in the case. */
  carried: DreamSketch[];
  /** How many fresh sketches to ask the artist for. */
  freshNeeded: number;
  /** True when today's case already exists — do nothing, spend nothing. */
  ready: boolean;
}

/**
 * The whole day-boundary policy. Two behaviours here are load-bearing:
 *
 *  - A case dated today is never rebuilt, judged or not. Without this a server
 *    restart would draw a fresh case on every boot and bill the player for it.
 *  - An unjudged case carries forward whole. No verdict means nothing changed,
 *    so there is nothing to regenerate and nothing to spend — the player simply
 *    gets the same five sketches next visit.
 */
export function planRefill(gallery: GalleryState, today: string): RefillPlan {
  const current = gallery.case;
  if (current && current.day === today) {
    return { carried: current.sketches, freshNeeded: 0, ready: true };
  }
  const carried = current ? current.sketches : [];
  return { carried, freshNeeded: Math.max(0, CASE_SIZE - carried.length), ready: false };
}

/** Veterans first, then whatever the artist managed. Null when there is no round to play. */
export function openCase(
  carried: DreamSketch[],
  fresh: DreamSketch[],
  today: string,
): PeddlerCase | null {
  const sketches = [...carried, ...fresh].slice(0, CASE_SIZE);
  if (sketches.length < MIN_JUDGEABLE_CASE) return null;
  return { day: today, sketches, judged: false };
}

/** Presence is derived, never stored: a judged case means the visitor has moved on. */
export function peddlerIsVisiting(gallery: GalleryState, today: string): boolean {
  const current = gallery.case;
  return Boolean(current && current.day === today && !current.judged);
}
