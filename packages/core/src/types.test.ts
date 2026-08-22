import { describe, it, expect } from 'vitest';
import { BODY_IDS, CROWN_IDS, REST_POSTURE_IDS } from './types.js';

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
