import { readFile } from 'node:fs/promises';

export const DEFAULT_FEED_URL = 'https://swarm.fenley.ai/api/projects';

export interface RareConfig {
  slug: string;
  /** Drop number, shown as "RARE DROP №n". */
  number: number;
  /** ISO timestamp the auction opens; the showroom only counts down to it. */
  auctionOpensAt: string;
}

export interface ShowroomConfig {
  feedUrl: string;
  rares: RareConfig[];
  /** Optional per-slug flavour line for the panel. */
  trivia: Record<string, string>;
  /** Slugs the keeper has delisted entirely. */
  hidden: string[];
}

/**
 * The keeper's hand-edited file (spec §7). Tolerant by design: a bad piece is
 * dropped with a warning, never a crash — the keeper edits this over ssh.
 */
export function parseShowroomConfig(json: unknown): { config: ShowroomConfig; warnings: string[] } {
  const warnings: string[] = [];
  const root = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;

  const feedUrl = typeof root.feedUrl === 'string' && root.feedUrl.length > 0 ? root.feedUrl : DEFAULT_FEED_URL;

  const rares: RareConfig[] = [];
  if (root.rares !== undefined) {
    if (!Array.isArray(root.rares)) warnings.push('rares: expected an array');
    else {
      for (const raw of root.rares) {
        const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        if (typeof r.slug !== 'string' || r.slug === '') { warnings.push('rares: entry without a slug dropped'); continue; }
        if (typeof r.number !== 'number' || !Number.isInteger(r.number) || r.number < 1) {
          warnings.push(`rares[${r.slug}]: number must be a positive integer`); continue;
        }
        if (typeof r.auctionOpensAt !== 'string' || Number.isNaN(Date.parse(r.auctionOpensAt))) {
          warnings.push(`rares[${r.slug}]: auctionOpensAt is not a parseable timestamp`); continue;
        }
        rares.push({ slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt });
      }
    }
  }

  const trivia: Record<string, string> = {};
  if (root.trivia !== undefined) {
    if (typeof root.trivia !== 'object' || root.trivia === null) warnings.push('trivia: expected an object');
    else for (const [slug, line] of Object.entries(root.trivia as Record<string, unknown>)) {
      if (typeof line === 'string') trivia[slug] = line;
      else warnings.push(`trivia[${slug}]: expected a string`);
    }
  }

  const hidden: string[] = [];
  if (root.hidden !== undefined) {
    if (!Array.isArray(root.hidden)) warnings.push('hidden: expected an array');
    else for (const h of root.hidden) {
      if (typeof h === 'string') hidden.push(h);
      else warnings.push('hidden: non-string entry dropped');
    }
  }

  return { config: { feedUrl, rares, trivia, hidden }, warnings };
}

export async function loadShowroomConfig(path: string): Promise<{ config: ShowroomConfig; warnings: string[] }> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return parseShowroomConfig({});
    throw error;
  }
  return parseShowroomConfig(JSON.parse(raw)); // corrupt JSON throws loudly, by design
}
