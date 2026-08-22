import { describe, it, expect } from 'vitest';
import { HUES, derivePalette, hexToHsl, hslToHex, hueForAgentColor } from './palette.js';

describe('hex/hsl round trip', () => {
  it.each(HUES)('%s survives a round trip within one unit per channel', (hex) => {
    const [h, s, l] = hexToHsl(hex);
    const back = hexToHsl(hslToHex(h, s, l));
    expect(Math.abs(back[0] - h)).toBeLessThan(1);
    expect(Math.abs(back[1] - s)).toBeLessThan(1);
    expect(Math.abs(back[2] - l)).toBeLessThan(1);
  });

  it('produces lowercase six-digit hex', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });
});

describe('derivePalette', () => {
  it.each(HUES)('%s yields lite lighter than hue, and dark darker', (hex) => {
    const p = derivePalette(hex);
    const l = (c: string) => hexToHsl(c)[2];
    expect(l(p.lite)).toBeGreaterThan(l(p.hue));
    expect(l(p.dark)).toBeLessThan(l(p.hue));
  });

  it('keeps the hue channel stable across all three shades', () => {
    for (const hex of HUES) {
      const p = derivePalette(hex);
      const [h] = hexToHsl(p.hue);
      expect(Math.abs(hexToHsl(p.lite)[0] - h)).toBeLessThan(2);
      expect(Math.abs(hexToHsl(p.dark)[0] - h)).toBeLessThan(2);
    }
  });

  it('never produces a shade outside 0-100 lightness, even at the extremes', () => {
    for (const hex of ['#000000', '#ffffff', ...HUES]) {
      const p = derivePalette(hex);
      for (const shade of [p.hue, p.lite, p.dark]) {
        const [, s, l] = hexToHsl(shade);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(100);
        expect(s).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('agent colour mapping', () => {
  it('maps every Claude Code agent colour onto a curated hue', () => {
    for (const name of ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']) {
      expect(HUES).toContain(hueForAgentColor(name));
    }
  });

  it('returns null for an unknown or missing colour so the caller falls back to DNA', () => {
    expect(hueForAgentColor('chartreuse')).toBeNull();
    expect(hueForAgentColor(undefined)).toBeNull();
  });

  it('is case insensitive', () => {
    expect(hueForAgentColor('BLUE')).toBe(hueForAgentColor('blue'));
  });
});
