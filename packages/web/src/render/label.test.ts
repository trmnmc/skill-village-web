import { describe, it, expect } from 'vitest';
import type { Creature, CreatureKind } from '@village/core/visual';
import { displayName, fileLabel } from './label.js';

function creature(kind: CreatureKind, name: string, nickname = ''): Creature {
  return {
    id: `${kind}:${name}`, kind, name, nickname,
    appearance: {
      body: 'round', crown: 'none',
      palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
      winged: kind === 'agent', restPosture: null,
    },
    stats: { mood: 70, energy: 70, bond: 0, xp: 0 },
    stage: 'adult', personality: null, sourcePath: '/x', friendships: {}, lastSeenAt: 0,
  };
}

describe('displayName', () => {
  it('prefers the nickname', () => {
    expect(displayName(creature('skill', 'brainstorming', 'Sparky'))).toBe('Sparky');
  });

  it('falls back to the filename until the LLM has named it', () => {
    expect(displayName(creature('skill', 'brainstorming'))).toBe('brainstorming');
  });
});

describe('fileLabel', () => {
  it('marks a skill as a folder', () => {
    expect(fileLabel(creature('skill', 'code-review'))).toBe('code-review/');
  });

  it('marks an agent as a markdown file', () => {
    expect(fileLabel(creature('agent', 'debugger'))).toBe('debugger.md');
  });

  it('does not double up an extension that is already there', () => {
    expect(fileLabel(creature('agent', 'debugger.md'))).toBe('debugger.md');
  });
});
