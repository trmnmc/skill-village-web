import { describe, it, expect } from 'vitest';
import { PALETTES, mix, lite, relLuminance, contrast } from './palettes.js';
import { isHex } from '../theme.js';

describe('PALETTES', () => {
  it('holds all six palettes with four 3-band skies each', () => {
    const ids = Object.keys(PALETTES).sort();
    expect(ids).toEqual(['1a', '1b', '1c', '1d', '1e', '1f']);
    for (const p of Object.values(PALETTES)) {
      for (const frame of ['dawn', 'day', 'dusk', 'night'] as const) {
        expect(p.skies[frame]).toHaveLength(3);
        for (const c of p.skies[frame]) expect(isHex(c)).toBe(true);
      }
      expect(isHex(p.ink) && isHex(p.cream) && isHex(p.ground)).toBe(true);
    }
  });

  it('1a matches the game today (THEME continuity)', () => {
    expect(PALETTES['1a'].skies.day[1]).toBe('#CFE9F5');
    expect(PALETTES['1a'].ground).toBe('#A8C68D');
    expect(PALETTES['1a'].ink).toBe('#3A2E22');
  });
});

describe('mix', () => {
  it('lerps channelwise and clamps to hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5).toLowerCase()).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1).toLowerCase()).toBe('#ffffff');
  });
});

describe('lite', () => {
  it('is a 32% mix toward white, matching the reference', () => {
    expect(lite('#e58c68')).toBe(mix('#e58c68', '#ffffff', 0.32));
  });
});

describe('relLuminance and contrast', () => {
  it('anchors to the WCAG endpoints', () => {
    expect(relLuminance('#000000')).toBe(0);
    expect(relLuminance('#FFFFFF')).toBeCloseTo(1, 10);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('is symmetric, and 1 for a colour against itself', () => {
    expect(contrast('#525C64', '#7F8E98')).toBeCloseTo(contrast('#7F8E98', '#525C64'), 10);
    expect(contrast('#404040', '#404040')).toBe(1);
  });
});
