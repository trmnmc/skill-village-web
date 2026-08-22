import type { Creature } from '@village/core';
import { defaultLlmState, type LlmState } from '../llm/ledger.js';

/** Bump when the shape changes incompatibly. loadState refuses anything higher. */
export const STATE_VERSION = 2;

/** A file that could not be imported. Surfaced as a quiet note, never blocking. */
export interface ImportProblem {
  path: string;
  errors: string[];
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
}

export function emptyState(now: number): VillageState {
  return {
    version: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    creatures: {},
    problems: [],
    llm: defaultLlmState(now),
  };
}

/**
 * Upgrade an older on-disk state in memory. v1 -> v2 adds the llm block with
 * spec defaults. Called only after the caller has validated `parsed` as a
 * known-version state shape (v1 or v2) — never with an arbitrary unknown.
 */
export function migrateState(parsed: VillageState & { llm?: LlmState }, now: number): VillageState {
  if (parsed.version === 2) return parsed as VillageState;
  // parsed.version === 1: everything v1 validated still holds.
  return { ...parsed, version: 2, llm: defaultLlmState(now) };
}
