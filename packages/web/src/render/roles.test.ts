import { describe, it, expect } from 'vitest';
import { INK, derivePalette, HUES } from '@village/core';
import { roleMap } from './roles.js';

const palette = derivePalette(HUES[0]!);

describe('roleMap', () => {
  it('paints body pixels in the creature hue', () => {
    expect(roleMap(palette).X).toBe(palette.hue);
  });

  it('paints feet in the body hue, not a darker shade', () => {
    // Spec §4: D stays a semantic marker but renders in the body colour.
    expect(roleMap(palette).D).toBe(palette.hue);
  });

  it('paints accents in the light shade', () => {
    expect(roleMap(palette).A).toBe(palette.lite);
  });

  it('uses the two shared inks, which never vary by creature', () => {
    const other = roleMap(derivePalette(HUES[3]!));
    expect(roleMap(palette).W).toBe(INK.eyeWhite);
    expect(roleMap(palette).K).toBe(INK.mouth);
    expect(other.W).toBe(INK.eyeWhite);
    expect(other.K).toBe(INK.mouth);
  });

  it('maps transparent to null so the painter can skip it', () => {
    expect(roleMap(palette)['.']).toBeNull();
  });

  it('covers every legal role', () => {
    const map = roleMap(palette);
    for (const role of ['X', 'D', 'W', 'K', 'A', '.']) {
      expect(role in map, `missing role ${role}`).toBe(true);
    }
  });
});
