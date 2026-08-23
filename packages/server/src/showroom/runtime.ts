import { fetchSwarmFeed, type SwarmProject } from '../bridge/swarm.js';
import type { ShowroomConfig } from './config.js';
import { appendEvents, readEventLog, readSnapshot, writeSnapshot, type ShowroomPaths } from './persist.js';
import {
  buildVillagePayload, diffSnapshots, mergeRoster, newRareEvents, resolveRares,
  type ShowroomEvent, type VillagePayload,
} from './state.js';

export const POLL_MS = 5 * 60 * 1000;

export interface ShowroomRuntime {
  getPayload(): VillagePayload;
  subscribe(fn: (payload: VillagePayload, fresh: ShowroomEvent[]) => void): () => void;
  poll(): Promise<void>;
  /** Live keeper-config swap (SIGHUP path); notifies subscribers with [] fresh. */
  setConfig(config: ShowroomConfig): void;
  start(): void;
  close(): void;
}

export async function createShowroom(options: {
  paths: ShowroomPaths;
  config: ShowroomConfig;
  fetchFeed?: (url: string) => Promise<SwarmProject[]>;
  now?: () => number;
  log?: (line: string) => void;
}): Promise<ShowroomRuntime> {
  const fetchFeed = options.fetchFeed ?? ((url: string) => fetchSwarmFeed(url));
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.error(line));

  let config = options.config;
  /** The merged roster: feed truth plus retained orphans. Null = never seen the feed. */
  let roster: SwarmProject[] | null = await readSnapshot(options.paths);
  let events: ShowroomEvent[] = await readEventLog(options.paths);
  let feedStale = false;
  let timer: NodeJS.Timeout | null = null;
  const subscribers = new Set<(payload: VillagePayload, fresh: ShowroomEvent[]) => void>();

  const payload = (): VillagePayload =>
    buildVillagePayload({ projects: roster ?? [], config, events, feedStale, now: now() });

  function notify(fresh: ShowroomEvent[]): void {
    const p = payload();
    for (const fn of subscribers) fn(p, fresh);
  }

  async function poll(): Promise<void> {
    const at = now();
    let fetched: SwarmProject[];
    try {
      fetched = await fetchFeed(config.feedUrl);
    } catch (error) {
      feedStale = true;
      log(`showroom: feed poll failed — serving the last good snapshot (${(error as Error).message})`);
      notify([]);
      return;
    }
    feedStale = false;
    // An orphan retained in the roster is missing from every future fetch;
    // the event log remembers who was already announced so it is said once.
    const alreadyOrphaned = new Set(events.filter((e) => e.type === 'orphaned').map((e) => e.slug));
    const fresh = [
      ...diffSnapshots(roster, fetched, at).filter((e) => e.type !== 'orphaned' || !alreadyOrphaned.has(e.slug)),
      ...newRareEvents(config, events, fetched, at),
    ];
    for (const reason of resolveRares(config, fetched).ignored) log(`showroom: ${reason} — ignored`);
    roster = roster === null ? fetched : mergeRoster(roster, fetched);
    events = events.concat(fresh);
    await writeSnapshot(options.paths, roster);
    await appendEvents(options.paths, fresh);
    notify(fresh);
  }

  return {
    getPayload: payload,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    poll,
    setConfig(next) {
      config = next;
      notify([]);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void poll().catch((e) => log(`showroom: poll crashed: ${(e as Error).message}`)), POLL_MS);
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      subscribers.clear();
    },
  };
}
