import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { STATE_VERSION, emptyState, type VillageState } from './schema.js';

export interface LoadResult {
  state: VillageState;
  /** True when the main state file could not be used as-is. */
  recovered: boolean;
  /** A sentence for the player explaining what happened, or null when all was well. */
  note: string | null;
}

async function readStateFile(path: string): Promise<VillageState | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as VillageState;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof parsed.version !== 'number' || parsed.version > STATE_VERSION) return null;
    if (typeof parsed.creatures !== 'object' || parsed.creatures === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Never throws. A village that cannot be read is a village that starts fresh,
 * with the player told why — losing a save is bad, but refusing to boot is worse.
 */
export async function loadState(paths: VillagePaths, now: number): Promise<LoadResult> {
  const main = await readStateFile(paths.statePath);
  if (main) return { state: main, recovered: false, note: null };

  // Distinguish "no save yet" from "save is unusable" so first run is silent.
  let mainExists = true;
  try {
    await readFile(paths.statePath, 'utf8');
  } catch {
    mainExists = false;
  }

  if (!mainExists) {
    const backupOnly = await readStateFile(paths.stateBackupPath);
    if (backupOnly) {
      return {
        state: backupOnly,
        recovered: true,
        note: 'The village save was missing, so the backup was used instead.',
      };
    }
    return { state: emptyState(now), recovered: false, note: null };
  }

  const backup = await readStateFile(paths.stateBackupPath);
  if (backup) {
    return {
      state: backup,
      recovered: true,
      note: 'The village save was unreadable or from a newer version, so the backup was used instead.',
    };
  }

  return {
    state: emptyState(now),
    recovered: true,
    note: 'The village save and its backup were both unreadable or from a newer version, so a fresh village was started. Nothing in ~/.claude was touched.',
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
