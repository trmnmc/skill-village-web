import { describe, it, expect } from 'vitest';
import { isValidName, normalizeName, describeNameProblem } from './names.js';

describe('isValidName', () => {
  it.each(['code-review', 'pdf', 'a', 'x9', 'web-research-agent'])('accepts %s', (n) => {
    expect(isValidName(n)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['-leading', 'leading hyphen'],
    ['Has-Capitals', 'capitals'],
    ['has spaces', 'spaces'],
    ['has:colon', 'colon'],
    ['has_underscore', 'underscore'],
    ['has.dot', 'dot'],
  ])('rejects %s (%s)', (n) => {
    expect(isValidName(n)).toBe(false);
  });
});

describe('describeNameProblem', () => {
  it('returns null for a valid name', () => {
    expect(describeNameProblem('code-review')).toBeNull();
  });

  it('names the specific problem so the UI can show it', () => {
    expect(describeNameProblem('')).toMatch(/empty/i);
    expect(describeNameProblem('-x')).toMatch(/hyphen/i);
    expect(describeNameProblem('A')).toMatch(/lowercase/i);
    expect(describeNameProblem('a:b')).toMatch(/colon/i);
  });
});

describe('normalizeName', () => {
  it.each([
    ['Code Review', 'code-review'],
    ['  Deck Maker  ', 'deck-maker'],
    ['PDF', 'pdf'],
    ['snake_case_name', 'snake-case-name'],
    ['dots.and.dots', 'dots-and-dots'],
    ['multiple   spaces', 'multiple-spaces'],
    ['--leading-and-trailing--', 'leading-and-trailing'],
    ['weird!@#chars', 'weirdchars'],
  ])('turns %s into %s', (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });

  it('always produces a valid name or an empty string', () => {
    for (const raw of ['???', '   ', 'Ünïcodé Náme', 'ok name']) {
      const out = normalizeName(raw);
      expect(out === '' || isValidName(out)).toBe(true);
    }
  });
});
