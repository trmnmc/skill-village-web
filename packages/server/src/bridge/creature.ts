import {
  generateAppearance,
  type AgentFile, type Creature, type CreatureKind, type SkillFile, type Stats,
} from '@village/core';
import type { DiscoveredProject } from './projects.js';

/** A creature moving in starts content, not ecstatic — there is room to grow. */
export const STARTING_STATS: Stats = { mood: 70, energy: 70, bond: 10, xp: 0 };

export function creatureId(kind: CreatureKind, name: string): string {
  return `${kind}:${name}`;
}

/**
 * A file that already exists on disk is a working tool, so its creature is born
 * an adult. Only creatures hatched inside the game start as eggs.
 */
export function creatureFromSkill(skill: SkillFile, sourcePath: string, now: number): Creature {
  return {
    id: creatureId('skill', skill.name),
    kind: 'skill',
    name: skill.name,
    nickname: '',
    appearance: generateAppearance({ kind: 'skill', name: skill.name }),
    stats: { ...STARTING_STATS },
    stage: 'adult',
    personality: null,
    sourcePath,
    friendships: {},
    lastSeenAt: now,
  };
}

/**
 * A discovered project moves in as an adult, like every creature whose real
 * thing already exists. Links start empty — reconcileProjects resolves them
 * against the roster it has in hand.
 */
export function creatureFromProject(found: DiscoveredProject, now: number): Creature {
  return {
    id: found.id,
    kind: 'project',
    name: found.displayName,
    nickname: '',
    // Seeded from the immutable entry name, not the display name: a project
    // folder renamed on disk keeps its body.
    appearance: generateAppearance({ kind: 'project', name: found.entryName }),
    stats: { ...STARTING_STATS },
    stage: 'adult',
    personality: null,
    sourcePath: found.sourcePath,
    friendships: {},
    lastSeenAt: now,
    lastWorkedAt: found.lastWorkedAt,
    helperIds: [],
    unresolvedMentions: [],
  };
}

export function creatureFromAgent(agent: AgentFile, sourcePath: string, now: number): Creature {
  return {
    id: creatureId('agent', agent.name),
    kind: 'agent',
    name: agent.name,
    nickname: '',
    appearance: generateAppearance({
      kind: 'agent',
      name: agent.name,
      agentColor: agent.color,
    }),
    stats: { ...STARTING_STATS },
    stage: 'adult',
    personality: null,
    sourcePath,
    friendships: {},
    lastSeenAt: now,
  };
}
