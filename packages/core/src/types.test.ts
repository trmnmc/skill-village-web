import { describe, it, expect } from 'vitest';
import { BODY_IDS, CROWN_IDS, REST_POSTURE_IDS } from './types.js';
import type { Creature } from './types.js';

describe('id lists', () => {
  it('has the six bodies from the spec, in a stable order', () => {
    expect(BODY_IDS).toEqual(['pip', 'round', 'lanky', 'bean', 'mound', 'boxy']);
  });

  it('has the five crowns from the spec, in a stable order', () => {
    expect(CROWN_IDS).toEqual(['none', 'ears', 'crest', 'tuft', 'horns']);
  });

  it('lists only resting postures, excluding the trailing motion state', () => {
    expect(REST_POSTURE_IDS).toEqual(['stubs', 'splayed', 'floating']);
    expect(REST_POSTURE_IDS).not.toContain('trailing');
  });
});

describe('cannedLines', () => {
  it('is optional, so every pre-M4 creature and fixture stays valid', () => {
    // Compile-time check: a creature built without cannedLines still satisfies
    // the type (this test file compiles under strict), and one built with it
    // carries the pool through.
    const bare: Creature = {
      id: 'skill:bare', kind: 'skill', name: 'bare', nickname: '',
      appearance: {
        body: 'round', crown: 'none',
        palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
        winged: false, restPosture: null,
      },
      stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
      stage: 'adult', personality: null, sourcePath: '/x', friendships: {}, lastSeenAt: 0,
    };
    expect(bare.cannedLines).toBeUndefined();
    const pooled: Creature = { ...bare, cannedLines: ['hello there'] };
    expect(pooled.cannedLines).toEqual(['hello there']);
  });
});
