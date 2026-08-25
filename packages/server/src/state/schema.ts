import { STAT_FLOOR, type Creature } from '@village/core';
import { defaultLlmState, type LlmState } from '../llm/ledger.js';

/** Bump when the shape changes incompatibly. loadState refuses anything higher. */
export const STATE_VERSION = 4;

/** A file that could not be imported. Surfaced as a quiet note, never blocking. */
export interface ImportProblem {
  path: string;
  errors: string[];
}

/** Who lives in the physical robot (R-track). Null: the house stands empty. */
export interface RobotState {
  residentId: string | null;
}

export interface VillageState {
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Keyed by creature id (`${kind}:${name}`). */
  creatures: Record<string, Creature>;
  problems: ImportProblem[];
  /** Budget ledger and caps for the language model (M4). */
  llm: LlmState;
  /** Who currently lives in the physical robot (R1/R2). */
  robot: RobotState;
}

export function emptyState(now: number): VillageState {
  return {
    version: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    creatures: {},
    problems: [],
    llm: defaultLlmState(now),
    robot: { residentId: null },
  };
}

/**
 * Lift a creature back to the resting floor. Saves written while the floor sat
 * below the renderer's sleep line stranded every villager under it — decay
 * relaxes toward the floor now, but only over a half-life a day long, so the
 * upgrade does it at once rather than leaving a village asleep for a day.
 */
function rested(creature: Creature): Creature {
  const { mood, energy } = creature.stats;
  if (mood >= STAT_FLOOR && energy >= STAT_FLOOR) return creature;
  return {
    ...creature,
    stats: { ...creature.stats, mood: Math.max(mood, STAT_FLOOR), energy: Math.max(energy, STAT_FLOOR) },
  };
}

/**
 * Upgrade an older on-disk state in memory. v1 -> v2 adds the llm block with
 * spec defaults; v2 -> v3 lifts stats stranded below the resting floor;
 * v3 -> v4 adds the robot house. Each step is pinned to its own version number,
 * so a save arriving at any floor picks up every upgrade above it. Called only
 * after the caller has validated `parsed` as a known-version state shape —
 * never with an arbitrary unknown.
 */
export function migrateState(
  parsed: VillageState & { llm?: LlmState; robot?: RobotState },
  now: number,
): VillageState {
  // v1: everything v1 validated still holds; it only lacks the llm block.
  let state: VillageState =
    parsed.version === 1 ? { ...parsed, version: 2, llm: defaultLlmState(now) } : (parsed as VillageState);
  if (state.version === 2) {
    const creatures: Record<string, Creature> = {};
    for (const [id, creature] of Object.entries(state.creatures)) creatures[id] = rested(creature);
    state = { ...state, version: 3, creatures };
  }
  if (state.version === 3) state = { ...state, version: 4, robot: { residentId: null } };
  return state;
}
