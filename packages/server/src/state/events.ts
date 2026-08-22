import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from '../config/paths.js';

/**
 * Every kind of thing that can happen in the village. The notice board digest is
 * composed from these, so nothing is ever retroactively invented — if the player
 * reads that two creatures became friends, this log is why.
 */
export type VillageEventType =
  | 'moved-in'
  | 'resynced'
  | 'auto-released'
  | 'cared-for'
  | 'stage-changed'
  | 'import-failed';

export interface VillageEvent {
  at: number;
  type: VillageEventType;
  creatureId?: string;
  detail?: string;
}

export interface ReadOptions {
  /** Only events at or after this timestamp. */
  since?: number;
  /** Return at most this many, taking the most recent. */
  limit?: number;
}

/** Append-only, one JSON object per line. */
export async function appendEvents(paths: VillagePaths, events: VillageEvent[]): Promise<void> {
  if (events.length === 0) return;
  await mkdir(dirname(paths.eventLogPath), { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await appendFile(paths.eventLogPath, `${lines}\n`, 'utf8');
}

export async function readEvents(
  paths: VillagePaths,
  options: ReadOptions = {},
): Promise<VillageEvent[]> {
  let raw: string;
  try {
    raw = await readFile(paths.eventLogPath, 'utf8');
  } catch {
    return [];
  }

  const events: VillageEvent[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as VillageEvent;
      if (typeof parsed?.at === 'number' && typeof parsed?.type === 'string') {
        events.push(parsed);
      }
    } catch {
      // A half-written line from a crash. The rest of the log is still good.
    }
  }

  const filtered = options.since === undefined
    ? events
    : events.filter((event) => event.at >= options.since!);

  return options.limit === undefined ? filtered : filtered.slice(-options.limit);
}
