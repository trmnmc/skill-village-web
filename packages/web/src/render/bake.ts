import type { ComposedGrid } from './compose.js';
import type { RoleMap } from './roles.js';

export interface BakedPixels {
  w: number;
  h: number;
  /** RGBA, row-major, one pixel per grid cell. */
  data: Uint8ClampedArray;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Turn a composed grid into raw RGBA at one pixel per cell. No DOM: the caller
 * puts this on a canvas and scales it by U with nearest-neighbour filtering,
 * which is what keeps the edges crisp.
 */
export function bakePixels(grid: ComposedGrid, map: RoleMap): BakedPixels {
  const data = new Uint8ClampedArray(grid.w * grid.h * 4);

  for (let y = 0; y < grid.h; y++) {
    const row = grid.rows[y] ?? '';
    for (let x = 0; x < grid.w; x++) {
      const colour = map[row[x] ?? '.'];
      if (!colour) continue; // transparent, and unknown roles fail safe here
      const [r, g, b] = hexToRgb(colour);
      const i = (y * grid.w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  return { w: grid.w, h: grid.h, data };
}
