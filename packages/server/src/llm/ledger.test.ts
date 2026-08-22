import { describe, it, expect } from 'vitest';
import { defaultLlmState, dayOf, recordSpend, remaining } from './ledger.js';

const NOON = Date.UTC(2026, 7, 22, 12, 0, 0);
const NEXT_DAY = Date.UTC(2026, 7, 23, 0, 5, 0);

describe('dayOf', () => {
  it('buckets by UTC date', () => {
    expect(dayOf(NOON)).toBe('2026-08-22');
    expect(dayOf(NEXT_DAY)).toBe('2026-08-23');
  });
});

describe('defaultLlmState', () => {
  it('carries the spec defaults: 500k interactive, 100k autonomous, autonomous off', () => {
    const s = defaultLlmState(NOON);
    expect(s.config).toEqual({ interactiveCap: 500_000, autonomousCap: 100_000, autonomousEnabled: false });
    expect(s.ledger).toEqual({ day: '2026-08-22', interactiveIn: 0, interactiveOut: 0, autonomousIn: 0, autonomousOut: 0 });
  });
});

describe('recordSpend / remaining', () => {
  it('counts input plus output against the cap', () => {
    let s = defaultLlmState(NOON);
    s = recordSpend(s, 'interactive', 1_000, 500, NOON);
    expect(remaining(s, 'interactive', NOON)).toBe(500_000 - 1_500);
  });

  it('keeps the two budgets separate', () => {
    let s = defaultLlmState(NOON);
    s = recordSpend(s, 'interactive', 10_000, 0, NOON);
    expect(remaining(s, 'autonomous', NOON)).toBe(0); // disabled -> nothing to spend
    s = { ...s, config: { ...s.config, autonomousEnabled: true } };
    expect(remaining(s, 'autonomous', NOON)).toBe(100_000);
  });

  it('a disabled autonomous budget has zero remaining, whatever the cap', () => {
    const s = defaultLlmState(NOON);
    expect(remaining(s, 'autonomous', NOON)).toBe(0);
  });

  it('rolls the ledger over at UTC midnight', () => {
    let s = defaultLlmState(NOON);
    s = recordSpend(s, 'interactive', 499_999, 0, NOON);
    expect(remaining(s, 'interactive', NOON)).toBe(1);
    expect(remaining(s, 'interactive', NEXT_DAY)).toBe(500_000);
    s = recordSpend(s, 'interactive', 7, 3, NEXT_DAY);
    expect(s.ledger.day).toBe('2026-08-23');
    expect(s.ledger.interactiveIn).toBe(7);
    expect(remaining(s, 'interactive', NEXT_DAY)).toBe(500_000 - 10);
  });

  it('never goes below zero', () => {
    let s = defaultLlmState(NOON);
    s = recordSpend(s, 'interactive', 600_000, 0, NOON);
    expect(remaining(s, 'interactive', NOON)).toBe(0);
  });

  it('is pure: the input state is untouched', () => {
    const s = defaultLlmState(NOON);
    recordSpend(s, 'interactive', 100, 100, NOON);
    expect(s.ledger.interactiveIn).toBe(0);
  });
});
