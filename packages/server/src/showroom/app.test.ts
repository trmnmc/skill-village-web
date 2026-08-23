import { describe, expect, it } from 'vitest';
import { parseShowroomConfig } from './config.js';
import { buildVillagePayload, type ShowroomEvent } from './state.js';
import { createShowroomApp, wsFrames } from './app.js';
import type { ShowroomRuntime } from './runtime.js';

const CONFIG = parseShowroomConfig({}).config;
const EMPTY = buildVillagePayload({ projects: [], config: CONFIG, events: [], feedStale: false, now: 1000 });

function fakeRuntime(): ShowroomRuntime {
  return {
    getPayload: () => EMPTY,
    subscribe: () => () => undefined,
    poll: async () => undefined,
    setConfig: () => undefined,
    start: () => undefined,
    close: () => undefined,
  };
}

describe('wsFrames', () => {
  it('always leads with the village frame', () => {
    const frames = wsFrames(EMPTY, []).map((f) => JSON.parse(f));
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('village');
  });

  it('adds one hatch frame per live hatch, and none for hatched-away', () => {
    const fresh: ShowroomEvent[] = [
      { at: 1, type: 'hatched', slug: 'spark', name: 'spark' },
      { at: 1, type: 'hatched-away', slug: 'moon', name: 'moon' },
    ];
    const frames = wsFrames(EMPTY, fresh).map((f) => JSON.parse(f));
    expect(frames.map((f) => f.type)).toEqual(['village', 'hatch']);
    expect(frames[1]).toMatchObject({ slug: 'spark', name: 'spark' });
  });
});

describe('createShowroomApp', () => {
  it('serves health and the village with a cache header', async () => {
    const app = await createShowroomApp(fakeRuntime());
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toEqual({ ok: true, villagers: 0 });

    const village = await app.inject({ method: 'GET', url: '/api/village' });
    expect(village.statusCode).toBe(200);
    expect(village.headers['cache-control']).toBe('public, max-age=30');
    expect(village.json().counts).toEqual({ villagers: 0, eggs: 0, rares: 0 });
    await app.close();
  });
});
