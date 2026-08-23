import { describe, it, expect } from 'vitest';
import { tokenTag, sceneryColor, creatureTintColor, creatureOverlayColor } from './retint.js';
import { mix } from '../theme/palettes.js';
import type { Tokens } from '../theme/store.js';

const tokens: Tokens = {
  sky0: '#C4E4F4', sky1: '#CFE9F5', sky2: '#DFF0EC',
  ground: '#A8C68D', groundDark: '#8FB075',
  cream: '#F2E5C4', bubble: '#FFFDF4', ink: '#3A2E22', wood: '#8A6B4A', accent: '#D97757',
  foliage: '#7FA85F', foliageLite: '#8FB86B',
  houseAWall: '#F2E5C4', houseARoof: '#D97757', houseBWall: '#E8D3EE', houseBRoof: '#B39DDB',
};

describe('tokenTag', () => {
  it('namespaces a token name as a KAPLAY tag', () => {
    expect(tokenTag('sky1')).toBe('themed:sky1');
  });
});

describe('sceneryColor', () => {
  it('mixes the token toward the tint colour by sceneryK', () => {
    const tint = { col: '#232A3C', sceneryK: 0.55, creatureK: 0.28 };
    expect(sceneryColor(tokens, tint, 'ground')).toBe(mix('#A8C68D', '#232A3C', 0.55));
  });

  it('returns the raw token at day, when sceneryK is 0', () => {
    const tint = { col: '#232A3C', sceneryK: 0, creatureK: 0 };
    expect(sceneryColor(tokens, tint, 'ground')).toBe(tokens.ground);
  });
});

describe('creatureTintColor', () => {
  it('mixes white toward the tint colour by creatureK', () => {
    const tint = { col: '#232A3C', sceneryK: 0.55, creatureK: 0.28 };
    expect(creatureTintColor(tint)).toBe(mix('#FFFFFF', '#232A3C', 0.28));
  });

  it('returns pure white at day, when creatureK is 0', () => {
    const tint = { col: '#232A3C', sceneryK: 0, creatureK: 0 };
    expect(creatureTintColor(tint)).toBe('#FFFFFF');
  });
});

describe('creatureOverlayColor', () => {
  it('is a no-op in daylight, when the tint multiplier is white', () => {
    expect(creatureOverlayColor('#E58C68', { col: '#1C2130', creatureK: 0 })).toBe('#E58C68');
  });

  it('darkens an overlay by exactly the multiply the body sprite receives', () => {
    const tint = { col: '#1C2130', creatureK: 0.28 };
    const factor = creatureTintColor(tint);
    const f = (i: number) => parseInt(factor.slice(1 + i * 2, 3 + i * 2), 16);
    const got = creatureOverlayColor('#FFFFFF', tint);
    // A white overlay lands exactly on the multiplier itself.
    for (let i = 0; i < 3; i++) {
      expect(parseInt(got.slice(1 + i * 2, 3 + i * 2), 16)).toBe(f(i));
    }
  });

  it('never brightens: a tinted overlay is always at or below its own hue', () => {
    const tint = { col: '#1C2130', creatureK: 0.55 };
    const got = creatureOverlayColor('#E58C68', tint);
    for (let i = 0; i < 3; i++) {
      expect(parseInt(got.slice(1 + i * 2, 3 + i * 2), 16)).toBeLessThanOrEqual(
        parseInt('#E58C68'.slice(1 + i * 2, 3 + i * 2), 16),
      );
    }
  });
});
