import { mix } from '../theme/palettes.js';
import type { Tokens } from '../theme/store.js';

/** A KAPLAY tag naming which token a scenery object's fill colour follows. */
export function tokenTag(token: keyof Tokens): string {
  return `themed:${token}`;
}

/**
 * A scenery object's fill colour: the palette token, pulled toward the
 * current tint colour by however much the frame's `sceneryK` calls for (0 at
 * day, up to the frame's ceiling at night/dusk/dawn — see `TINT_K` in
 * theme/store.ts).
 */
export function sceneryColor(
  tokens: Tokens,
  tint: { col: string; sceneryK: number },
  token: keyof Tokens,
): string {
  return mix(tokens[token], tint.col, tint.sceneryK);
}

/**
 * The multiply tint every creature sprite wears: white pulled toward the
 * tint colour by `creatureK`, so a sprite's baked texels darken toward the
 * sky's own tint at night instead of every creature drawing full-bright
 * against a dim village.
 */
export function creatureTintColor(tint: { col: string; creatureK: number }): string {
  return mix('#FFFFFF', tint.col, tint.creatureK);
}

/**
 * A creature *overlay's* fill colour: the flat shade a solid rect has to be
 * drawn in so it lands exactly where the body sprite's own texels land under
 * the multiply tint.
 *
 * A sprite wears the tint as a multiplier over a baked texel; a solid rect has
 * no texel for the multiplier to act on, so the multiply has to happen here.
 * Without it an overlay stays full-bright while the body around it darkens —
 * which is what made shut eyelids read as pale patches once the village
 * started sleeping through the night.
 */
export function creatureOverlayColor(hex: string, tint: { col: string; creatureK: number }): string {
  const factor = creatureTintColor(tint);
  const channel = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round((channel(hex, i) * channel(factor, i)) / 255));
  return `#${out.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}
