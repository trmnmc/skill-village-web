import { readFile } from 'node:fs/promises';
import { applyCare, chatSystemPrompt, spokenSystemPrompt, type CareVerb, type Creature } from '@village/core';
import type { VillagePaths } from './config/paths.js';
import { archiveFromShadow, updateShadow } from './bridge/archive.js';
import { reconcile } from './bridge/reconcile.js';
import { scanVillage } from './bridge/scan.js';
import type { LlmConfig, LlmState } from './llm/ledger.js';
import { generatePersona } from './llm/persona.js';
import type { LlmMode, LlmReply, LlmService } from './llm/service.js';
import { appendEvents, type VillageEvent } from './state/events.js';
import type { VillageState } from './state/schema.js';
import { loadState, saveState } from './state/store.js';
import { applyTick } from './sim/tick.js';

/**
 * Verbs `care` accepts. Chatting is a care verb too, but it happens through
 * `chat()`, which applies the effect itself — so asking `care` for it directly
 * is still refused. Training still needs the model work of a later milestone.
 */
const OFFLINE_VERBS: CareVerb[] = ['pet', 'play'];

/**
 * The village with no model behind it: every request refused, immediately and
 * without touching the disk. Nothing in M1-M3 passed an `llm`, so this is what
 * those villages get, and every one of their tests still describes the truth.
 */
const SILENT_LLM: LlmService = {
  probe: async () => 'silent',
  mode: () => 'silent',
  request: async () => ({ ok: false, why: 'silent' }),
};

/** What the village gives a service so it can read and write the shared ledger. */
export interface LlmHooks {
  getLlm(): LlmState;
  setLlm(next: LlmState): Promise<void>;
  now(): number;
}

export interface VillageOptions {
  paths: VillagePaths;
  /** Defaults to Date.now. Tests inject a controllable clock. */
  now?: () => number;
  /** A ready-made service, keeping its own ledger. Tests use this. */
  llm?: LlmService;
  /**
   * Build the service from the village's own ledger hooks. The service needs
   * somewhere to read and write the budget, and that somewhere is `state.llm`,
   * which does not exist until the village does — so the caller hands over a
   * factory and the village calls it once, at construction, with the hooks.
   * Ignored when `llm` is also given.
   */
  llmFactory?: (hooks: LlmHooks) => LlmService;
}

export type VillageListener = (state: VillageState) => void;

/** What a creature said, and whether it thought of the words itself. */
export interface ChatReply {
  text: string;
  source: 'llm' | 'canned';
}

export interface Village {
  getState(): VillageState;
  /** Rescan the filesystem and fold the result in. */
  refresh(): Promise<void>;
  /** Advance the simulation to the current time. */
  tick(): Promise<void>;
  care(creatureId: string, verb: CareVerb): Promise<void>;
  /**
   * Say something to a creature and hear back. Never rejects on a model
   * failure. `style` picks the voice and the closing instruction: `'bubble'`
   * (the default) writes for the on-screen speech bubble; `'spoken'` writes
   * for the physical robot's speaker and stamps `robotActivityAt()`.
   */
  chat(creatureId: string, message: string, style?: 'bubble' | 'spoken'): Promise<ChatReply>;
  /** Move a creature into (or out of, with null) the physical robot. */
  setRobotResident(creatureId: string | null): Promise<void>;
  /** When the robot last spoke through this process, or null. In-memory only. */
  robotActivityAt(): number | null;
  /**
   * Write the creature's personality card ahead of time, so the first chat
   * doesn't pay for two model calls in a row. Single-flight, quiet on every
   * failure, and a no-op for an unknown id or a creature already carded.
   */
  ensurePersona(creatureId: string): Promise<void>;
  /** Whether a model is answering at all, for the quiet-village banner. */
  llmMode(): LlmMode;
  /** One cheap call to find out whether a model is reachable at all. */
  probeLlm(): Promise<LlmMode>;
  /** Change the daily caps, or turn autonomous spending on. */
  setLlmConfig(patch: Partial<LlmConfig>): Promise<void>;
  subscribe(listener: VillageListener): () => void;
  close(): Promise<void>;
  /** A sentence to show the player about a recovered save, or null. */
  startupNote: string | null;
  /** Where this village keeps its files. The events route needs it. */
  getPaths(): VillagePaths;
}

