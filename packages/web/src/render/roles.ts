import { INK, type Palette } from '@village/core/visual';

/** Role character to colour, or null for "draw nothing". */
export type RoleMap = Record<string, string | null>;

/**
 * One creature's colours. `D` deliberately resolves to the body hue: it marks
 * feet so a future walk cycle can find them, but the contact shadow does the
 * grounding work a darker tone used to do (spec §4).
 */
export function roleMap(palette: Palette): RoleMap {
  return {
    X: palette.hue,
    D: palette.hue,
    A: palette.lite,
    W: INK.eyeWhite,
    K: INK.mouth,
    '.': null,
  };
}
