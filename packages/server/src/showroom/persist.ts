import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SwarmProject } from '../bridge/swarm.js';
import type { ShowroomEvent } from './state.js';

export interface ShowroomPaths {
  dataDir: string;
  snapshotPath: string;
  eventLogPath: string;
  configPath: string;
}

export function resolveShowroomPaths(options: { home?: string; dataDir?: string } = {}): ShowroomPaths {
  const dataDir = options.dataDir ?? join(options.home ?? homedir(), '.swarm-showroom');
  return {
    dataDir,
    snapshotPath: join(dataDir, 'swarm-snapshot.json'),
    eventLogPath: join(dataDir, 'events.jsonl'),
    configPath: join(dataDir, 'showroom.config.json'),
  };
}

/**
 * Validate the STORED shape — camelCase SwarmProject[], not the feed's
 * snake_case. Re-parsing the snapshot through parseSwarmFeed would read
 * `built_at`/`links.repo` off camelCase entries and null every field.
 */
function parseStoredProjects(json: unknown): SwarmProject[] | null {
  if (!Array.isArray(json)) return null;
  const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const out: SwarmProject[] = [];
  for (const raw of json) {
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug === '') return null;
    out.push({
      slug: p.slug,
      name: typeof p.name === 'string' ? p.name : '',
      runs: typeof p.runs === 'number' ? p.runs : 0,
      description: optStr(p.description),
      builtAt: optStr(p.builtAt),
      lastBuiltAt: optStr(p.lastBuiltAt),
      repoUrl: optStr(p.repoUrl),
      liveUrl: optStr(p.liveUrl),
    });
  }
  return out;
}

/** Missing or unreadable snapshot is a cold start, never a crash. */
export async function readSnapshot(paths: ShowroomPaths): Promise<SwarmProject[] | null> {
  try {
    return parseStoredProjects(JSON.parse(await readFile(paths.snapshotPath, 'utf8')));
  } catch {
    return null;
  }
}

export async function writeSnapshot(paths: ShowroomPaths, projects: SwarmProject[]): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });
  const tmp = `${paths.snapshotPath}.tmp`;
  await writeFile(tmp, JSON.stringify(projects, null, 2));
  await rename(tmp, paths.snapshotPath); // atomic swap: a crash mid-write keeps the old snapshot
}

const VALID_TYPES = new Set(['egg-laid', 'hatched', 'hatched-away', 'orphaned', 'rare-confirmed']);

function parseEventLine(line: string): ShowroomEvent | null {
  try {
    const e = JSON.parse(line) as Record<string, unknown>;
    if (typeof e.at !== 'number' || typeof e.slug !== 'string' || typeof e.name !== 'string') return null;
    if (typeof e.type !== 'string' || !VALID_TYPES.has(e.type)) return null;
    return e as unknown as ShowroomEvent;
  } catch {
    return null;
  }
}

export async function readEventLog(paths: ShowroomPaths): Promise<ShowroomEvent[]> {
  let raw: string;
  try {
    raw = await readFile(paths.eventLogPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseEventLine)
    .filter((e): e is ShowroomEvent => e !== null);
}

export async function appendEvents(paths: ShowroomPaths, events: ShowroomEvent[]): Promise<void> {
  if (events.length === 0) return;
  await mkdir(paths.dataDir, { recursive: true });
  await appendFile(paths.eventLogPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
