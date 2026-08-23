import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { STATE_VERSION, emptyState, migrateState, type VillageState } from './schema.js';

export interface LoadResult {
  state: VillageState;
  /** True when the main state file could not be used as-is. */
  recovered: boolean;
  /** A sentence for the player explaining what happened, or null when all was well. */
  note: string | null;
}

type ReadStateResult =
  | { ok: true; state: VillageState }
  | { ok: false; reason: 'missing' | 'invalid' | 'version' };

async function readStateFile(path: string): Promise<ReadStateResult> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return { ok: false, reason: 'missing' };
  }

  try {
    const parsed = JSON.parse(raw) as VillageState;

    // Validate full shape
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: 'invalid' };
    }

    if (typeof parsed.version !== 'number') {
      return { ok: false, reason: 'invalid' };
    }

    if (parsed.version > STATE_VERSION) {
      return { ok: false, reason: 'version' };
    }

    if (typeof parsed.createdAt !== 'number') {
      return { ok: false, reason: 'invalid' };
    }

    if (typeof parsed.updatedAt !== 'number') {
      return { ok: false, reason: 'invalid' };
    }

    if (typeof parsed.creatures !== 'object' || parsed.creatures === null) {
      return { ok: false, reason: 'invalid' };
    }

    if (!Array.isArray(parsed.problems)) {
      return { ok: false, reason: 'invalid' };
    }

    // A file already at the current version must carry its llm and robot
    // blocks; older versions are missing them by definition and pick up
    // defaults on migration.
    if (parsed.version === STATE_VERSION) {
      if (typeof parsed.llm !== 'object' || parsed.llm === null) {
        return { ok: false, reason: 'invalid' };
      }
      if (typeof parsed.robot !== 'object' || parsed.robot === null) {
        return { ok: false, reason: 'invalid' };
      }
    }

    return { ok: true, state: parsed };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/** A validated on-disk state, upgraded in memory to the current version if needed. */
function migrated(state: VillageState, now: number): VillageState {
  return state.version < STATE_VERSION ? migrateState(state, now) : state;
}

/**
 * Never throws. A village that cannot be read is a village that starts fresh,
 * with the player told why — losing a save is bad, but refusing to boot is worse.
 */
export async function loadState(paths: VillagePaths, now: number): Promise<LoadResult> {
  const main = await readStateFile(paths.statePath);
  if (main.ok) {
    return { state: migrated(main.state, now), recovered: false, note: null };
  }

  // main.reason is 'missing', 'invalid', or 'version'
  const backup = await readStateFile(paths.stateBackupPath);
  if (backup.ok) {
    let note: string;
    if (main.reason === 'missing') {
      note = 'The village save was missing, so the backup was used instead.';
    } else if (main.reason === 'version') {
      note = 'The village save is from a newer version, so the backup was used instead.';
    } else {
      note = 'The village save was unreadable, so the backup was used instead.';
    }
    return {
      state: migrated(backup.state, now),
      recovered: true,
      note,
    };
  }

  // Both main and backup failed. If main didn't exist, this is first run with no save.
  if (main.reason === 'missing') {
    return { state: emptyState(now), recovered: false, note: null };
  }

  let note: string;
  if (main.reason === 'version') {
    note = 'The village save is from a newer version and the backup was unusable or missing, so a fresh village was started. Nothing in ~/.claude was touched.';
  } else {
    note = 'The village save and its backup were both unreadable or from a newer version, so a fresh village was started. Nothing in ~/.claude was touched.';
  }

  return {
    state: emptyState(now),
    recovered: true,
    note,
  };
}

/** Atomic: refresh the backup, write a temp file, then rename over the real one. */
export async function saveState(paths: VillagePaths, state: VillageState): Promise<void> {
  await mkdir(dirname(paths.statePath), { recursive: true });

  try {
    await copyFile(paths.statePath, paths.stateBackupPath);
  } catch {
    // No existing save to back up. Normal on first run.
  }

  const temp = `${paths.statePath}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await rename(temp, paths.statePath);
}
