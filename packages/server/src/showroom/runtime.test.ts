import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SwarmProject } from '../bridge/swarm.js';
import { parseShowroomConfig } from './config.js';
import { resolveShowroomPaths } from './persist.js';
import { createShowroom } from './runtime.js';

const P = (slug: string, repo: boolean): SwarmProject => ({
  slug, name: slug, runs: 1, description: null, builtAt: null, lastBuiltAt: null,
  repoUrl: repo ? `https://github.com/trmnmc/${slug}` : null, liveUrl: null,
});

async function sandbox() {
  const home = await mkdtemp(join(tmpdir(), 'showroom-rt-'));
  return resolveShowroomPaths({ home });
}
const CONFIG = parseShowroomConfig({}).config;

describe('createShowroom', () => {
  it('first poll fills the village without inventing history', async () => {
    const paths = await sandbox();
    const runtime = await createShowroom({
      paths, config: CONFIG, now: () => 1000,
      fetchFeed: async () => [P('moon', true), P('dinner', false)],
    });
    await runtime.poll();
    const payload = runtime.getPayload();
    expect(payload.counts).toEqual({ villagers: 1, eggs: 1, rares: 0 });
    expect(payload.events).toEqual([]); // prev === null: no stories on first contact
    runtime.close();
  });

  it('a hatch between polls emits the event, persists it, and reaches subscribers', async () => {
    const paths = await sandbox();
    let feed = [P('spark', false)];
    const runtime = await createShowroom({ paths, config: CONFIG, now: () => 2000, fetchFeed: async () => feed });
    await runtime.poll();

    const seen: string[] = [];
    const unsubscribe = runtime.subscribe((_payload, fresh) => {
      for (const e of fresh) seen.push(e.type);
    });
    feed = [P('spark', true)];
    await runtime.poll();
    expect(seen).toEqual(['hatched']);
    expect(runtime.getPayload().events[0]).toMatchObject({ type: 'hatched', slug: 'spark' });
    unsubscribe();
    runtime.close();

    // A fresh runtime boots from disk: the villager and its history survive restarts.
    const reborn = await createShowroom({
      paths, config: CONFIG, now: () => 3000,
      fetchFeed: async () => { throw new Error('feed down'); },
    });
    expect(reborn.getPayload().counts.villagers).toBe(1);
    expect(reborn.getPayload().events[0]).toMatchObject({ type: 'hatched', slug: 'spark' });
    reborn.close();
  });

  it('a failed poll keeps the last good village and flags feedStale', async () => {
    const paths = await sandbox();
    let fail = false;
    const runtime = await createShowroom({
      paths, config: CONFIG, now: () => 4000,
      fetchFeed: async () => { if (fail) throw new Error('503'); return [P('moon', true)]; },
    });
    await runtime.poll();
    expect(runtime.getPayload().feedStale).toBe(false);
    fail = true;
    await runtime.poll();
    expect(runtime.getPayload().feedStale).toBe(true);
    expect(runtime.getPayload().counts.villagers).toBe(1); // yesterday's nursery, not an empty pen
    runtime.close();
  });

  it('a resident vanishing from the feed stays in the village, orphaned exactly once', async () => {
    const paths = await sandbox();
    let feed = [P('moon', true)];
    const runtime = await createShowroom({ paths, config: CONFIG, now: () => 5000, fetchFeed: async () => feed });
    await runtime.poll();
    feed = []; // moon drops out of the feed
    await runtime.poll();
    expect(runtime.getPayload().counts.villagers).toBe(1); // retained, never lost silently
    expect(runtime.getPayload().events.filter((e) => e.type === 'orphaned')).toHaveLength(1);
    await runtime.poll(); // still gone — but announced only once
    expect(runtime.getPayload().events.filter((e) => e.type === 'orphaned')).toHaveLength(1);
    runtime.close();
  });

  it('setConfig hides a slug live and notifies subscribers', async () => {
    const paths = await sandbox();
    const runtime = await createShowroom({
      paths, config: CONFIG, now: () => 6000, fetchFeed: async () => [P('moon', true)],
    });
    await runtime.poll();
    let notified = 0;
    runtime.subscribe(() => { notified += 1; });
    runtime.setConfig(parseShowroomConfig({ hidden: ['moon'] }).config);
    expect(notified).toBe(1);
    expect(runtime.getPayload().counts.villagers).toBe(0);
    runtime.close();
  });
});
