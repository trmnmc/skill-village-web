import { describe, it, expect } from 'vitest';
import { hudChipRect, HUD_CHIP_PAD, HUD_CHAR_W } from './hud-chip.js';

// The HUD's three mono lines (status, villagers, voice) sit at x=12 with a
// 20px pitch and 14px glyphs. The chip is the cream backing that keeps them
// readable when a storm deck drifts behind them — it must hug the text
// (playtest law: boxes hug text, never slab). Widths come from character
// count × the mono advance, not from the engine's text measure: the KAPLAY
// .width getter fluctuates across frames (font swap, supersampling, dpr),
// and a chip that breathes with it would never sit still.

describe('hudChipRect', () => {
  it('hugs the longest visible line at the mono advance', () => {
    const r = hudChipRect(['live', '75 villagers', 'voice'])!;
    expect(r.w).toBe('75 villagers'.length * HUD_CHAR_W + HUD_CHIP_PAD * 2);
    expect(r.x).toBe(12 - HUD_CHIP_PAD);
    expect(r.y).toBe(12 - HUD_CHIP_PAD);
  });

  it('covers all three lines when all are visible', () => {
    const r = hudChipRect(['live', '75 villagers', 'voice ok'])!;
    // Third line starts at y=12+2*20=52 and is 14 tall.
    expect(r.y + r.h).toBe(52 + 14 + HUD_CHIP_PAD);
  });

  it('shrinks when the trailing voice line is hidden (empty text)', () => {
    const r = hudChipRect(['live', '75 villagers', ''])!;
    expect(r.y + r.h).toBe(32 + 14 + HUD_CHIP_PAD);
    expect(r.w).toBe('75 villagers'.length * HUD_CHAR_W + HUD_CHIP_PAD * 2);
  });

  it('is null when no line has any text', () => {
    expect(hudChipRect(['', '', ''])).toBeNull();
  });
});
