import type { Creature } from '@village/core';
import { defaultLlmState, type LlmState } from '../llm/ledger.js';

/** Bump when the shape changes incompatibly. loadState refuses anything higher. */
export const STATE_VERSION = 3;

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
 * Upgrade an older on-disk state in memory. v1 -> v2 added the llm block;
 * v2 -> v3 adds the robot house. Called only after the caller has validated
 * `parsed` as a known-version state shape — never with an arbitrary unknown.
 */
export function migrateState(
  parsed: VillageState & { llm?: LlmState; robot?: RobotState },
  now: number,
): VillageState {
  if (parsed.version === 3) return parsed as VillageState;
  if (parsed.version === 2) return { ...parsed, version: 3, robot: { residentId: null } };
  // parsed.version === 1: everything v1 validated still holds.
  return { ...parsed, version: 3, llm: defaultLlmState(now), robot: { residentId: null } };
}
