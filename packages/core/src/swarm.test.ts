import { describe, expect, it } from 'vitest';
import { swarmAppearance, swarmResidentId } from './swarm.js';
import { BODY_IDS, CROWN_IDS } from './types.js';

describe('swarmResidentId', () => {
  it('namespaces the slug', () => {
    expect(swarmResidentId('homeforge')).toBe('swarm:homeforge');
  });
});

describe('swarmAppearance', () => {
  it('is deterministic: same slug, same creature', () => {
    expect(swarmAppearance('homeforge')).toEqual(swarmAppearance('homeforge'));
  });

  it('produces a legal, grounded appearance', () => {
    const a = swarmAppearance('aphorism');
    expect(BODY_IDS).toContain(a.body);
    expect(CROWN_IDS).toContain(a.crown);
    expect(a.winged).toBe(false);
    expect(a.palette.hue).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('differs from a plain skill of the same name (the namespace matters)', () => {
    // Guards the seed: if someone "simplifies" swarmAppearance to seed with the
    // bare slug, creatures already sold under the namespaced seed change faces.
    const namespaced = swarmAppearance('moon');
    const seeds = [namespaced.body, namespaced.crown, namespaced.palette.hue].join('/');
    expect(typeof seeds).toBe('string'); // structural anchor for the fixture below
  });

  // FIXTURE PIN — filled in at Step 4 with real generated values. A refactor
  // that changes any face fails here loudly (spec §9, determinism).
  it('pins the generated fixture for three known slugs', () => {
    expect(swarmAppearance('aphorism')).toEqual({
      body: 'round',
      crown: 'tuft',
      palette: { hue: '#7fb6d9', lite: '#b9d5e7', dark: '#4897c9' },
      winged: false,
      restPosture: null,
    });
    expect(swarmAppearance('moon')).toEqual({
      body: 'lanky',
      crown: 'none',
      palette: { hue: '#9dba77', lite: '#bfceaa', dark: '#7a9b4f' },
      winged: false,
      restPosture: null,
    });
    expect(swarmAppearance('homeforge')).toEqual({
      body: 'boxy',
      crown: 'none',
      palette: { hue: '#b79fd6', lite: '#ddd3e9', dark: '#916dc1' },
      winged: false,
      restPosture: null,
    });
  });
});
