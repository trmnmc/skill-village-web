import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { collectFacts, type ScanCache } from './scan-cache.js';

/**
 * A worktree checkout's entry folds into its parent project (remap spec §2).
 * Verified on disk 2026-08-23; an orphan worktree (parent never opened
 * directly) still folds into the synthesized parent name.
 */
export const WORKTREE_RE = /^(.+)--claude-worktrees-.+$/;

export interface DiscoveredProject {
  /** `project:<entry-name>`, the folded parent entry. */
  id: string;
  /** The folded parent entry name. Stable — seeds the appearance. */
  entryName: string;
  /** Basename of the newest cwd, or the encoded entry name — ugly but true. */
  displayName: string;
  /** The project's real folder from transcript cwd, '' if unknown. Never written. */
  sourcePath: string;
  /** Newest transcript mtime across the project's sessions, worktrees folded in. */
  lastWorkedAt: number;
  /** Union of helper mentions across sessions. Sorted, deduped. */
  helperMentions: string[];
}

export interface ProjectScan {
  projects: DiscoveredProject[];
  cache: ScanCache;
}

/** Missing reads as empty — a fresh machine is not an error. */
async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * The last path segment, splitting on both separators. Transcript cwds carry
 * the writing machine's own path style; node's path.basename only splits the
 * host platform's, which would leave a Windows cwd whole on the Linux droplet.
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
}

/**
 * Read-only discovery over `~/.claude/projects` (remap spec §2): entry names
 * are the source of truth, worktrees fold into their parents, and an entry
 * with no sessions is skipped — a villager that can never change state is
 * furniture.
 */
export async function discoverProjects(
  paths: VillagePaths,
  previous: ScanCache,
): Promise<ProjectScan> {
  // Group entry directories under their folded parent name.
  const groups = new Map<string, string[]>();
  for (const entry of await listDir(paths.claudeProjectsDir)) {
    if (!entry.isDirectory()) continue;
    const parent = WORKTREE_RE.exec(entry.name)?.[1] ?? entry.name;
    groups.set(parent, [...(groups.get(parent) ?? []), entry.name]);
  }

  // Session transcripts live at the entry's top level; session sub-folders
  // (tool-results and friends) are not transcripts and are not descended into.
  const filesByGroup = new Map<string, string[]>();
  const allFiles: string[] = [];
  for (const [parent, entries] of groups) {
    const files: string[] = [];
    for (const name of entries) {
      const dir = join(paths.claudeProjectsDir, name);
      for (const f of await listDir(dir)) {
        if (f.isFile() && f.name.endsWith('.jsonl')) files.push(join(dir, f.name));
      }
    }
    if (files.length === 0) continue; // zero sessions: skipped (spec §2)
    filesByGroup.set(parent, files);
    allFiles.push(...files);
  }

  const { byFile, cache } = await collectFacts(allFiles, previous);

  const projects: DiscoveredProject[] = [];
  for (const [parent, files] of filesByGroup) {
    let lastWorkedAt = 0;
    let cwd: string | null = null;
    let cwdAt = -1;
    const mentions = new Set<string>();
    for (const file of files) {
      const facts = byFile.get(file);
      if (!facts) continue; // vanished mid-scan
      lastWorkedAt = Math.max(lastWorkedAt, facts.lastActivityMs);
      if (facts.cwd !== null && facts.lastActivityMs > cwdAt) {
        cwd = facts.cwd;
        cwdAt = facts.lastActivityMs;
      }
      for (const m of facts.helperMentions) mentions.add(m);
    }
    if (lastWorkedAt === 0) continue; // every session vanished mid-scan

    projects.push({
      id: `project:${parent}`,
      entryName: parent,
      displayName: cwd ? lastSegment(cwd) : parent,
      sourcePath: cwd ?? '',
      lastWorkedAt,
      helperMentions: [...mentions].sort(),
    });
  }

  projects.sort((a, b) => a.id.localeCompare(b.id));
  return { projects, cache };
}
