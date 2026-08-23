import { describe, expect, it } from 'vitest';
import { THEME } from './theme.js';
import { hexToRgb } from '../render/bake.js';
import { bakeEgg, EGG_ROWS } from './egg.js';

describe('EGG_ROWS', () => {
  it('is a well-formed 9x11 grid of X, A and dots', () => {
    expect(EGG_ROWS).toHaveLength(11);
    for (const row of EGG_ROWS) {
      expect(row).toHaveLength(9);
      expect(row).toMatch(/^[XA.]+$/);
    }
  });
});

describe('bakeEgg', () => {
  it('paints shell in signCream and spots in the given hue', () => {
    const baked = bakeEgg('#e0a3b2');
    expect(baked.w).toBe(9);
    expect(baked.h).toBe(11);
    const [sr, sg, sb] = hexToRgb(THEME.signCream);
    const [ar, ag, ab] = hexToRgb('#e0a3b2');
    const px = (x: number, y: number) => Array.from(baked.data.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 4));
    expect(px(4, 5)).toEqual([sr, sg, sb, 255]); // shell center
    expect(px(2, 4)).toEqual([ar, ag, ab, 255]); // an A spot
    expect(px(0, 0)).toEqual([0, 0, 0, 0]);      // corner is transparent
  });
});
