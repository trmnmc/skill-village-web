import { describe, it, expect } from 'vitest';
import { THEME, U, isHex } from './theme.js';

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

describe('THEME', () => {
  it('carries the ground and ink values from the spec', () => {
    expect(THEME.night).toBe('#171310');
    expect(THEME.ink).toBe('#3A2E22');
    expect(THEME.signCream).toBe('#F2E5C4');
    expect(THEME.bubbleWhite).toBe('#FFFDF4');
    expect(THEME.wood).toBe('#8A6B4A');
  });

  it('carries the single clay accent', () => {
    expect(THEME.accent).toBe('#D97757');
  });

  it('carries the nature greens', () => {
    expect(THEME.foliage).toBe('#7FA85F');
    expect(THEME.foliageLite).toBe('#8FB86B');
    expect(THEME.moss).toBe('#9DBA77');
  });

  it('is all well-formed hex', () => {
    for (const [name, value] of Object.entries(THEME)) {
      expect(isHex(value), `${name} = ${value}`).toBe(true);
    }
  });

  it('is frozen, so a scene cannot scribble on the palette', () => {
    expect(Object.isFrozen(THEME)).toBe(true);
  });
});

describe('U', () => {
  it('is a whole number of pixels, so grids land on pixel boundaries', () => {
    expect(Number.isInteger(U)).toBe(true);
    expect(U).toBe(6);
  });
});
