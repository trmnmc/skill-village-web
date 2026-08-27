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
 * A cwd inside `<project>/.claude/worktrees/<name>` names a checkout, not a
 * project — a directory git removes when the worktree is cleaned up. Trim
 * back to the project it hangs off, wherever the cwd came from: which entry's
 * transcript carried it says nothing about which directory it points at.
 *
 * Both separators again — the cwd carries the writing machine's path style,
 * not the reading machine's. Scanned from the end, so a cwd deeper inside the
 * checkout trims too. Unrecognised shapes are returned whole; a wrong guess
 * is worse than a long path.
 */
function trimWorktreeCheckout(p: string): string {
  const sep = p.includes('\\') ? '\\' : '/';
  const parts = p.split(/[\\/]/);
  for (let i = parts.length - 2; i > 0; i--) {
    if (parts[i] === '.claude' && parts[i + 1] === 'worktrees') {
      const project = parts.slice(0, i).join(sep);
      if (project !== '') return project;
    }
  }
  return p;
}

/**
 * Entry names the village can carry. `instances.ts` keys a helper's render
 * instance `<projectId>><helperId>` and `keyCreatureId` splits on the first
 * `>`; a project id embeds its entry name verbatim. `>` is illegal in a
 * Windows file name but legal on Linux and macOS, so an entry holding one
 * would key an aura that answers to the wrong creature — the wrong drag
 * target, the wrong speech bubble. Skipped rather than mis-keyed.
 */
export function entryKeySafe(name: string): boolean {
  return !name.includes('>');
}

/** One transcript file, and whether it belongs to the parent entry or a worktree's. */
interface GroupFile {
  path: string;
  fromParent: boolean;
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
    // Tested against the whole entry name, not the folded parent: only the
    // parent reaches an id, so this drops the odd `>`-named worktree of a
    // sound parent too. Deliberate — such a folder is pathological either
    // way, and the cost is one checkout's work signal, not a villager.
    if (!entryKeySafe(entry.name)) continue;
    const parent = WORKTREE_RE.exec(entry.name)?.[1] ?? entry.name;
    groups.set(parent, [...(groups.get(parent) ?? []), entry.name]);
  }

  // Session transcripts live at the entry's top level; session sub-folders
  // (tool-results and friends) are not transcripts and are not descended into.
  // Each file keeps its provenance: the fold is right for the work signal and
  // wrong for identity, and only provenance can tell the two apart.
  const filesByGroup = new Map<string, GroupFile[]>();
  const allFiles: string[] = [];
  for (const [parent, entries] of groups) {
    const files: GroupFile[] = [];
    for (const name of entries) {
      const dir = join(paths.claudeProjectsDir, name);
      for (const f of await listDir(dir)) {
        if (f.isFile() && f.name.endsWith('.jsonl')) {
          files.push({ path: join(dir, f.name), fromParent: name === parent });
        }
      }
    }
    if (files.length === 0) continue; // zero sessions: skipped (spec §2)
    filesByGroup.set(parent, files);
    allFiles.push(...files.map((f) => f.path));
  }

  const { byFile, cache } = await collectFacts(allFiles, previous);

  const projects: DiscoveredProject[] = [];
  for (const [parent, files] of filesByGroup) {
    let lastWorkedAt = 0;
    const mentions = new Set<string>();
    // Two elections, not one. Work folds (a worktree session IS work on the
    // project); identity does not (a worktree's cwd is a checkout that git
    // deletes). Newest-mtime-wins across the whole fold gave the project the
    // busiest worktree's name and a path inside .claude/worktrees.
    let parentCwd: string | null = null;
    let parentCwdAt = -1;
    let checkoutCwd: string | null = null;
    let checkoutCwdAt = -1;
    for (const { path: file, fromParent } of files) {
      const facts = byFile.get(file);
      if (!facts) continue; // vanished mid-scan
      lastWorkedAt = Math.max(lastWorkedAt, facts.lastActivityMs);
      for (const m of facts.helperMentions) mentions.add(m);
      if (facts.cwd === null) continue;
      if (fromParent) {
        if (facts.lastActivityMs > parentCwdAt) {
          parentCwd = facts.cwd;
          parentCwdAt = facts.lastActivityMs;
        }
      } else if (facts.lastActivityMs > checkoutCwdAt) {
        checkoutCwd = facts.cwd;
        checkoutCwdAt = facts.lastActivityMs;
      }
    }
    if (lastWorkedAt === 0) continue; // every session vanished mid-scan

    // Provenance decides which files are eligible; a worktree entry's cwd is
    // the fallback only, for the orphan case (spec §2) — the parent is real
    // even if Claude never sat in it.
    //
    // Whichever wins is then normalized, because provenance is necessary and
    // not sufficient: a parent-entry transcript can carry a worktree cwd of
    // its own. A session that starts in the parent repo is filed under the
    // parent entry and stays there, but EnterWorktree moves the session's
    // working directory mid-session, and every line after that records the
    // checkout. Measured on the real disk: 3 of this repo's 37 parent-entry
    // transcripts point into `.claude/worktrees`, and one of them was the
    // newest. A cwd under `<project>/.claude/worktrees/<name>` names
    // `<project>` no matter whose transcript carried it.
    const elected = parentCwd ?? checkoutCwd;
    const cwd = elected === null ? null : trimWorktreeCheckout(elected);

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
