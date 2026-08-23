import type { Creature } from '@village/core/visual';
import { filterRenderable } from '../net/protocol.js';

export interface ResidentView extends Creature {
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
  hue: string;
}

export interface RareViewFull {
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

export interface NoticeEvent {
  at: number;
  type: string;
  slug: string;
  name: string;
}

export interface ShowroomView {
  residents: ResidentView[];
  eggs: EggView[];
  rare: RareViewFull | null;
  events: NoticeEvent[];
  counts: { villagers: number; eggs: number; rares: number };
  feedStale: boolean;
  trivia: Record<string, string>;
}

const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** The renderable creature, plus the showroom fields with safe defaults. */
function toResident(value: unknown): ResidentView | null {
  const [renderable] = filterRenderable([value]);
  if (!renderable) return null;
  const r = value as Record<string, unknown>;
  return {
    ...renderable,
    slug: typeof r.slug === 'string' ? r.slug : renderable.id.replace(/^swarm:/, ''),
    description: optStr(r.description),
    runs: typeof r.runs === 'number' ? r.runs : 0,
    builtAt: optStr(r.builtAt),
    lastBuiltAt: optStr(r.lastBuiltAt),
    repoUrl: optStr(r.repoUrl),
    liveUrl: optStr(r.liveUrl),
  };
}

function toEgg(value: unknown): EggView | null {
  if (typeof value !== 'object' || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.slug !== 'string' || typeof e.hue !== 'string') return null;
  return {
    slug: e.slug,
    name: typeof e.name === 'string' ? e.name : '',
    runs: typeof e.runs === 'number' ? e.runs : 0,
    description: optStr(e.description),
    lastBuiltAt: optStr(e.lastBuiltAt),
    active: e.active === true,
    hue: e.hue,
  };
}

function toRare(value: unknown): RareViewFull | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.slug !== 'string' || typeof r.number !== 'number' || typeof r.auctionOpensAt !== 'string') return null;
  return {
    slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt,
    name: typeof r.name === 'string' && r.name !== '' ? r.name : r.slug,
    description: optStr(r.description),
    runs: typeof r.runs === 'number' ? r.runs : 0,
    builtAt: optStr(r.builtAt),
    repoUrl: optStr(r.repoUrl),
    liveUrl: optStr(r.liveUrl),
  };
}

function toEvent(value: unknown): NoticeEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.at !== 'number' || typeof e.type !== 'string' || typeof e.slug !== 'string') return null;
  return { at: e.at, type: e.type, slug: e.slug, name: typeof e.name === 'string' ? e.name : e.slug };
}

export function toShowroomView(payload: unknown): ShowroomView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.residents) || !Array.isArray(p.eggs)) return null;
  const counts = p.counts as Record<string, unknown> | undefined;
  return {
    residents: p.residents.map(toResident).filter((r): r is ResidentView => r !== null),
    eggs: p.eggs.map(toEgg).filter((e): e is EggView => e !== null),
    rare: toRare(p.rare),
    events: Array.isArray(p.events) ? p.events.map(toEvent).filter((e): e is NoticeEvent => e !== null) : [],
    counts: {
      villagers: typeof counts?.villagers === 'number' ? counts.villagers : 0,
      eggs: typeof counts?.eggs === 'number' ? counts.eggs : 0,
      rares: typeof counts?.rares === 'number' ? counts.rares : 0,
    },
    feedStale: p.feedStale === true,
    trivia: typeof p.trivia === 'object' && p.trivia !== null
      ? Object.fromEntries(Object.entries(p.trivia as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
      : {},
  };
}

export function parseShowroomMessage(
  raw: string,
): { type: 'village'; view: ShowroomView } | { type: 'hatch'; slug: string; name: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const frame = parsed as Record<string, unknown>;
  if (frame.type === 'village') {
    const view = toShowroomView(frame.village);
    return view ? { type: 'village', view } : null;
  }
  if (frame.type === 'hatch' && typeof frame.slug === 'string') {
    return { type: 'hatch', slug: frame.slug, name: typeof frame.name === 'string' ? frame.name : frame.slug };
  }
  return null;
}
