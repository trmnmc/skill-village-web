import { describe, it, expect } from 'vitest';
import { parseSkill, parseAgent, generateAppearance } from '@village/core';
import { creatureFromSkill, creatureFromAgent, creatureId } from './creature.js';
import { skillFixture, agentFixture } from '../testing/sandbox.js';

function parsedSkill(name: string) {
  const result = parseSkill(skillFixture(name), name);
  if (!result.ok) throw new Error(`fixture is invalid: ${result.errors.join(', ')}`);
  return result.value;
}

function parsedAgent(name: string, color?: string) {
  const result = parseAgent(agentFixture(name, color), name);
  if (!result.ok) throw new Error(`fixture is invalid: ${result.errors.join(', ')}`);
  return result.value;
}

describe('creatureId', () => {
  it('namespaces by kind so a skill and agent of the same name differ', () => {
    expect(creatureId('skill', 'debugger')).not.toBe(creatureId('agent', 'debugger'));
  });

  it('is stable and readable', () => {
    expect(creatureId('skill', 'code-review')).toBe('skill:code-review');
  });
});

describe('creatureFromSkill', () => {
  it('builds an adult creature from a valid skill', () => {
    const creature = creatureFromSkill(parsedSkill('code-review'), '/h/.claude/skills/code-review/SKILL.md', 5000);
    expect(creature.id).toBe('skill:code-review');
    expect(creature.kind).toBe('skill');
    expect(creature.name).toBe('code-review');
    expect(creature.stage).toBe('adult');
    expect(creature.sourcePath).toBe('/h/.claude/skills/code-review/SKILL.md');
    expect(creature.lastSeenAt).toBe(5000);
  });

  it('gives the appearance core would generate, not a different one', () => {
    const creature = creatureFromSkill(parsedSkill('code-review'), '/p', 0);
    expect(creature.appearance).toEqual(generateAppearance({ kind: 'skill', name: 'code-review' }));
  });

  it('starts with no nickname and no personality, both filled in later', () => {
    const creature = creatureFromSkill(parsedSkill('x'), '/p', 0);
    expect(creature.nickname).toBe('');
    expect(creature.personality).toBeNull();
  });

  it('starts with no friendships and zero xp', () => {
    const creature = creatureFromSkill(parsedSkill('x'), '/p', 0);
    expect(creature.friendships).toEqual({});
    expect(creature.stats.xp).toBe(0);
  });

  it('is never winged', () => {
    expect(creatureFromSkill(parsedSkill('x'), '/p', 0).appearance.winged).toBe(false);
  });
});

describe('creatureFromAgent', () => {
  it('builds a winged creature', () => {
    const creature = creatureFromAgent(parsedAgent('web-research'), '/h/.claude/agents/web-research.md', 5000);
    expect(creature.id).toBe('agent:web-research');
    expect(creature.appearance.winged).toBe(true);
  });

  it('uses the agent colour for the palette when present', () => {
    const creature = creatureFromAgent(parsedAgent('blue-one', 'blue'), '/p', 0);
    expect(creature.appearance.palette.hue).toBe('#7fb6d9');
  });

  it('falls back to DNA when the agent has no colour', () => {
    const creature = creatureFromAgent(parsedAgent('plain'), '/p', 0);
    expect(creature.appearance).toEqual(generateAppearance({ kind: 'agent', name: 'plain' }));
  });
});
