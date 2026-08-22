import { describe, it, expect } from 'vitest';
import { BODY_IDS, CROWN_IDS, REST_POSTURE_IDS } from '../types.js';
import { HUES } from './palette.js';
import { INCOMPATIBLE } from './grids.js';
import { generateAppearance } from './generate.js';

describe('generateAppearance', () => {
  it('is deterministic', () => {
    const a = generateAppearance({ kind: 'skill', name: 'code-review' });
    const b = generateAppearance({ kind: 'skill', name: 'code-review' });
    expect(a).toEqual(b);
  });

  it('only ever emits known bodies, crowns and hues', () => {
    for (let i = 0; i < 300; i++) {
      const a = generateAppearance({ kind: 'skill', name: `skill-${i}` });
      expect(BODY_IDS).toContain(a.body);
      expect(CROWN_IDS).toContain(a.crown);
      expect(HUES).toContain(a.palette.hue);
    }
  });

  it('marks agents as winged and skills as not', () => {
    expect(generateAppearance({ kind: 'agent', name: 'web-research' }).winged).toBe(true);
    expect(generateAppearance({ kind: 'skill', name: 'web-research' }).winged).toBe(false);
  });

  it('gives a resting posture only to winged lanky creatures', () => {
    let checkedWingedLanky = false;
    let checkedOther = false;
    for (let i = 0; i < 300; i++) {
      for (const kind of ['skill', 'agent'] as const) {
        const a = generateAppearance({ kind, name: `n-${i}` });
        if (a.winged && a.body === 'lanky') {
          expect(REST_POSTURE_IDS).toContain(a.restPosture);
          checkedWingedLanky = true;
        } else {
          expect(a.restPosture).toBeNull();
          checkedOther = true;
        }
      }
    }
    expect(checkedWingedLanky).toBe(true);
    expect(checkedOther).toBe(true);
  });

  it('uses the agent colour when it maps to a curated hue', () => {
    const a = generateAppearance({ kind: 'agent', name: 'x', agentColor: 'blue' });
    expect(a.palette.hue).toBe('#7fb6d9');
  });

  it('falls back to DNA when the agent colour is unknown', () => {
    const withJunk = generateAppearance({ kind: 'agent', name: 'x', agentColor: 'chartreuse' });
    const without = generateAppearance({ kind: 'agent', name: 'x' });
    expect(withJunk.palette.hue).toBe(without.palette.hue);
  });

  it('never emits a denied body+crown pair', () => {
    // Uses the real INCOMPATIBLE list, so this passes trivially while the list is
    // empty and becomes meaningful the moment the golden-set review adds entries.
    for (let i = 0; i < 300; i++) {
      const a = generateAppearance({ kind: 'skill', name: `dn-${i}` });
      const denied = INCOMPATIBLE.some(([b, c]) => b === a.body && c === a.crown);
      expect(denied).toBe(false);
    }
  });

  it('produces a good spread of silhouettes rather than clustering', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const a = generateAppearance({ kind: 'skill', name: `spread-${i}` });
      seen.add(`${a.body}+${a.crown}`);
    }
    // 6 bodies x 5 crowns = 30 possible; expect most of the space to be reached.
    expect(seen.size).toBeGreaterThanOrEqual(24);
  });
});
