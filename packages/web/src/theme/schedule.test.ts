import { describe, it, expect } from 'vitest';
import { planForDate, isoWeek } from './schedule.js';

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('planForDate', () => {
  it('weekends are single-palette days', () => {
    const sat = planForDate(d('2026-08-22'));
    const sun = planForDate(d('2026-08-23'));
    expect(sat.kind).toBe('single');
    expect(sun.kind).toBe('single');
    if (sat.kind === 'single' && sun.kind === 'single') {
      expect(sat.palette).not.toBe(sun.palette);
      expect(['1c', '1d', '1e', '1f']).toContain(sat.palette);
    }
  });

  it('consecutive Saturdays wear different palettes', () => {
    const s1 = planForDate(d('2026-08-22'));
    const s2 = planForDate(d('2026-08-29'));
    if (s1.kind === 'single' && s2.kind === 'single') expect(s1.palette).not.toBe(s2.palette);
  });

  it('exactly one weekday of a week is a surprise single', () => {
    // Mon 2026-08-17 .. Fri 2026-08-21
    const days = ['17', '18', '19', '20', '21'].map((n) => planForDate(d(`2026-08-${n}`)));
    expect(days.filter((p) => p.kind === 'single')).toHaveLength(1);
    expect(days.filter((p) => p.kind === 'weave')).toHaveLength(4);
  });

  it('is deterministic', () => {
    expect(planForDate(d('2026-08-19'))).toEqual(planForDate(d('2026-08-19')));
  });

  it('isoWeek matches known values', () => {
    expect(isoWeek(d('2026-01-01'))).toBe(1);
    expect(isoWeek(d('2026-08-22'))).toBe(34);
  });
});
