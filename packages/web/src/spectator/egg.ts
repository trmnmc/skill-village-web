import { bakePixels, type BakedPixels } from '../render/bake.js';
import { THEME } from '../theme.js';
import type { ComposedGrid } from '../render/compose.js';

/** The nursery egg, 9x11: `X` shell, `A` spots in the future creature's hue. */
export const EGG_ROWS: readonly string[] = [
  '...XXX...',
  '..XXXXX..',
  '.XXXXXXX.',
  '.XXXXAXX.',
  'XXAXXXXXX',
  'XXXXXXXXX',
  'XXXXXAXXX',
  '.XAXXXXX.',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
];

export function bakeEgg(spotHex: string): BakedPixels {
  const grid: ComposedGrid = {
    w: 9,
    h: 11,
    rows: EGG_ROWS as string[],
    eyes: [{ c: 0, r: 0 }, { c: 0, r: 0 }],
    crownRows: 0,
  };
  return bakePixels(grid, { X: THEME.signCream, A: spotHex });
}