/** Deterministic pick that shifts as the relationship grows. */
function pickCannedLine(creature: Creature): string {
  const pool = creature.cannedLines;
  if (pool && pool.length > 0) return pool[(creature.stats.bond + creature.stats.xp) % pool.length]!;
  const called = creature.nickname || creature.name;
  return `${called} looks up at you and wiggles happily.`;
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

  /**
   * The tail of the queue of disk writes. Chat is the first thing in the
   * village that holds a turn open for seconds at a time, so its commit now
   * routinely overlaps a tick or a watcher refresh — and two saveState calls
   * running at once race over the one temp file they both rename from, which
   * makes the loser fail with ENOENT. The queue lets them take turns.
   */
  let writing: Promise<void> = Promise.resolve();

  const commit = async (next: VillageState, events: VillageEvent[]) => {
    // In memory the village moves at once; only the disk waits its turn.
    state = next;
    const written = writing.then(async () => {
      // Deliberately the live `state` and not `next`: by the time this turn
      // comes round something newer may have been committed, and the file
      // should hold the newest truth rather than replaying an older one.
      await saveState(paths, state);
      await appendEvents(paths, events);
    });
    // One failed write must not poison the queue for everyone behind it. The
    // caller still hears about its own failure, through `written`.
    writing = written.catch(() => {});
    await written;
    notify();
  };

  // The service reads and writes the ledger through the live `state`, and its
  // writes go down the ordinary commit path, so a spend is saved and broadcast
  // exactly like anything else that happens in the village.
  const llm: LlmService = options.llm
    ?? options.llmFactory?.({
      getLlm: () => state.llm,
      setLlm: async (next) => { await commit({ ...state, llm: next }, []); },
      now,
    })
    ?? SILENT_LLM;

  /** One persona flight per creature, so a race cannot write two of them. */
  const pendingPersona = new Map<string, Promise<void>>();

  /** Epoch millis of the last spoken (robot) turn this process served. */
  let robotLastTurnAt: number | null = null;

  const refresh = async () => {
    const at = now();
    const scan = await scanVillage(paths, at);

    // Every creature on disk is re-mirrored on every refresh, so the shadow copy
    // never goes stale — it always holds the file's latest content, not just what
    // it looked like when first imported. Mirroring straight from the scan covers
    // exactly the creatures reconcile is about to keep, since reconcile takes
    // each one's path from the scan and only ever adds or drops whole creatures.
    for (const creature of scan.creatures) {
      await updateShadow(paths, creature);
    }

    // Fold the scan in and commit with nothing awaited in between. The scan and
    // the mirroring above take real time, and a chat, a persona card or a ledger
    // spend may well have committed while they ran — reconciling a copy of
    // `state` read before all that would revert every one of them, and then save
    // the result as the newest truth.
    const result = reconcile(state, scan, at);
    await commit(result.state, result.events);

    // Departed creatures' mirrors are promoted to the archive afterwards: the
    // mirror is still on disk, and this keeps the read-modify-write above
    // uninterrupted. reconcile() guarantees a creature id is either present
    // (mirrored above) or departed (archived here), never both, so the two loops
    // never touch the same file.
    for (const creature of result.released) {
      await archiveFromShadow(paths, creature.kind, creature.name);
    }
  };

  /**
   * Give a creature its personality the first time anyone speaks to it, and
   * never again — the card is written once so the voice stays the same for
   * life. Single-flight per creature: two chats arriving together share one
   * model call. A failure is silent; the creature stays card-less and speaks
   * from the stock line until a later chat tries again.
   */
  const ensurePersona = async (creatureId: string): Promise<void> => {
    const creature = state.creatures[creatureId];
    if (!creature || creature.personality) return;

    const inFlight = pendingPersona.get(creatureId);
    if (inFlight) return inFlight;

    const flight = (async () => {
      let body = '';
      try {
        body = await readFile(creature.sourcePath, 'utf8');
      } catch {
        // Its file just went missing. It can still be given a name from the
        // little we know, and the next refresh will decide its fate.
      }

      const persona = await generatePersona(llm, {
        kind: creature.kind,
        name: creature.name,
        // A Creature does not carry its file's description, and the body read
        // above still has the frontmatter in it, so nothing is lost by this.
        description: creature.name,
        body,
      });
      if (!persona) {
        // The gap must be visible: a card-less creature chats in a generic
        // voice, and a whole playtest went by before anyone knew why.
        const at = now();
        await commit({ ...state, updatedAt: at }, [{ at, type: 'persona-failed', creatureId, detail: creature.name }]);
        return;
      }

      // Re-read from the live state: the model call took real time, and the
      // ledger write inside it has already replaced `state`.
      const current = state.creatures[creatureId];
      if (!current) return;

      const at = now();
      await commit(
        {
          ...state,
          updatedAt: at,
          creatures: {
            ...state.creatures,
            [creatureId]: {
              ...current,
              nickname: persona.nickname,
              personality: persona.card,
              cannedLines: persona.cannedLines,
            },
          },
        },
        [{ at, type: 'persona-written', creatureId, detail: persona.nickname }],
      );
    })()
      .catch(() => { /* A card is a nicety. Chat carries on without one. */ })
      .finally(() => { pendingPersona.delete(creatureId); });

    pendingPersona.set(creatureId, flight);
    return flight;
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
        throw new Error(`The "${verb}" verb is not available through care; chat happens through the chat endpoint (and the panel that calls it), and training is still to come.`);
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

    async chat(creatureId, message, style = 'bubble') {
      const creature = state.creatures[creatureId];
      if (!creature) throw new Error(`Creature not found: ${creatureId}`);

      await ensurePersona(creatureId);
      // Whatever the persona flight committed is in `state` now, so the prompt
      // is built from the creature as it stands, card and all — but the flight
      // took real time, and a concurrent refresh may have released the creature
      // while it ran, so this is not guaranteed to still exist.
      const fresh = state.creatures[creatureId];
      if (!fresh) throw new Error(`Creature not found: ${creatureId}`);

      // The card travels as the call's actual system prompt — not prepended
      // to the user turn, where it read as a footnote and the voice went mid.
      const system = style === 'spoken' ? spokenSystemPrompt(fresh) : chatSystemPrompt(fresh);
      const prompt = [
        `The player says to you: "${message}"`,
        '',
        style === 'spoken'
          ? 'Reply as yourself, out loud, in one to three short sentences.'
          : 'Reply as yourself, in one or two short sentences.',
      ].join('\n');

      // A request can throw as well as refuse: the service books its spend
      // through this village's own commit, so a disk hiccup surfaces here. The
      // player showed up and must still get an answer, so a throw is just
      // another way of not having one.
      let reply: LlmReply;
      try {
        reply = await llm.request({ kind: 'chatter', budget: 'interactive', prompt, system });
      } catch {
        reply = { ok: false, why: 'failed' };
      }

      // Everything from here reads the state that exists *now*, never a copy
      // taken before the request. The service booked its spend through setLlm
      // while we waited, and the player may have petted the creature or a tick
      // may have run — an older copy would quietly undo all of it.
      const at = now();
      const present = state.creatures[creatureId] ?? fresh;
      const cared: Creature = { ...present, stats: applyCare(present.stats, 'chat'), lastSeenAt: at };
      const text = reply.ok ? reply.text : pickCannedLine(cared);
      await commit(
        {
          ...state,
          updatedAt: at,
          // A creature whose file left the village mid-conversation stays gone:
          // it still got the last word, but the commit must not resurrect it.
          creatures: state.creatures[creatureId]
            ? { ...state.creatures, [creatureId]: cared }
            : state.creatures,
        },
        [{ at, type: 'chatted', creatureId, detail: reply.ok ? 'llm' : 'canned' }],
      );
      if (style === 'spoken') robotLastTurnAt = at;
      return { text, source: reply.ok ? 'llm' : 'canned' };
    },

    async setRobotResident(creatureId) {
      if (creatureId === state.robot.residentId) return;
      const at = now();
      const events: VillageEvent[] = [];
      const previous = state.robot.residentId;
      if (previous !== null) {
        const old = state.creatures[previous];
        events.push({ at, type: 'robot-moved-out', creatureId: previous, detail: old ? old.nickname || old.name : previous });
      }
      if (creatureId !== null) {
        const creature = state.creatures[creatureId];
        if (!creature) throw new Error(`Creature not found: ${creatureId}`);
        events.push({ at, type: 'robot-moved-in', creatureId, detail: creature.nickname || creature.name });
      }
      await commit({ ...state, updatedAt: at, robot: { residentId: creatureId } }, events);
    },

    robotActivityAt() {
      return robotLastTurnAt;
    },

    llmMode() {
      return llm.mode();
    },

    ensurePersona(creatureId) {
      return ensurePersona(creatureId);
    },

    probeLlm() {
      return llm.probe();
    },

    async setLlmConfig(patch) {
      const at = now();
      await commit(
        { ...state, updatedAt: at, llm: { ...state.llm, config: { ...state.llm.config, ...patch } } },
        [],
      );
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async close() {
      listeners.clear();
      // Take a turn in the queue rather than waiting on its tail: a commit that
      // lands while this save is waiting installs a new tail behind us, and a
      // bare `await writing` would leave the two renaming the same temp file.
      const written = writing.then(() => saveState(paths, state));
      writing = written.catch(() => {});
      await written;
    },
  };
}
