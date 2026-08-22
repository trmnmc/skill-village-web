import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSandbox, skillFixture, agentFixture, type Sandbox } from '../testing/sandbox.js';
import { scanVillage } from './scan.js';

let sandbox: Sandbox | null = null;
afterEach(async () => { await sandbox?.cleanup(); sandbox = null; });

describe('scanVillage', () => {
  it('finds nothing in an empty home', async () => {
    sandbox = await makeSandbox();
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it('does not throw when ~/.claude does not exist at all', async () => {
    sandbox = await makeSandbox();
    await rm(join(sandbox.home, '.claude'), { recursive: true, force: true });
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures).toEqual([]);
  });

  it('imports a valid skill', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('code-review', skillFixture('code-review'));
    const result = await scanVillage(sandbox.paths, 100);
    expect(result.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
    expect(result.creatures[0]!.sourcePath).toContain('SKILL.md');
  });

  it('imports a valid agent', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeAgent('web-research', agentFixture('web-research'));
    const result = await scanVillage(sandbox.paths, 100);
    expect(result.creatures.map((c) => c.id)).toEqual(['agent:web-research']);
  });

  it('finds agents in subdirectories, which Claude Code scans recursively', async () => {
    sandbox = await makeSandbox();
    const nested = join(sandbox.paths.userAgentsDir, 'team');
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, 'reviewer.md'), agentFixture('reviewer'), 'utf8');
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures.map((c) => c.id)).toEqual(['agent:reviewer']);
  });

  it('reports a broken skill as a problem without blocking the good ones', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('good', skillFixture('good'));
    await sandbox.writeSkill('broken', '# no frontmatter at all\n');
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures.map((c) => c.id)).toEqual(['skill:good']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.path).toContain('broken');
    expect(result.problems[0]!.errors.join(' ')).toMatch(/frontmatter/i);
  });

  it('ignores a skill directory with no SKILL.md', async () => {
    sandbox = await makeSandbox();
    await mkdir(join(sandbox.paths.userSkillsDir, 'empty-dir'), { recursive: true });
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it('ignores non-markdown files in the agents directory', async () => {
    sandbox = await makeSandbox();
    await writeFile(join(sandbox.paths.userAgentsDir, 'notes.txt'), 'hello', 'utf8');
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it('also scans the project .claude when launched inside a project', async () => {
    sandbox = await makeSandbox();
    const projectDir = join(sandbox.home, 'work');
    const projectSkills = join(projectDir, '.claude', 'skills', 'local-thing');
    await mkdir(projectSkills, { recursive: true });
    await writeFile(join(projectSkills, 'SKILL.md'), skillFixture('local-thing'), 'utf8');

    const { resolvePaths } = await import('../config/paths.js');
    const paths = resolvePaths({ home: sandbox.home, projectDir });
    const result = await scanVillage(paths, 0);
    expect(result.creatures.map((c) => c.id)).toEqual(['skill:local-thing']);
  });

  it('prefers the project copy when a name exists in both scopes', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('shared', skillFixture('shared', 'The user-level one.'));
    const projectDir = join(sandbox.home, 'work');
    const projectSkills = join(projectDir, '.claude', 'skills', 'shared');
    await mkdir(projectSkills, { recursive: true });
    await writeFile(join(projectSkills, 'SKILL.md'), skillFixture('shared', 'The project one.'), 'utf8');

    const { resolvePaths } = await import('../config/paths.js');
    const paths = resolvePaths({ home: sandbox.home, projectDir });
    const result = await scanVillage(paths, 0);
    expect(result.creatures).toHaveLength(1);
    expect(result.creatures[0]!.sourcePath).toContain('work');
  });

  it('returns creatures sorted by id, so scans are comparable run to run', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('zebra', skillFixture('zebra'));
    await sandbox.writeSkill('alpha', skillFixture('alpha'));
    await sandbox.writeAgent('middle', agentFixture('middle'));
    const result = await scanVillage(sandbox.paths, 0);
    expect(result.creatures.map((c) => c.id)).toEqual(['agent:middle', 'skill:alpha', 'skill:zebra']);
  });
});
