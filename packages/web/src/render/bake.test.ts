import { describe, it, expect } from 'vitest';
import { derivePalette, HUES } from '@village/core';
import { bakePixels, hexToRgb } from './bake.js';
import { roleMap } from './roles.js';
import type { ComposedGrid } from './compose.js';

const palette = derivePalette(HUES[0]!);
const map = roleMap(palette);

const tiny: ComposedGrid = {
  rows: ['X.', 'WK'],
  w: 2,
  h: 2,
  eyes: [{ c: 0, r: 0 }, { c: 1, r: 0 }],
  crownRows: 0,
};

function pixelAt(baked: { w: number; data: Uint8ClampedArray }, x: number, y: number) {
  const i = (y * baked.w + x) * 4;
  return [baked.data[i], baked.data[i + 1], baked.data[i + 2], baked.data[i + 3]];
}

describe('hexToRgb', () => {
  it('parses a six-digit hex', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#D97757')).toEqual([217, 119, 87]);
  });

  it('is case insensitive', () => {
    expect(hexToRgb('#d97757')).toEqual(hexToRgb('#D97757'));
  });
});

describe('bakePixels', () => {
  it('produces one RGBA quad per grid cell', () => {
    const baked = bakePixels(tiny, map);
    expect(baked.w).toBe(2);
    expect(baked.h).toBe(2);
    expect(baked.data.length).toBe(2 * 2 * 4);
  });

  it('paints a body pixel opaque in the creature hue', () => {
    const baked = bakePixels(tiny, map);
    const [r, g, b, a] = pixelAt(baked, 0, 0);
    expect([r, g, b]).toEqual(hexToRgb(palette.hue));
    expect(a).toBe(255);
  });

  it('leaves a transparent cell fully transparent', () => {
    const baked = bakePixels(tiny, map);
    expect(pixelAt(baked, 1, 0)[3]).toBe(0);
  });

  it('paints eye white and mouth ink', () => {
    const baked = bakePixels(tiny, map);
    expect(pixelAt(baked, 0, 1).slice(0, 3)).toEqual(hexToRgb(map.W!));
    expect(pixelAt(baked, 1, 1).slice(0, 3)).toEqual(hexToRgb(map.K!));
  });

  it('treats an unknown role as transparent rather than throwing', () => {
    const odd: ComposedGrid = { ...tiny, rows: ['?.', '..'] };
    expect(pixelAt(bakePixels(odd, map), 0, 0)[3]).toBe(0);
  });

  it('is deterministic', () => {
    expect(Array.from(bakePixels(tiny, map).data))
      .toEqual(Array.from(bakePixels(tiny, map).data));
  });
});
