import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Creature, CreatureKind } from '@village/core';
import type { VillagePaths } from '../config/paths.js';

/** A skill lives in a folder, an agent in a file; both mirror to one flat file here. */
function fileNameFor(kind: CreatureKind, name: string): string {
  return kind === 'skill' ? join(name, 'SKILL.md') : `${name}.md`;
}

export function shadowPathFor(paths: VillagePaths, kind: CreatureKind, name: string): string {
  return join(paths.shadowDir, kind, fileNameFor(kind, name));
}

export function archivePathFor(paths: VillagePaths, kind: CreatureKind, name: string): string {
  return join(paths.archiveDir, kind, fileNameFor(kind, name));
}

/**
 * Mirror a creature's file into the shadow directory.
 *
 * This is what makes "auto-release with an archived last-known copy" possible:
 * once the real file is deleted there is nothing left to copy, so the copy has
 * to already exist. Silently does nothing if the source is gone — that means a
 * delete beat us to it, and the existing mirror is still the last-known copy.
 */
export async function updateShadow(paths: VillagePaths, creature: Creature): Promise<void> {
  const target = shadowPathFor(paths, creature.kind, creature.name);
  await mkdir(dirname(target), { recursive: true });
  try {
    await copyFile(creature.sourcePath, target);
  } catch {
    // Source already gone. Keep whatever mirror we have.
  }
}

/** Promote the mirror to the archive. Returns the archive path, or null if there was no mirror. */
export async function archiveFromShadow(
  paths: VillagePaths,
  kind: CreatureKind,
  name: string,
): Promise<string | null> {
  const from = shadowPathFor(paths, kind, name);
  const to = archivePathFor(paths, kind, name);

  try {
    await readFile(from, 'utf8');
  } catch {
    return null;
  }

  await mkdir(dirname(to), { recursive: true });
  await rm(to, { force: true });
  await rename(from, to);
  return to;
}

export async function readArchived(
  paths: VillagePaths,
  kind: CreatureKind,
  name: string,
): Promise<string | null> {
  try {
    return await readFile(archivePathFor(paths, kind, name), 'utf8');
  } catch {
    return null;
  }
}
