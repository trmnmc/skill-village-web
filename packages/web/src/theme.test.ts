import { describe, it, expect } from 'vitest';
import { U, TEXT_SS, isHex } from './theme.js';

describe('isHex', () => {
  it('accepts six-digit hex', () => {
    expect(isHex('#F2E5C4')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isHex('F2E5C4')).toBe(false);
    expect(isHex('#FFF')).toBe(false);
    expect(isHex('rebeccapurple')).toBe(false);
  });
});

describe('U', () => {
  it('is a whole number of pixels, so grids land on pixel boundaries', () => {
    expect(Number.isInteger(U)).toBe(true);
    expect(U).toBe(6);
  });
});

describe('TEXT_SS', () => {
  it('is a whole number, so downsampled glyphs land on pixel boundaries', () => {
    expect(Number.isInteger(TEXT_SS)).toBe(true);
    expect(TEXT_SS).toBeGreaterThan(1);
  });
});
