import { describe, it, expect } from 'vitest';
import { parseServerMessage, toView } from './protocol.js';

const creature = {
  id: 'skill:code-review',
  kind: 'skill',
  name: 'code-review',
  nickname: 'Nit',
  appearance: {
    body: 'round', crown: 'ears',
    palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
    winged: false, restPosture: null,
  },
  stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
  stage: 'adult',
  personality: null,
  sourcePath: 'C:/Users/x/.claude/skills/code-review/SKILL.md',
  friendships: {},
  lastSeenAt: 1,
};

const state = { creatures: { 'skill:code-review': creature }, problems: [], startupNote: null };

describe('toView', () => {
  it('turns the creature map into a stable, sorted list', () => {
    const many = {
      creatures: { 'skill:b': { ...creature, id: 'skill:b' }, 'skill:a': { ...creature, id: 'skill:a' } },
      problems: [],
    };
    expect(toView(many)!.creatures.map((c) => c.id)).toEqual(['skill:a', 'skill:b']);
  });

  it('carries problems and the startup note through', () => {
    const view = toView({ ...state, problems: ['bad.md'], startupNote: 'hello' })!;
    expect(view.problems).toEqual(['bad.md']);
    expect(view.startupNote).toBe('hello');
  });

  it('defaults a missing startup note to null', () => {
    expect(toView({ creatures: {}, problems: [] })!.startupNote).toBeNull();
  });

  it('accepts an empty village', () => {
    expect(toView({ creatures: {}, problems: [] })!.creatures).toEqual([]);
  });

  it('rejects a payload with no creature map', () => {
    expect(toView({ problems: [] })).toBeNull();
    expect(toView(null)).toBeNull();
    expect(toView('nope')).toBeNull();
  });

  it('skips a creature missing the fields the renderer needs', () => {
    const view = toView({ creatures: { a: { id: 'a' }, 'skill:ok': creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });
});

describe('parseServerMessage', () => {
  it('reads a state frame', () => {
    const raw = JSON.stringify({ type: 'state', state });
    expect(parseServerMessage(raw)!.creatures[0]!.id).toBe('skill:code-review');
  });

  it('ignores a frame of some other type', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'pong' }))).toBeNull();
  });

  it('survives malformed JSON rather than taking the village down', () => {
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage('')).toBeNull();
  });
});
