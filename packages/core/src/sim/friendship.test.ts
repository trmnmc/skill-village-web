import { describe, it, expect } from 'vitest';
import {
  FRIENDSHIP_MAX, CO_USE_BONUS, bumpFriendship, recordCoUse, friendsOf,
} from './friendship.js';

describe('bumpFriendship', () => {
  it('adds affinity for a new friend', () => {
    expect(bumpFriendship({}, 'skill:tdd', 5)).toEqual({ 'skill:tdd': 5 });
  });

  it('accumulates for an existing friend', () => {
    expect(bumpFriendship({ 'skill:tdd': 5 }, 'skill:tdd', 3)['skill:tdd']).toBe(8);
  });

  it('caps at the maximum', () => {
    expect(bumpFriendship({ 'skill:tdd': 99 }, 'skill:tdd', 50)['skill:tdd']).toBe(FRIENDSHIP_MAX);
  });

  it('never goes below zero', () => {
    expect(bumpFriendship({ 'skill:tdd': 2 }, 'skill:tdd', -10)['skill:tdd']).toBe(0);
  });

  it('does not mutate the input', () => {
    const before = { 'skill:tdd': 5 };
    bumpFriendship(before, 'skill:tdd', 5);
    expect(before['skill:tdd']).toBe(5);
  });
});

describe('recordCoUse', () => {
  it('makes every pair in a session mutual friends', () => {
    const out = recordCoUse({}, ['skill:a', 'skill:b']);
    expect(out['skill:a']?.['skill:b']).toBe(CO_USE_BONUS);
    expect(out['skill:b']?.['skill:a']).toBe(CO_USE_BONUS);
  });

  it('never makes a creature its own friend', () => {
    const out = recordCoUse({}, ['skill:a', 'skill:a', 'skill:b']);
    expect(out['skill:a']?.['skill:a']).toBeUndefined();
  });

  it('does nothing for a session that used a single creature', () => {
    expect(recordCoUse({}, ['skill:a'])).toEqual({});
  });

  it('does nothing for an empty session', () => {
    expect(recordCoUse({}, [])).toEqual({});
  });

  it('accumulates across repeated sessions', () => {
    let maps = recordCoUse({}, ['skill:a', 'skill:b']);
    maps = recordCoUse(maps, ['skill:a', 'skill:b']);
    expect(maps['skill:a']?.['skill:b']).toBe(CO_USE_BONUS * 2);
  });

  it('connects all three pairs when three creatures are used together', () => {
    const out = recordCoUse({}, ['a', 'b', 'c']);
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c']);
    expect(Object.keys(out.a!).sort()).toEqual(['b', 'c']);
  });
});

describe('friendsOf', () => {
  it('returns only ids at or above the threshold, strongest first', () => {
    const map = { low: 5, high: 80, mid: 40 };
    expect(friendsOf(map, 40)).toEqual(['high', 'mid']);
  });

  it('returns an empty list when nobody qualifies', () => {
    expect(friendsOf({ a: 1 }, 50)).toEqual([]);
  });
});
