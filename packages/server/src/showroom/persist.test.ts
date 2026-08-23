import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SwarmProject } from '../bridge/swarm.js';
import type { ShowroomEvent } from './state.js';
import { appendEvents, readEventLog, readSnapshot, resolveShowroomPaths, writeSnapshot } from './persist.js';

const P = (slug: string): SwarmProject => ({
  // Non-null everywhere it can be: the round-trip test must prove camelCase
  // fields survive a restart (a snake_case re-parse would null them all).
  slug, name: slug, runs: 3, description: `about ${slug}`,
  builtAt: '2026-08-20T04:00:00Z', lastBuiltAt: '2026-08-21T04:00:00Z',
  repoUrl: `https://github.com/trmnmc/${slug}`, liveUrl: `https://${slug}.fenley.ai`,
});
const E = (slug: string, at: number): ShowroomEvent => ({ at, type: 'egg-laid', slug, name: slug });

async function sandboxPaths() {
  const home = await mkdtemp(join(tmpdir(), 'showroom-home-'));
  return resolveShowroomPaths({ home });
}

describe('resolveShowroomPaths', () => {
  it('roots everything under <home>/.swarm-showroom', () => {
    const p = resolveShowroomPaths({ home: '/fake' });
    expect(p.dataDir).toBe(join('/fake', '.swarm-showroom'));
    expect(p.snapshotPath).toBe(join(p.dataDir, 'swarm-snapshot.json'));
    expect(p.eventLogPath).toBe(join(p.dataDir, 'events.jsonl'));
    expect(p.configPath).toBe(join(p.dataDir, 'showroom.config.json'));
  });
});

describe('snapshot', () => {
  it('round-trips, creating the directory on first write', async () => {
    const paths = await sandboxPaths();
    await writeSnapshot(paths, [P('moon')]);
    await expect(readSnapshot(paths)).resolves.toEqual([P('moon')]);
  });

  it('reads null when missing, and null (not a crash) when corrupt', async () => {
    const paths = await sandboxPaths();
    await expect(readSnapshot(paths)).resolves.toBeNull();
    await writeSnapshot(paths, [P('moon')]);
    await writeFile(paths.snapshotPath, '{ corrupt');
    await expect(readSnapshot(paths)).resolves.toBeNull();
  });

  it('leaves no temp debris beside the snapshot', async () => {
    const paths = await sandboxPaths();
    await writeSnapshot(paths, [P('a')]);
    await writeSnapshot(paths, [P('a'), P('b')]);
    const raw = await readFile(paths.snapshotPath, 'utf8');
    expect(JSON.parse(raw)).toHaveLength(2);
  });
});

describe('event log', () => {
  it('appends and reads back in order', async () => {
    const paths = await sandboxPaths();
    await appendEvents(paths, [E('a', 1)]);
    await appendEvents(paths, [E('b', 2), E('c', 3)]);
    const events = await readEventLog(paths);
    expect(events.map((e) => e.slug)).toEqual(['a', 'b', 'c']);
  });

  it('skips unparseable lines instead of dying', async () => {
    const paths = await sandboxPaths();
    await appendEvents(paths, [E('a', 1)]);
    await writeFile(paths.eventLogPath, (await readFile(paths.eventLogPath, 'utf8')) + 'not json\n');
    await appendEvents(paths, [E('b', 2)]);
    expect((await readEventLog(paths)).map((e) => e.slug)).toEqual(['a', 'b']);
  });

  it('appendEvents([]) writes nothing and creates nothing', async () => {
    const paths = await sandboxPaths();
    await appendEvents(paths, []);
    await expect(readEventLog(paths)).resolves.toEqual([]);
  });
});
