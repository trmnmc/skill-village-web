import { describe, it, expect } from 'vitest';
import { BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, derivePalette, HUES, type CreatureAppearance, type RestPostureId } from '@village/core/visual';
import { composeGrid } from './compose.js';

const palette = derivePalette(HUES[0]!);

function appearance(over: Partial<CreatureAppearance> = {}): CreatureAppearance {
  return { body: 'round', crown: 'none', palette, winged: false, restPosture: null, ...over };
}

describe('composeGrid — shape', () => {
  it('returns the body unchanged for a crownless skill', () => {
    const g = composeGrid(appearance());
    expect(g.rows).toEqual(BODIES.round.rows);
    expect(g.w).toBe(BODIES.round.w);
    expect(g.h).toBe(BODIES.round.h);
    expect(g.crownRows).toBe(0);
  });

  it('every row is the full width, whatever the body', () => {
    for (const body of ['pip', 'round', 'lanky', 'bean', 'mound', 'boxy'] as const) {
      for (const crown of ['none', 'ears', 'crest', 'tuft', 'horns'] as const) {
        const g = composeGrid(appearance({ body, crown }));
        for (const row of g.rows) {
          expect(row.length, `${body}/${crown}`).toBe(g.w);
        }
        expect(g.rows.length).toBe(g.h);
      }
    }
  });

  it('contains only legal role characters', () => {
    for (const body of ['pip', 'round', 'lanky', 'bean', 'mound', 'boxy'] as const) {
      const g = composeGrid(appearance({ body, crown: 'crest' }));
      expect(g.rows.join('')).toMatch(/^[XDWKA.]+$/);
    }
  });
});

describe('composeGrid — crowns', () => {
  it('adds the crown height above the body', () => {
    const g = composeGrid(appearance({ crown: 'ears' }));
    expect(g.crownRows).toBe(CROWNS.ears.h);
    expect(g.h).toBe(BODIES.round.h + CROWNS.ears.h);
  });

  it('draws crown cells in the body role', () => {
    const g = composeGrid(appearance({ crown: 'tuft' }));
    // tuft is one row of two pixels flanking the centre column.
    const crownRow = g.rows[0]!;
    expect(crownRow.split('').filter((ch) => ch === 'X').length).toBe(2);
  });

  it('anchors a crown correctly on the widest and narrowest bodies', () => {
    const narrow = composeGrid(appearance({ body: 'pip', crown: 'ears' }));
    const wide = composeGrid(appearance({ body: 'mound', crown: 'ears' }));
    // Ears anchor at columns 1 and w-2 on both.
    expect(narrow.rows[0]![1]).toBe('X');
    expect(narrow.rows[0]![BODIES.pip.w - 2]).toBe('X');
    expect(wide.rows[0]![1]).toBe('X');
    expect(wide.rows[0]![BODIES.mound.w - 2]).toBe('X');
  });

  it('shifts eye anchors down by the crown height', () => {
    const bare = composeGrid(appearance({ crown: 'none' }));
    const crowned = composeGrid(appearance({ crown: 'crest' }));
    expect(crowned.eyes[0].r).toBe(bare.eyes[0].r + CROWNS.crest.h);
    expect(crowned.eyes[0].c).toBe(bare.eyes[0].c);
  });
});

describe('composeGrid — flight undersides', () => {
  it('gives a winged creature a tapered underside instead of feet', () => {
    const g = composeGrid(appearance({ body: 'round', winged: true }));
    expect(g.rows.at(-1)).toBe(FLIGHT_UNDERSIDE.round[0]);
    expect(g.rows.join('')).not.toContain('D');
  });

  it('keeps feet on a skill', () => {
    const g = composeGrid(appearance({ body: 'round', winged: false }));
    expect(g.rows.join('')).toContain('D');
  });

  it('hangs a winged lanky on its resting posture', () => {
    const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: 'splayed' }));
    const split = g.h - POSTURES.splayed.rows.length;
    // Index 8 is the first leg row ('..X.X..'); everything before it, down to
    // and including the hip taper at index 7, is torso and must survive the
    // walk-back untouched — this is what actually depends on where `start` lands.
    expect(g.rows.slice(0, split)).toEqual(BODIES.lanky.rows.slice(0, 8));
    const tail = g.rows.slice(-POSTURES.splayed.rows.length);
    expect(tail).toEqual(POSTURES.splayed.rows);
  });

  it('sweeps a winged lanky into trailing legs while roaming', () => {
    const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: 'stubs' }), 'trailing');
    const split = g.h - POSTURES.trailing.rows.length;
    expect(g.rows.slice(0, split)).toEqual(BODIES.lanky.rows.slice(0, 8));
    const tail = g.rows.slice(-POSTURES.trailing.rows.length);
    expect(tail).toEqual(POSTURES.trailing.rows);
  });

  it('adds exactly the posture height to the fixed torso, for every posture', () => {
    // Guards the walk-back boundary directly: the torso through the hip taper
    // is fixed at 8 rows, so total height must track each posture's own row
    // count precisely rather than merely being "long enough".
    const restCases: Array<[RestPostureId, number]> = [
      ['stubs', 9],
      ['splayed', 10],
      ['floating', 11],
    ];
    for (const [id, expected] of restCases) {
      const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: id }));
      expect(g.h, id).toBe(8 + POSTURES[id].rows.length);
      expect(g.h, id).toBe(expected);
    }

    // 'trailing' is a motion state, not a resting posture — only reachable via
    // the posture override, the same way roaming does it.
    const trailing = composeGrid(
      appearance({ body: 'lanky', winged: true, restPosture: 'stubs' }),
      'trailing',
    );
    expect(trailing.h).toBe(8 + POSTURES.trailing.rows.length);
    expect(trailing.h).toBe(12);
  });

  it('leaves no feet on a winged lanky', () => {
    const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: 'splayed' }));
    expect(g.rows.join('')).not.toContain('D');
  });

  it('ignores a posture argument for a body that cannot dangle', () => {
    const g = composeGrid(appearance({ body: 'bean', winged: true, restPosture: null }), 'trailing');
    expect(g.rows.at(-1)).toBe(FLIGHT_UNDERSIDE.bean[0]);
  });

  it('is unaffected by posture when the creature is not winged', () => {
    const withPosture = composeGrid(appearance({ body: 'lanky', winged: false }), 'trailing');
    const plain = composeGrid(appearance({ body: 'lanky', winged: false }));
    expect(withPosture.rows).toEqual(plain.rows);
  });
});

describe('composeGrid — determinism', () => {
  it('returns an identical grid for identical input', () => {
    const a = composeGrid(appearance({ body: 'boxy', crown: 'horns' }));
    const b = composeGrid(appearance({ body: 'boxy', crown: 'horns' }));
    expect(a).toEqual(b);
  });
});
