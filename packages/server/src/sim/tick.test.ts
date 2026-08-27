import { describe, it, expect } from 'vitest';
import {
  parseSkill, decayStats, ELDER_LEVEL, xpForLevel,
  generateAppearance, STAT_FLOOR, workStats, type Creature, type Stats,
} from '@village/core';
import { emptyState } from '../state/schema.js';
import { creatureFromSkill } from '../bridge/creature.js';
import { applyTick, MS_PER_HOUR } from './tick.js';
import { skillFixture } from '../testing/sandbox.js';

function stateWithCreature(name: string, at: number) {
  const parsed = parseSkill(skillFixture(name), name);
  if (!parsed.ok) throw new Error(parsed.errors.join(', '));
  const creature = creatureFromSkill(parsed.value, `/h/${name}/SKILL.md`, at);
  const state = emptyState(at);
  state.creatures[creature.id] = creature;
  return { state, id: creature.id };
}

describe('applyTick', () => {
  it('does nothing to an empty village', () => {
    const result = applyTick(emptyState(0), 1000);
    expect(result.state.creatures).toEqual({});
    expect(result.events).toEqual([]);
  });

  it('decays mood and energy as time passes', () => {
    const { state, id } = stateWithCreature('sleepy', 0);
    const before = state.creatures[id]!.stats;
    const result = applyTick(state, 24 * MS_PER_HOUR);
    const after = result.state.creatures[id]!.stats;
    expect(after.mood).toBeLessThan(before.mood);
    expect(after.energy).toBeLessThan(before.energy);
  });

  it('leaves bond and xp untouched', () => {
    const { state, id } = stateWithCreature('steady', 0);
    state.creatures[id]!.stats.bond = 55;
    state.creatures[id]!.stats.xp = 1234;
    const result = applyTick(state, 72 * MS_PER_HOUR);
    expect(result.state.creatures[id]!.stats.bond).toBe(55);
    expect(result.state.creatures[id]!.stats.xp).toBe(1234);
  });

  it('advances lastSeenAt to now', () => {
    const { state, id } = stateWithCreature('marked', 0);
    const result = applyTick(state, 5_000);
    expect(result.state.creatures[id]!.lastSeenAt).toBe(5_000);
  });

  it('gives the same result whether time passes in one step or many', () => {
    // Exponential decay composes, so a server that was off for six hours must land
    // in exactly the same place as one that ticked steadily through them.
    const oneStep = stateWithCreature('a', 0);
    const many = stateWithCreature('a', 0);

    const afterOne = applyTick(oneStep.state, 6 * MS_PER_HOUR).state.creatures[oneStep.id]!.stats;

    let current = many.state;
    for (let hour = 1; hour <= 6; hour++) {
      current = applyTick(current, hour * MS_PER_HOUR).state;
    }
    const afterMany = current.creatures[many.id]!.stats;

    expect(afterMany.mood).toBeCloseTo(afterOne.mood, 6);
    expect(afterMany.energy).toBeCloseTo(afterOne.energy, 6);
  });

  it('matches core decay exactly, rather than reimplementing it', () => {
    const { state, id } = stateWithCreature('exact', 0);
    const before = { ...state.creatures[id]!.stats };
    const result = applyTick(state, 3 * MS_PER_HOUR);
    expect(result.state.creatures[id]!.stats).toEqual(decayStats(before, 3));
  });

  it('ignores a clock that appears to run backwards', () => {
    const { state, id } = stateWithCreature('timewarp', 10_000);
    const result = applyTick(state, 5_000);
    expect(result.state.creatures[id]!.stats).toEqual(state.creatures[id]!.stats);
  });

  it('promotes an adult to elder once it has the levels, and says so', () => {
    const { state, id } = stateWithCreature('veteran', 0);
    state.creatures[id]!.stats.xp = xpForLevel(ELDER_LEVEL);
    const result = applyTick(state, 1_000);
    expect(result.state.creatures[id]!.stage).toBe('elder');
    expect(result.events.map((e) => e.type)).toContain('stage-changed');
  });

  it('does not announce a stage change that did not happen', () => {
    const { state } = stateWithCreature('ordinary', 0);
    const result = applyTick(state, 1_000);
    expect(result.events.filter((e) => e.type === 'stage-changed')).toEqual([]);
  });

  it('stamps updatedAt and does not mutate the input', () => {
    const { state } = stateWithCreature('immutable', 0);
    const before = JSON.stringify(state);
    const result = applyTick(state, 9_999);
    expect(result.state.updatedAt).toBe(9_999);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('projects: only real work heals', () => {
  const DAY = 86_400_000;

  const projectCreature = (id: string, stats: Stats, over: Partial<Creature> = {}): Creature => ({
    id,
    kind: 'project',
    name: id.slice('project:'.length),
    nickname: '',
    appearance: generateAppearance({ kind: 'project', name: id }),
    stats,
    stage: 'adult',
    personality: null,
    sourcePath: '',
    friendships: {},
    lastSeenAt: 0,
    ...over,
  });

  const stateWith = (c: Creature) => ({ ...emptyState(0), creatures: { [c.id]: c } });

  it('mood/energy come from lastWorkedAt, not from lastSeenAt decay', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:p', { mood: 99, energy: 99, bond: 40, xp: 7 }, {
      lastWorkedAt: now - 12 * DAY,
      lastSeenAt: now, // freshly petted — must not matter
    });
    const { state: next } = applyTick(stateWith(project), now);
    const ticked = next.creatures['project:p']!;
    expect(ticked.stats.mood).toBeCloseTo(workStats(12 * DAY).mood, 5);
    expect(ticked.stats.energy).toBeCloseTo(workStats(12 * DAY).energy, 5);
    // care builds bond only (spec §5): bond and xp ride through untouched
    expect(ticked.stats.bond).toBe(40);
    expect(ticked.stats.xp).toBe(7);
  });

  it('a freshly worked project is thriving whatever its stored stats say', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:q', { mood: 5, energy: 5, bond: 0, xp: 0 }, {
      lastWorkedAt: now - 3_600_000,
    });
    const { state: next } = applyTick(stateWith(project), now);
    expect(next.creatures['project:q']!.stats.mood).toBe(85);
  });

  it('a project with no lastWorkedAt falls back to ordinary decay', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:r', { mood: 90, energy: 90, bond: 0, xp: 0 }, {
      lastSeenAt: now - 24 * 3_600_000,
    });
    const { state: next } = applyTick(stateWith(project), now);
    expect(next.creatures['project:r']!.stats.mood).toBeLessThan(90);
    expect(next.creatures['project:r']!.stats.mood).toBeGreaterThanOrEqual(STAT_FLOOR);
  });
});
