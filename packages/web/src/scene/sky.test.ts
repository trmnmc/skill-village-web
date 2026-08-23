import { describe, it, expect } from 'vitest';
import { starField, moonPixels } from './sky.js';

describe('starField', () => {
  it('is deterministic across calls', () => {
    expect(starField(24)).toEqual(starField(24));
  });

  it('places every star inside [0,1] on both axes', () => {
    for (const star of starField(24)) {
      expect(star.x01).toBeGreaterThanOrEqual(0);
      expect(star.x01).toBeLessThan(1);
      expect(star.y01).toBeGreaterThanOrEqual(0);
      expect(star.y01).toBeLessThan(1);
    }
  });

  it('is stable under a smaller count — star i is the same star regardless of how many are asked for', () => {
    const full = starField(24);
    const partial = starField(7);
    for (let i = 0; i < partial.length; i++) {
      expect(partial[i]).toEqual(full[i]);
    }
  });

  it('marks every third star major, matching the reference alpha rule', () => {
    const stars = starField(9);
    expect(stars.map((s) => s.major)).toEqual([true, false, false, true, false, false, true, false, false]);
  });
});

describe('moonPixels', () => {
  const columnSums = (grid: string[]): number[] => {
    const sums = [0, 0, 0, 0, 0, 0];
    for (const row of grid) {
      for (let c = 0; c < row.length; c++) if (row[c] === 'X') sums[c]! += 1;
    }
    return sums;
  };

  it('is a 6x6 grid', () => {
    const grid = moonPixels('full', true);
    expect(grid).toHaveLength(6);
    for (const row of grid) expect(row).toHaveLength(6);
  });

  it('full: every disc cell lit, none masked', () => {
    const grid = moonPixels('full', true);
    const flat = grid.join('');
    const discCells = flat.replace(/\./g, '');
    expect(discCells).toHaveLength(32);
    expect(flat).not.toContain('o');
    expect(discCells).toBe('X'.repeat(32));
  });

  it('new: every disc cell masked, none lit', () => {
    const grid = moonPixels('new', true);
    const flat = grid.join('');
    expect(flat).not.toContain('X');
    const discCells = flat.replace(/\./g, '');
    expect(discCells).toHaveLength(32);
    expect(discCells).toBe('o'.repeat(32));
  });

  it('waxing crescent lights the right columns', () => {
    const sums = columnSums(moonPixels('waxing crescent', true));
    const left = sums[0]! + sums[1]! + sums[2]!;
    const right = sums[3]! + sums[4]! + sums[5]!;
    expect(right).toBeGreaterThan(left);
    expect(left).toBe(0);
  });

  it('waning crescent lights the left columns', () => {
    const sums = columnSums(moonPixels('waning crescent', false));
    const left = sums[0]! + sums[1]! + sums[2]!;
    const right = sums[3]! + sums[4]! + sums[5]!;
    expect(left).toBeGreaterThan(right);
    expect(right).toBe(0);
  });

  it('waxing gibbous lights the right columns, more than a crescent', () => {
    const crescent = columnSums(moonPixels('waxing crescent', true));
    const gibbous = columnSums(moonPixels('waxing gibbous', true));
    const total = (sums: number[]) => sums.reduce((a, b) => a + b, 0);
    expect(total(gibbous)).toBeGreaterThan(total(crescent));
  });

  it('is stable across repeated calls with the same arguments', () => {
    expect(moonPixels('first quarter', true)).toEqual(moonPixels('first quarter', true));
  });
});
