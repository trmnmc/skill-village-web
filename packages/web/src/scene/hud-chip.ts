export interface HudChipBounds { x: number; y: number; w: number; h: number }

/** The HUD's fixed layout, as village.ts places it: x=12, first line y=12,
 * 20px pitch, 14px mono glyphs. The chip is the cream backing that keeps the
 * lines readable when a storm deck drifts behind them. */
const HUD_X = 12;
const HUD_Y = 12;
const LINE_PITCH = 20;
const LINE_H = 14;

export const HUD_CHIP_PAD = 6;

/** Width comes from character count, not the engine's text measure — the
 * KAPLAY .width getter fluctuates across frames (font swap, supersampling,
 * devicePixelRatio), and a chip sized from it never sits still. IBM Plex
 * Mono's advance is 0.6em (8.4px at 14px), but KAPLAY's supersampled glyph
 * atlas pads each cell: measured on screen, a 14px HUD glyph advances 9px. */
export const HUD_CHAR_W = 9;

/**
 * Bounds for the backing chip, hugging the longest visible line and stopping
 * at the last non-empty one — a hidden voice meter must not leave the chip
 * hanging below the text (boxes hug text, never slab). Null when there is
 * nothing to back.
 */
export function hudChipRect(lines: readonly string[]): HudChipBounds | null {
  let last = -1;
  let maxChars = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (len > 0) {
      last = i;
      maxChars = Math.max(maxChars, len);
    }
  }
  if (last < 0) return null;
  return {
    x: HUD_X - HUD_CHIP_PAD,
    y: HUD_Y - HUD_CHIP_PAD,
    w: maxChars * HUD_CHAR_W + HUD_CHIP_PAD * 2,
    h: last * LINE_PITCH + LINE_H + HUD_CHIP_PAD * 2,
  };
}
