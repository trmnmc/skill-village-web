import type { Creature } from '@village/core';
import type { VillageEvent } from '../state/events.js';
import type { ImportProblem, VillageState } from '../state/schema.js';
import type { ScanResult } from './scan.js';

export interface ReconcileResult {
  state: VillageState;
  events: VillageEvent[];
  /** Creatures whose files vanished. The caller archives their shadow copies. */
  released: Creature[];
}

function problemKey(problem: ImportProblem): string {
  return `${problem.path}::${problem.errors.join('|')}`;
}

/**
 * Fold a fresh filesystem scan into the stored village.
 *
 * Pure: no disk, no clock, no mutation of the input. The identity rule is the
 * important one — an existing creature keeps its stats, bond, nickname,
 * friendships and appearance, and only its pointer to disk is refreshed. Editing
 * a skill teaches its creature something; it does not replace the creature.
 */
export function reconcile(state: VillageState, scan: ScanResult, now: number): ReconcileResult {
  const events: VillageEvent[] = [];
  const released: Creature[] = [];
  const creatures: Record<string, Creature> = {};

  for (const found of scan.creatures) {
    const existing = state.creatures[found.id];
    if (!existing) {
      creatures[found.id] = found;
      events.push({ at: now, type: 'moved-in', creatureId: found.id });
      continue;
    }

    if (existing.sourcePath !== found.sourcePath) {
      creatures[found.id] = { ...existing, sourcePath: found.sourcePath };
      events.push({
        at: now,
        type: 'resynced',
        creatureId: found.id,
        detail: `Source moved to ${found.sourcePath}`,
      });
    } else {
      creatures[found.id] = existing;
    }
  }

  for (const [id, creature] of Object.entries(state.creatures)) {
    if (creatures[id]) continue;
    released.push(creature);
    events.push({
      at: now,
      type: 'auto-released',
      creatureId: id,
      detail: 'Its file is no longer on disk.',
    });
  }

  const knownProblems = new Set(state.problems.map(problemKey));
  for (const problem of scan.problems) {
    if (knownProblems.has(problemKey(problem))) continue;
    events.push({
      at: now,
      type: 'import-failed',
      detail: `${problem.path}: ${problem.errors.join(' ')}`,
    });
  }

  return {
    state: { ...state, creatures, problems: scan.problems, updatedAt: now },
    events,
    released,
  };
}
