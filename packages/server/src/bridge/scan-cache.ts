import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { parseTranscript } from './transcripts.js';

/** Facts per transcript file (remap spec §3). */
export interface FileFacts {
  /**
   * The file's mtime. `~/.claude` is not under OneDrive on the reference
   * machine, so mtimes are trustworthy; line timestamps are the fallback if
   * a platform ever proves otherwise (spec §3) — which is why this is a
   * stored fact and not re-derived by callers.
   */
  lastActivityMs: number;
  cwd: string | null;
  helperMentions: string[];
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  facts: FileFacts;
}

export interface ScanCache {
  version: 1;
  files: Record<string, CacheEntry>;
}

export function emptyScanCache(): ScanCache {
  return { version: 1, files: {} };
}

/** The cache is insurance, never a prerequisite: missing or corrupt reads as empty. */
export async function loadScanCache(paths: VillagePaths): Promise<ScanCache> {
  try {
    const parsed = JSON.parse(await readFile(paths.scanCachePath, 'utf8')) as ScanCache;
    if (parsed?.version === 1 && typeof parsed.files === 'object' && parsed.files !== null) {
      return parsed;
    }
  } catch {
    // fall through to empty
  }
  return emptyScanCache();
}

export async function saveScanCache(paths: VillagePaths, cache: ScanCache): Promise<void> {
  await mkdir(dirname(paths.scanCachePath), { recursive: true });
  await writeFile(paths.scanCachePath, JSON.stringify(cache), 'utf8');
}

/**
 * Facts for every listed file, reparsing only what changed (size or mtime).
 * Returns the next cache, pruned to exactly the files seen this scan, so
 * transcripts Claude Code expires never pin cache entries forever.
 */
export async function collectFacts(
  files: readonly string[],
  previous: ScanCache,
): Promise<{ byFile: Map<string, FileFacts>; cache: ScanCache }> {
  const byFile = new Map<string, FileFacts>();
  const next = emptyScanCache();

  for (const file of files) {
    let size: number;
    let mtimeMs: number;
    try {
      ({ size, mtimeMs } = await stat(file));
    } catch {
      continue; // vanished between listing and reading — next scan settles it
    }

    const hit = previous.files[file];
    if (hit && hit.size === size && hit.mtimeMs === mtimeMs) {
      byFile.set(file, hit.facts);
      next.files[file] = hit;
      continue;
    }

    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const { cwd, helperMentions } = parseTranscript(text);
    const facts: FileFacts = { lastActivityMs: mtimeMs, cwd, helperMentions };
    byFile.set(file, facts);
    next.files[file] = { size, mtimeMs, facts };
  }

  return { byFile, cache: next };
}
