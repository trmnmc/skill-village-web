import { describe, it, expect } from 'vitest';
import { parseSkill, generateAppearance, type Creature } from '@village/core';
import { emptyState } from '../state/schema.js';
import { creatureFromSkill, creatureFromProject } from './creature.js';
import { reconcile, linkHelpers, reconcileProjects } from './reconcile.js';
import { skillFixture } from '../testing/sandbox.js';
import type { DiscoveredProject } from './projects.js';

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

const project = (over: Partial<DiscoveredProject> = {}): DiscoveredProject => ({
  id: 'project:C--dev-proj-a',
  entryName: 'C--dev-proj-a',
  displayName: 'proj-a',
  sourcePath: '/home/dev/proj-a',
  lastWorkedAt: 1000,
  helperMentions: [],
  ...over,
});

const anyCreature = (id: string, kind: 'skill' | 'agent'): Creature => ({
  id,
  kind,
  name: id.slice(id.indexOf(':') + 1),
  nickname: '',
  appearance: generateAppearance({ kind, name: id.slice(id.indexOf(':') + 1) }),
  stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
  stage: 'adult',
  personality: null,
  sourcePath: `/x/${id}`,
  friendships: {},
  lastSeenAt: 0,
});

const stateWithCreature = (c: Creature) => ({ ...emptyState(0), creatures: { [c.id]: c } });

describe('reconcile leaves projects alone', () => {
  it('a helper scan that finds nothing must NOT auto-release project creatures', () => {
    // Without this guard, the first refresh() after a project moves in would
    // evict every project — the helper scan knows nothing about them.
    const resident = creatureFromProject(project(), 100);
    const result = reconcile(stateWithCreature(resident), { creatures: [], problems: [] }, 2000);
    expect(result.released).toEqual([]);
    expect(result.state.creatures[resident.id]).toBeDefined();
    expect(result.events.filter((e) => e.type === 'auto-released')).toEqual([]);
  });
});

describe('linkHelpers — the §3 resolution table', () => {
  const roster = {
    'skill:brainstorming': anyCreature('skill:brainstorming', 'skill'),
    'agent:code-reviewer': anyCreature('agent:code-reviewer', 'agent'),
  };
  it('resolves only mentions with a creature on disk; the rest are tallied, never lost', () => {
    const { helperIds, unresolved } = linkHelpers(
      ['brainstorming', 'anthropic-skills:xlsx', 'claude-api', 'general-purpose', 'code-reviewer'],
      roster,
    );
    expect(helperIds).toEqual(['agent:code-reviewer', 'skill:brainstorming']);
    expect(unresolved).toEqual(['anthropic-skills:xlsx', 'claude-api', 'general-purpose']);
  });
  it('a name that is both a skill and an agent links both', () => {
    const both = { ...roster, 'agent:brainstorming': anyCreature('agent:brainstorming', 'agent') };
    expect(linkHelpers(['brainstorming'], both).helperIds).toEqual([
      'agent:brainstorming', 'skill:brainstorming',
    ]);
  });
});

describe('reconcileProjects', () => {
  it('a new project moves in with resolved links and the unresolved tally', () => {
    const state = stateWithCreature(anyCreature('skill:brainstorming', 'skill'));
    const result = reconcileProjects(state, [project({ helperMentions: ['brainstorming', 'general-purpose'] })], 2000);
    const c = result.state.creatures['project:C--dev-proj-a']!;
    expect(c.kind).toBe('project');
    expect(c.name).toBe('proj-a');
    expect(c.helperIds).toEqual(['skill:brainstorming']);
    expect(c.unresolvedMentions).toEqual(['general-purpose']);
    expect(c.friendships).toEqual({});
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'moved-in', creatureId: 'project:C--dev-proj-a' }),
    );
  });

  it('the identity rule: an existing project keeps stats, bond, nickname; only the signal refreshes', () => {
    const seed = creatureFromProject(project({ lastWorkedAt: 500 }), 100);
    const existing = { ...seed, nickname: 'Bramble', stats: { ...seed.stats, bond: 40 } };
    const result = reconcileProjects(stateWithCreature(existing), [project({ lastWorkedAt: 9000 })], 2000);
    const c = result.state.creatures[existing.id]!;
    expect(c.stats.bond).toBe(40);
    expect(c.nickname).toBe('Bramble');
    expect(c.lastWorkedAt).toBe(9000);
  });

  it('a scan that resolved no cwd keeps the identity the project already had', () => {
    const existing = creatureFromProject(project({ lastWorkedAt: 500 }), 100);
    // What discoverProjects returns when no transcript line yields a cwd: the
    // encoded entry name and no path. True of a newcomer, a downgrade for a
    // project that already knows its own name.
    const blind = project({ displayName: 'C--dev-proj-a', sourcePath: '', lastWorkedAt: 9000 });
    const result = reconcileProjects(stateWithCreature(existing), [blind], 2000);
    const c = result.state.creatures[existing.id]!;
    expect(c.name).toBe('proj-a');
    expect(c.sourcePath).toBe('/home/dev/proj-a');
    expect(c.lastWorkedAt).toBe(9000); // the work signal still refreshes
    expect(result.events).toEqual([]); // and no "Source moved to " with nowhere to move
  });

  it('a retired project is never resurrected — discovery skips it whole', () => {
    const retired = { ...creatureFromProject(project({ lastWorkedAt: 500 }), 100), retired: true };
    const result = reconcileProjects(stateWithCreature(retired), [project({ lastWorkedAt: 9000 })], 2000);
    expect(result.state.creatures[retired.id]!.lastWorkedAt).toBe(500);
    expect(result.events).toEqual([]);
  });

  it('a project missing from the scan is kept, frozen — transcripts expire, villagers do not', () => {
    const existing = creatureFromProject(project(), 100);
    const result = reconcileProjects(stateWithCreature(existing), [], 2000);
    expect(result.state.creatures[existing.id]).toEqual(existing);
  });

  it('helpers in state are untouched by the project fold', () => {
    const helper = anyCreature('skill:brainstorming', 'skill');
    const result = reconcileProjects(stateWithCreature(helper), [project()], 2000);
    expect(result.state.creatures['skill:brainstorming']).toEqual(helper);
  });
});
