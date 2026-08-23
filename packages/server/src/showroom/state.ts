import type { SwarmProject } from '../bridge/swarm.js';
import type { ShowroomConfig } from './config.js';

export type ResidentState = 'egg' | 'common';

/**
 * The S1 lifecycle proxy (spec §3), isolated so S2 can swap it for the feed's
 * explicit status without touching anything else: no repo link yet = still
 * incubating; a repo link = the build shipped.
 */
export function classify(p: SwarmProject): ResidentState {
  return p.repoUrl === null ? 'egg' : 'common';
}

export type ShowroomEventType = 'egg-laid' | 'hatched' | 'hatched-away' | 'orphaned' | 'rare-confirmed';

export interface ShowroomEvent {
  at: number;
  type: ShowroomEventType;
  slug: string;
  name: string;
}

const displayName = (p: SwarmProject) => (p.name !== '' ? p.name : p.slug);

/**
 * Everything the notice board will ever say comes from diffing two consecutive
 * snapshots. `prev === null` means no history at all (first boot): emit
 * nothing — the board has no story to tell yet, and inventing one would spam
 * every entry as "new".
 */
export function diffSnapshots(prev: SwarmProject[] | null, next: SwarmProject[], at: number): ShowroomEvent[] {
  if (prev === null) return [];
  const events: ShowroomEvent[] = [];
  const before = new Map(prev.map((p) => [p.slug, p]));
  const after = new Map(next.map((p) => [p.slug, p]));

  for (const p of next) {
    const was = before.get(p.slug);
    if (!was) {
      events.push({ at, type: classify(p) === 'egg' ? 'egg-laid' : 'hatched-away', slug: p.slug, name: displayName(p) });
    } else if (classify(was) === 'egg' && classify(p) === 'common') {
      events.push({ at, type: 'hatched', slug: p.slug, name: displayName(p) });
    }
  }
  for (const p of prev) {
    if (!after.has(p.slug)) events.push({ at, type: 'orphaned', slug: p.slug, name: displayName(p) });
  }
  return events;
}

/**
 * Adding a rare to the config IS the keeper's confirmation (spec §7); the
 * event log remembers which confirmations have already been announced.
 * A configured rare that is not a hatched feed entry is not announced —
 * resolveRares (Task 5) logs why it was ignored.
 */
export function newRareEvents(
  config: ShowroomConfig,
  priorEvents: ShowroomEvent[],
  projects: SwarmProject[],
  at: number,
): ShowroomEvent[] {
  const announced = new Set(priorEvents.filter((e) => e.type === 'rare-confirmed').map((e) => e.slug));
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const events: ShowroomEvent[] = [];
  for (const rare of config.rares) {
    if (announced.has(rare.slug)) continue;
    const p = bySlug.get(rare.slug);
    if (!p || classify(p) !== 'common') continue;
    events.push({ at, type: 'rare-confirmed', slug: rare.slug, name: displayName(p) });
  }
  return events;
}

/**
 * The village never loses anyone silently (spec §8): an entry that vanishes
 * from the feed is retained from the roster — the orphaned event marks it, and
 * only the keeper's `hidden` list removes it. Fetched data wins per slug;
 * arrivals append in fetched order.
 */
export function mergeRoster(roster: SwarmProject[], fetched: SwarmProject[]): SwarmProject[] {
  const byFetched = new Map(fetched.map((p) => [p.slug, p]));
  const merged = roster.map((p) => byFetched.get(p.slug) ?? p);
  const known = new Set(roster.map((p) => p.slug));
  for (const p of fetched) if (!known.has(p.slug)) merged.push(p);
  return merged;
}
