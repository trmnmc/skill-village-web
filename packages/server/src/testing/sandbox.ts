import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths, type VillagePaths } from '../config/paths.js';

export interface Sandbox {
  home: string;
  paths: VillagePaths;
  /** Write a skill into the sandbox's ~/.claude/skills/<name>/SKILL.md */
  writeSkill(name: string, contents: string): Promise<string>;
  /** Write an agent into the sandbox's ~/.claude/agents/<name>.md */
  writeAgent(name: string, contents: string): Promise<string>;
  /** Write a session transcript into the sandbox's ~/.claude/projects/<entry>/<session>.jsonl */
  writeTranscript(entry: string, session: string, lines: string[]): Promise<string>;
  cleanup(): Promise<void>;
}

export async function makeSandbox(): Promise<Sandbox> {
  const home = await mkdtemp(join(tmpdir(), 'village-test-'));
  const paths = resolvePaths({ home });
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.userSkillsDir, { recursive: true });
  await mkdir(paths.userAgentsDir, { recursive: true });
  await mkdir(paths.claudeProjectsDir, { recursive: true });

  return {
    home,
    paths,
    async writeSkill(name, contents) {
      const dir = join(paths.userSkillsDir, name);
      await mkdir(dir, { recursive: true });
      const file = join(dir, 'SKILL.md');
      await writeFile(file, contents, 'utf8');
      return file;
    },
    async writeAgent(name, contents) {
      const file = join(paths.userAgentsDir, `${name}.md`);
      await writeFile(file, contents, 'utf8');
      return file;
    },
    async writeTranscript(entry, session, lines) {
      const dir = join(paths.claudeProjectsDir, entry);
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${session}.jsonl`);
      await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
      return file;
    },
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

/** A valid SKILL.md body, for tests that do not care about the content. */
export function skillFixture(name: string, description = 'Use when testing.'): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nDo the thing.\n`;
}

/** A valid agent .md body. */
export function agentFixture(name: string, color?: string): string {
  const colorLine = color ? `color: ${color}\n` : '';
  return `---\nname: ${name}\ndescription: Use when delegating ${name}.\n${colorLine}---\n\nYou are ${name}.\n`;
}

/** A minimal valid transcript line: optional cwd, optional helper mentions. */
export function transcriptLine(opts: { cwd?: string; skill?: string; agent?: string } = {}): string {
  const content: unknown[] = [];
  if (opts.skill) content.push({ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: opts.skill } });
  if (opts.agent) content.push({ type: 'tool_use', id: 't2', name: 'Task', input: { subagent_type: opts.agent } });
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content },
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}
