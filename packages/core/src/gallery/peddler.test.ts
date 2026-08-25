import { describe, it, expect } from 'vitest';
import { BODIES } from '../appearance/grids.js';
import { HUES } from '../appearance/palette.js';
import { deriveSketchEyes, validateSketchGrid } from './validate.js';
import { PEDDLER_GRID, PEDDLER_HUE, PEDDLER_LINE } from './peddler.js';

describe('the peddler', () => {
  it('is a legal grid, so the ordinary compositor can draw it', () => {
    const result = validateSketchGrid([...PEDDLER_GRID]);
    expect(result.ok ? '' : result.complaints.join('; ')).toBe('');
  });

  it('has findable eyes, so it looks alive rather than blind', () => {
    expect(deriveSketchEyes([...PEDDLER_GRID])).not.toBeNull();
  });

  it('stands taller than every villager, so a stranger reads as a stranger', () => {
    const tallest = Math.max(...Object.values(BODIES).map((b) => b.h));
    expect(PEDDLER_GRID.length).toBeGreaterThan(tallest - 2);
  });

  it('is not a villager body, so DNA can never roll it', () => {
    const villagerShapes = Object.values(BODIES).map((b) => b.rows.join('\n'));
    expect(villagerShapes).not.toContain([...PEDDLER_GRID].join('\n'));
  });

  it('wears a curated hue like everything else in the village', () => {
    expect(HUES).toContain(PEDDLER_HUE);
  });

  it('has exactly one thing to say', () => {
    expect(PEDDLER_LINE.length).toBeGreaterThan(0);
    expect(PEDDLER_LINE).toContain('ugliest');
  });
});
