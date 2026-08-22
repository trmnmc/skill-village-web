import { applyCare, type CareVerb } from '@village/core';
import type { VillagePaths } from './config/paths.js';
import { archiveFromShadow, updateShadow } from './bridge/archive.js';
import { reconcile } from './bridge/reconcile.js';
import { scanVillage } from './bridge/scan.js';
import { appendEvents, type VillageEvent } from './state/events.js';
import type { VillageState } from './state/schema.js';
import { loadState, saveState } from './state/store.js';
import { applyTick } from './sim/tick.js';

/** Verbs that need no language model. Chat and train arrive in M4. */
const OFFLINE_VERBS: CareVerb[] = ['pet', 'play'];

export interface VillageOptions {
  paths: VillagePaths;
  /** Defaults to Date.now. Tests inject a controllable clock. */
  now?: () => number;
}

export type VillageListener = (state: VillageState) => void;

export interface Village {
  getState(): VillageState;
  /** Rescan the filesystem and fold the result in. */
  refresh(): Promise<void>;
  /** Advance the simulation to the current time. */
  tick(): Promise<void>;
  care(creatureId: string, verb: CareVerb): Promise<void>;
  subscribe(listener: VillageListener): () => void;
  close(): Promise<void>;
  /** A sentence to show the player about a recovered save, or null. */
  startupNote: string | null;
  /** Where this village keeps its files. The events route needs it. */
  getPaths(): VillagePaths;
}

export async function createVillage(options: VillageOptions): Promise<Village> {
  const { paths } = options;
  const now = options.now ?? (() => Date.now());

  const loaded = await loadState(paths, now());
  let state = loaded.state;
  const listeners = new Set<VillageListener>();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  const commit = async (next: VillageState, events: VillageEvent[]) => {
    state = next;
    await saveState(paths, state);
    await appendEvents(paths, events);
    notify();
  };

  const refresh = async () => {
    const at = now();
    const scan = await scanVillage(paths, at);
    const result = reconcile(state, scan, at);

    // Mirror every present file before anything can delete it, then promote the
    // mirrors of the departed. Order matters: archiving reads what mirroring wrote.
    for (const creature of Object.values(result.state.creatures)) {
      await updateShadow(paths, creature);
    }
    for (const creature of result.released) {
      await archiveFromShadow(paths, creature.kind, creature.name);
    }

    await commit(result.state, result.events);
  };

  await refresh();

  return {
    startupNote: loaded.note,

    getPaths() {
      return paths;
    },

    getState() {
      return state;
    },

    refresh,

    async tick() {
      const result = applyTick(state, now());
      await commit(result.state, result.events);
    },

    async care(creatureId, verb) {
      const creature = state.creatures[creatureId];
      if (!creature) throw new Error(`Creature not found: ${creatureId}`);
      if (!OFFLINE_VERBS.includes(verb)) {
        throw new Error(`The "${verb}" verb is not available yet; it needs the language model (M4).`);
      }

      const at = now();
      const next: VillageState = {
        ...state,
        updatedAt: at,
        creatures: {
          ...state.creatures,
          [creatureId]: { ...creature, stats: applyCare(creature.stats, verb), lastSeenAt: at },
        },
      };
      await commit(next, [{ at, type: 'cared-for', creatureId, detail: verb }]);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async close() {
      listeners.clear();
      await saveState(paths, state);
    },
  };
}
