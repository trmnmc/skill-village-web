import { WORLD_W } from '../layout/zones.js';

/**
 * The village is drawn zoomed in: creatures read bigger, and the frame holds
 * field instead of sky and bare foreground. Every screen↔world conversion in
 * the scene must go through the helpers below — KAPLAY's camera multiplies
 * world offsets by this on the way to the screen, so raw cursor math lands
 * wide of its target by exactly this factor.
 */
export const ZOOM = 1.2;

/** The world x under a screen x, for a camera centred at `camX`. */
export function screenToWorld(screenX: number, camX: number, viewportW: number): number {
  return camX + (screenX - viewportW / 2) / ZOOM;
}

/**
 * Clamp a camera x so the visible slice — viewport / ZOOM world pixels wide —
 * stays inside the world strip.
 */
export function clampCamX(x: number, viewportW: number): number {
  const half = viewportW / 2 / ZOOM;
  return Math.min(WORLD_W - half, Math.max(half, x));
}
