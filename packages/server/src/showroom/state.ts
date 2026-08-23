import { generateAppearance, type CreatureAppearance } from '@village/core';
import type { SwarmProject } from '../bridge/swarm.js';
import type { ShowroomConfig } from './config.js';

export type ResidentState = 'egg' | 'common';

/**
 * Stable identity for a swarm-built resident: `swarm:<slug>`. This string is
 * both the showroom resident's id and its DNA name — S4's delivery reproduces
 * the creature in a buyer's village from the slug alone, so NEVER change it.
 */
function swarmResidentId(slug: string): string {
  return `swarm:${slug}`;
}

/**
 * A swarm resident's look. Kind is 'skill' (grounded, never winged); the DNA
 * seed is therefore sha256 of `skill:swarm:<slug>` — the namespace keeps swarm
 * residents from colliding with a player's real skill of the same name.
 */
function swarmAppearance(slug: string): CreatureAppearance {
  return generateAppearance({ kind: 'skill', name: swarmResidentId(slug) });
}

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

export const displayName = (p: SwarmProject) => (p.name !== '' ? p.name : p.slug);

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

export interface SpectatorResident {
  id: string;
  kind: 'skill';
  name: string;
  nickname: '';
  appearance: CreatureAppearance;
  stats: { mood: number; energy: number };
  slug: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  lastBuiltAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

export interface EggView {
  slug: string;
  name: string;
  runs: number;
  description: string | null;
  lastBuiltAt: string | null;
  active: boolean;
  /** The future creature's body hue — the egg wears its spots. */
  hue: string;
}

export interface RareView {
  slug: string;
  number: number;
  auctionOpensAt: string;
  name: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

/** A build within this window counts as actively incubating / lively. */
const ACTIVE_MS = 48 * 60 * 60 * 1000;

function isActive(lastBuiltAt: string | null, now: number): boolean {
  if (lastBuiltAt === null) return false;
  const t = Date.parse(lastBuiltAt);
  return !Number.isNaN(t) && now - t < ACTIVE_MS;
}

export function resolveRares(config: ShowroomConfig, projects: SwarmProject[]): { rares: RareView[]; ignored: string[] } {
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const rares: RareView[] = [];
  const ignored: string[] = [];
  for (const r of config.rares) {
    const p = bySlug.get(r.slug);
    if (!p) { ignored.push(`rare "${r.slug}" is not in the feed`); continue; }
    if (classify(p) !== 'common') { ignored.push(`rare "${r.slug}" is still an egg`); continue; }
    rares.push({
      slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt,
      name: displayName(p), description: p.description, runs: p.runs,
      builtAt: p.builtAt, repoUrl: p.repoUrl, liveUrl: p.liveUrl,
    });
  }
  rares.sort((a, b) => a.number - b.number);
  return { rares, ignored };
}

export interface VillagePayload {
  residents: SpectatorResident[];
  eggs: EggView[];
  /** The pedestal: the highest-numbered resolved rare (the current drop). */
  rare: RareView | null;
  events: ShowroomEvent[];
  counts: { villagers: number; eggs: number; rares: number };
  feedStale: boolean;
  trivia: Record<string, string>;
}

/** How many event lines the payload carries; the log on disk keeps everything. */
const EVENT_TAIL = 20;

export function buildVillagePayload(args: {
  projects: SwarmProject[];
  config: ShowroomConfig;
  events: ShowroomEvent[];
  feedStale: boolean;
  now: number;
}): VillagePayload {
  const hidden = new Set(args.config.hidden);
  const visible = args.projects.filter((p) => !hidden.has(p.slug));

  const residents: SpectatorResident[] = visible
    .filter((p) => classify(p) === 'common')
    .map((p) => {
      const active = isActive(p.lastBuiltAt, args.now);
      return {
        id: swarmResidentId(p.slug),
        kind: 'skill' as const,
        name: displayName(p),
        nickname: '' as const,
        appearance: swarmAppearance(p.slug),
        // Against behaviour.ts thresholds: energy 20 dozes (< 25), energy 80 is
        // awake and can hop (> 70 with mood > 75). Mood never drops below 35:
        // showroom residents are swarm's charges and are never scruffy.
        stats: active ? { mood: 80, energy: 80 } : { mood: 60, energy: 20 },
        slug: p.slug,
        description: p.description,
        runs: p.runs,
        builtAt: p.builtAt,
        lastBuiltAt: p.lastBuiltAt,
        repoUrl: p.repoUrl,
        liveUrl: p.liveUrl,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const eggs: EggView[] = visible
    .filter((p) => classify(p) === 'egg')
    .map((p) => ({
      slug: p.slug,
      name: p.name, // '' stays '': the client renders the "?????" egg
      runs: p.runs,
      description: p.description,
      lastBuiltAt: p.lastBuiltAt,
      active: isActive(p.lastBuiltAt, args.now),
      hue: swarmAppearance(p.slug).palette.hue,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const { rares } = resolveRares(args.config, visible);

  return {
    residents,
    eggs,
    rare: rares.length > 0 ? rares[rares.length - 1]! : null,
    events: args.events.slice(-EVENT_TAIL).reverse(),
    counts: { villagers: residents.length, eggs: eggs.length, rares: rares.length },
    feedStale: args.feedStale,
    trivia: args.config.trivia,
  };
}
