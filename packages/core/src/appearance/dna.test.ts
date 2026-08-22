import { describe, it, expect } from 'vitest';
import { dnaSeed, pickIndex, pickFrom, DNA_OFFSET } from './dna.js';

describe('dnaSeed', () => {
  it('is deterministic for the same kind and name', () => {
    expect(dnaSeed('skill', 'code-review')).toEqual(dnaSeed('skill', 'code-review'));
  });

  it('differs between kinds with the same name, so a skill and agent are not twins', () => {
    expect(dnaSeed('skill', 'debugger')).not.toEqual(dnaSeed('agent', 'debugger'));
  });

  it('differs between names', () => {
    expect(dnaSeed('skill', 'code-review')).not.toEqual(dnaSeed('skill', 'code-reviews'));
  });

  it('returns 32 bytes, so every named offset is addressable', () => {
    expect(dnaSeed('skill', 'anything')).toHaveLength(32);
  });

  it('matches a pinned vector, so appearances never silently shift', () => {
    const hex = Buffer.from(dnaSeed('skill', 'code-review')).toString('hex');
    expect(hex).toMatchInlineSnapshot(`"34df3a5315d3b42846360ece81ecc31f2717d26983a6fd8005667c14ea41cde7"`);
  });
});

describe('named offsets', () => {
  it('are unique, so one choice never disturbs another', () => {
    const values = Object.values(DNA_OFFSET);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all fall inside the digest', () => {
    for (const offset of Object.values(DNA_OFFSET)) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(32);
    }
  });
});

describe('pickIndex', () => {
  it('always returns an index inside the range', () => {
    const seed = dnaSeed('skill', 'whatever');
    for (let count = 1; count <= 12; count++) {
      const i = pickIndex(seed, DNA_OFFSET.body, count);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(count);
    }
  });

  it('throws on an empty range rather than returning NaN', () => {
    expect(() => pickIndex(dnaSeed('skill', 'x'), 0, 0)).toThrow(/count/);
  });

  it('spreads names across all options rather than favouring one', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 200; i++) {
      const idx = pickIndex(dnaSeed('skill', `skill-${i}`), DNA_OFFSET.body, 6);
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThan(5);
  });
});

describe('pickFrom', () => {
  it('returns a member of the list', () => {
    const items = ['a', 'b', 'c'] as const;
    expect(items).toContain(pickFrom(dnaSeed('skill', 'x'), DNA_OFFSET.crown, items));
  });
});
