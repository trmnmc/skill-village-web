import { utimes } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSandbox, transcriptLine, type Sandbox } from '../testing/sandbox.js';
import { emptyScanCache } from './scan-cache.js';
import { discoverProjects, WORKTREE_RE } from './projects.js';

describe('discoverProjects', () => {
  let sandbox: Sandbox;
  beforeEach(async () => { sandbox = await makeSandbox(); });
  afterEach(async () => { await sandbox.cleanup(); });

  const discover = () => discoverProjects(sandbox.paths, emptyScanCache());

  it('one entry with sessions becomes one project', async () => {
    await sandbox.writeTranscript('C--Users-dev-proj-a', 's1', [
      transcriptLine({ cwd: 'C:\\Users\\dev\\proj-a', skill: 'brainstorming' }),
    ]);
    const { projects } = await discover();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: 'project:C--Users-dev-proj-a',
      entryName: 'C--Users-dev-proj-a',
      displayName: 'proj-a',
      sourcePath: 'C:\\Users\\dev\\proj-a',
      helperMentions: ['brainstorming'],
    });
    expect(projects[0]!.lastWorkedAt).toBeGreaterThan(0);
  });

  it('worktree entries fold into their parent (regex pinned from the spec)', async () => {
    expect(WORKTREE_RE.source).toBe('^(.+)--claude-worktrees-.+$');
    await sandbox.writeTranscript('proj-b', 's1', [transcriptLine({ skill: 'tdd' })]);
    const wt = await sandbox.writeTranscript('proj-b--claude-worktrees-feature-123abc', 's2', [
      transcriptLine({ skill: 'debugging' }),
    ]);
    await utimes(wt, new Date('2030-01-01'), new Date('2030-01-01'));
    const { projects } = await discover();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.id).toBe('project:proj-b');
    expect(projects[0]!.helperMentions).toEqual(['debugging', 'tdd']);
    expect(projects[0]!.lastWorkedAt).toBe(new Date('2030-01-01').getTime());
  });

  it('an orphan worktree folds into the synthesized parent name', async () => {
    await sandbox.writeTranscript('proj-c--claude-worktrees-solo-9f', 's1', [transcriptLine({})]);
    const { projects } = await discover();
    expect(projects.map((p) => p.id)).toEqual(['project:proj-c']);
  });

  it('an entry with zero .jsonl files is furniture, skipped', async () => {
    await sandbox.writeTranscript('proj-d', 's1', [transcriptLine({})]);
    // an entry directory with no sessions at all:
    const { mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(join(sandbox.paths.claudeProjectsDir, 'proj-empty'), { recursive: true });
    const { projects } = await discover();
    expect(projects.map((p) => p.id)).toEqual(['project:proj-d']);
  });

  it('the newest cwd wins across sessions; no cwd anywhere falls back to the entry name', async () => {
    const oldFile = await sandbox.writeTranscript('proj-e', 'old', [
      transcriptLine({ cwd: '/home/dev/old-place/proj-e' }),
    ]);
    await utimes(oldFile, new Date('2020-01-01'), new Date('2020-01-01'));
    await sandbox.writeTranscript('proj-e', 'new', [
      transcriptLine({ cwd: '/home/dev/new-place/proj-e-renamed' }),
    ]);
    await sandbox.writeTranscript('proj-f', 's1', [transcriptLine({})]);
    const { projects } = await discover();
    const e = projects.find((p) => p.id === 'project:proj-e')!;
    expect(e.sourcePath).toBe('/home/dev/new-place/proj-e-renamed');
    expect(e.displayName).toBe('proj-e-renamed');
    const f = projects.find((p) => p.id === 'project:proj-f')!;
    expect(f.sourcePath).toBe('');
    expect(f.displayName).toBe('proj-f');
  });

  it('display name splits Windows paths too, on any host platform', async () => {
    await sandbox.writeTranscript('proj-g', 's1', [
      transcriptLine({ cwd: 'C:\\Users\\dev\\Projects\\proj-g' }),
    ]);
    const { projects } = await discover();
    expect(projects[0]!.displayName).toBe('proj-g');
  });

  it('a machine with no ~/.claude/projects is an empty village, not an error', async () => {
    const { rm } = await import('node:fs/promises');
    await rm(sandbox.paths.claudeProjectsDir, { recursive: true, force: true });
    const { projects } = await discover();
    expect(projects).toEqual([]);
  });
});
