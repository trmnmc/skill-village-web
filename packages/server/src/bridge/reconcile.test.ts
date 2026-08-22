import { describe, it, expect } from 'vitest';
import { parseSkill, type Creature } from '@village/core';
import { emptyState } from '../state/schema.js';
import { creatureFromSkill } from './creature.js';
import { reconcile } from './reconcile.js';
import { skillFixture } from '../testing/sandbox.js';

function makeCreature(name: string, sourcePath = `/h/.claude/skills/${name}/SKILL.md`): Creature {
  const parsed = parseSkill(skillFixture(name), name);
  if (!parsed.ok) throw new Error(parsed.errors.join(', '));
  return creatureFromSkill(parsed.value, sourcePath, 0);
}

describe('reconcile', () => {
  it('moves in a creature that is new to the village', () => {
    const result = reconcile(emptyState(0), { creatures: [makeCreature('newbie')], problems: [] }, 100);
    expect(Object.keys(result.state.creatures)).toEqual(['skill:newbie']);
    expect(result.events.map((e) => e.type)).toEqual(['moved-in']);
    expect(result.events[0]!.creatureId).toBe('skill:newbie');
    expect(result.events[0]!.at).toBe(100);
  });

  it('preserves stats, bond and xp for a creature that is already here', () => {
    const state = emptyState(0);
    const existing = makeCreature('veteran');
    existing.stats = { mood: 42, energy: 43, bond: 88, xp: 5000 };
    existing.nickname = 'Vet';
    existing.friendships = { 'skill:other': 50 };
    state.creatures[existing.id] = existing;

    const result = reconcile(state, { creatures: [makeCreature('veteran')], problems: [] }, 200);
    const after = result.state.creatures['skill:veteran']!;
    expect(after.stats).toEqual({ mood: 42, energy: 43, bond: 88, xp: 5000 });
    expect(after.nickname).toBe('Vet');
    expect(after.friendships).toEqual({ 'skill:other': 50 });
  });

  it('emits no event for an unchanged creature', () => {
    const state = emptyState(0);
    const existing = makeCreature('steady');
    state.creatures[existing.id] = existing;
    const result = reconcile(state, { creatures: [makeCreature('steady')], problems: [] }, 200);
    expect(result.events).toEqual([]);
  });

  it('resyncs and reports when the source file moved, keeping identity stable', () => {
    const state = emptyState(0);
    const existing = makeCreature('mover', '/old/path/SKILL.md');
    existing.appearance = { ...existing.appearance, crown: 'horns' };
    existing.stats = { mood: 42, energy: 43, bond: 88, xp: 5000 };
    existing.nickname = 'Mo';
    existing.friendships = { 'skill:other': 50 };
    state.creatures[existing.id] = existing;

    const result = reconcile(
      state,
      { creatures: [makeCreature('mover', '/new/path/SKILL.md')], problems: [] },
      300,
    );
    const after = result.state.creatures['skill:mover']!;
    expect(after.sourcePath).toBe('/new/path/SKILL.md');
    expect(after.appearance.crown).toBe('horns');
    expect(after.stats).toEqual({ mood: 42, energy: 43, bond: 88, xp: 5000 });
    expect(after.nickname).toBe('Mo');
    expect(after.friendships).toEqual({ 'skill:other': 50 });
    expect(result.events.map((e) => e.type)).toEqual(['resynced']);
  });

  it('keeps identity stable on an unchanged rescan — appearance never regenerates', () => {
    const state = emptyState(0);
    const existing = makeCreature('stable');
    existing.appearance = { ...existing.appearance, crown: 'horns' };
    state.creatures[existing.id] = existing;

    const result = reconcile(state, { creatures: [makeCreature('stable')], problems: [] }, 400);
    expect(result.state.creatures['skill:stable']!.appearance.crown).toBe('horns');
  });

  it('auto-releases a creature whose file has vanished', () => {
    const state = emptyState(0);
    const existing = makeCreature('vanished');
    state.creatures[existing.id] = existing;

    const result = reconcile(state, { creatures: [], problems: [] }, 500);
    expect(result.state.creatures).toEqual({});
    expect(result.released.map((c) => c.id)).toEqual(['skill:vanished']);
    expect(result.events.map((e) => e.type)).toEqual(['auto-released']);
  });

  it('handles several changes in one pass', () => {
    const state = emptyState(0);
    const staying = makeCreature('staying');
    const leaving = makeCreature('leaving');
    state.creatures[staying.id] = staying;
    state.creatures[leaving.id] = leaving;

    const result = reconcile(
      state,
      { creatures: [makeCreature('staying'), makeCreature('arriving')], problems: [] },
      600,
    );
    expect(Object.keys(result.state.creatures).sort()).toEqual(['skill:arriving', 'skill:staying']);
    expect(result.released.map((c) => c.id)).toEqual(['skill:leaving']);
    const types = result.events.map((e) => e.type).sort();
    expect(types).toEqual(['auto-released', 'moved-in']);
  });

  it('replaces the problem list wholesale, so fixed files stop being reported', () => {
    const state = emptyState(0);
    state.problems = [{ path: '/old/broken/SKILL.md', errors: ['was broken'] }];
    const result = reconcile(state, { creatures: [], problems: [] }, 700);
    expect(result.state.problems).toEqual([]);
  });

  it('logs newly broken files so the player learns about them', () => {
    const problems = [{ path: '/x/SKILL.md', errors: ['no description'] }];
    const result = reconcile(emptyState(0), { creatures: [], problems }, 800);
    const failures = result.events.filter((e) => e.type === 'import-failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]!.detail).toContain('no description');
  });

  it('does not re-log a problem that was already known', () => {
    const state = emptyState(0);
    state.problems = [{ path: '/x/SKILL.md', errors: ['no description'] }];
    const result = reconcile(state, { creatures: [], problems: state.problems }, 900);
    expect(result.events.filter((e) => e.type === 'import-failed')).toEqual([]);
  });

  it('stamps updatedAt', () => {
    const result = reconcile(emptyState(0), { creatures: [], problems: [] }, 1234);
    expect(result.state.updatedAt).toBe(1234);
  });

  it('does not mutate the state it was given', () => {
    const state = emptyState(0);
    const before = JSON.stringify(state);
    reconcile(state, { creatures: [makeCreature('x')], problems: [] }, 1000);
    expect(JSON.stringify(state)).toBe(before);
  });
});
