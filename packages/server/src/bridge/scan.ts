import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseAgent, parseSkill, type Creature } from '@village/core';
import type { VillagePaths } from '../config/paths.js';
import type { ImportProblem } from '../state/schema.js';
import { creatureFromAgent, creatureFromSkill } from './creature.js';

export interface ScanResult {
  creatures: Creature[];
  problems: ImportProblem[];
}

/** Directory listing that treats "missing" as "empty" — a fresh machine is not an error. */
async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function scanSkillsDir(dir: string, now: number, into: ScanResult): Promise<void> {
  for (const entry of await listDir(dir)) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, 'SKILL.md');
    let source: string;
    try {
      source = await readFile(file, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // A missing SKILL.md (or a path component that isn't a directory) means
      // there is no skill here — not a problem. Anything else (e.g. EACCES,
      // EISDIR) means the file exists but couldn't be read, which is a problem.
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      into.problems.push({ path: file, errors: ['File could not be read.'] });
      continue;
    }
    const result = parseSkill(source, entry.name);
    if (result.ok) into.creatures.push(creatureFromSkill(result.value, file, now));
    else into.problems.push({ path: file, errors: result.errors });
  }
}

async function scanAgentsDir(dir: string, now: number, into: ScanResult): Promise<void> {
  for (const entry of await listDir(dir)) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanAgentsDir(full, now, into); // Claude Code scans agents recursively.
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    const stem = basename(entry.name, '.md');
    let source: string;
    try {
      source = await readFile(full, 'utf8');
    } catch {
      into.problems.push({ path: full, errors: ['File could not be read.'] });
      continue;
    }
    const result = parseAgent(source, stem);
    if (result.ok) into.creatures.push(creatureFromAgent(result.value, full, now));
    else into.problems.push({ path: full, errors: result.errors });
  }
}

/**
 * Read-only. Scans user scope first, then project scope, so a project copy wins
 * a name collision — that matches how Claude Code itself resolves them.
 */
export async function scanVillage(paths: VillagePaths, now: number): Promise<ScanResult> {
  const found: ScanResult = { creatures: [], problems: [] };

  await scanSkillsDir(paths.userSkillsDir, now, found);
  await scanAgentsDir(paths.userAgentsDir, now, found);
  if (paths.projectSkillsDir) await scanSkillsDir(paths.projectSkillsDir, now, found);
  if (paths.projectAgentsDir) await scanAgentsDir(paths.projectAgentsDir, now, found);

  const byId = new Map<string, Creature>();
  for (const creature of found.creatures) byId.set(creature.id, creature);

  return {
    creatures: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    problems: found.problems,
  };
}
