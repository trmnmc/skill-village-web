import { describe, expect, it } from 'vitest';
import type { SwarmProject } from '../bridge/swarm.js';
import { parseShowroomConfig } from './config.js';
import { buildVillagePayload, classify, diffSnapshots, mergeRoster, newRareEvents, resolveRares } from './state.js';

const T = 1_756_000_000_000;

function project(slug: string, over: Partial<SwarmProject> = {}): SwarmProject {
  return {
    slug, name: slug, runs: 1, description: null,
    builtAt: null, lastBuiltAt: null, repoUrl: null, liveUrl: null,
    ...over,
  };
}
const egg = (slug: string) => project(slug);
const common = (slug: string) => project(slug, { repoUrl: `https://github.com/trmnmc/${slug}` });

describe('classify', () => {
  it('an entry without a repo link is an egg', () => {
    expect(classify(egg('dinner'))).toBe('egg');
  });
  it('an entry with a repo link is a common', () => {
    expect(classify(common('moon'))).toBe('common');
  });
});

describe('diffSnapshots', () => {
  it('emits nothing on the first-ever snapshot (no history, no stories)', () => {
    expect(diffSnapshots(null, [egg('a'), common('b')], T)).toEqual([]);
  });

  it('new slug arriving as an egg → egg-laid', () => {
    expect(diffSnapshots([], [egg('dinner')], T)).toEqual([
      { at: T, type: 'egg-laid', slug: 'dinner', name: 'dinner' },
    ]);
  });

  it('new slug arriving already built → hatched-away (hatched while the lights were out)', () => {
    expect(diffSnapshots([], [common('moon')], T)).toEqual([
      { at: T, type: 'hatched-away', slug: 'moon', name: 'moon' },
    ]);
  });

  it('a known egg gaining a repo → hatched (the live moment)', () => {
    expect(diffSnapshots([egg('spark')], [common('spark')], T)).toEqual([
      { at: T, type: 'hatched', slug: 'spark', name: 'spark' },
    ]);
  });

  it('a slug vanishing from the feed → orphaned', () => {
    expect(diffSnapshots([common('gone')], [], T)).toEqual([
      { at: T, type: 'orphaned', slug: 'gone', name: 'gone' },
    ]);
  });

  it('a stable feed emits nothing', () => {
    expect(diffSnapshots([egg('a'), common('b')], [egg('a'), common('b')], T)).toEqual([]);
  });
});

describe('newRareEvents', () => {
  const { config } = parseShowroomConfig({
    rares: [{ slug: 'homeforge', number: 1, auctionOpensAt: '2026-08-25T21:00:00Z' }],
  });

  it('emits rare-confirmed once for a hatched configured rare', () => {
    expect(newRareEvents(config, [], [common('homeforge')], T)).toEqual([
      { at: T, type: 'rare-confirmed', slug: 'homeforge', name: 'homeforge' },
    ]);
  });

  it('is idempotent: a prior rare-confirmed for the slug suppresses it', () => {
    const prior = [{ at: T - 1, type: 'rare-confirmed' as const, slug: 'homeforge', name: 'homeforge' }];
    expect(newRareEvents(config, prior, [common('homeforge')], T)).toEqual([]);
  });

  it('a configured rare that is still an egg or missing emits nothing', () => {
    expect(newRareEvents(config, [], [egg('homeforge')], T)).toEqual([]);
    expect(newRareEvents(config, [], [], T)).toEqual([]);
  });
});

describe('mergeRoster', () => {
  it('fetched wins per slug, vanished residents are retained, arrivals appended', () => {
    const roster = [egg('spark'), common('moon')];
    const fetched = [common('spark'), common('aphorism')]; // moon vanished, spark hatched, aphorism arrived
    expect(mergeRoster(roster, fetched)).toEqual([common('spark'), common('moon'), common('aphorism')]);
  });
});

const RARE_CFG = parseShowroomConfig({
  rares: [{ slug: 'homeforge', number: 1, auctionOpensAt: '2026-08-25T21:00:00Z' }],
  trivia: { moon: "its phase math also lights this village's night sky." },
  hidden: ['dud'],
}).config;

describe('resolveRares', () => {
  it('resolves a hatched configured rare with its feed fields', () => {
    const { rares, ignored } = resolveRares(RARE_CFG, [common('homeforge')]);
    expect(rares).toHaveLength(1);
    expect(rares[0]).toMatchObject({ slug: 'homeforge', number: 1, repoUrl: expect.stringContaining('homeforge') });
    expect(ignored).toEqual([]);
  });

  it('ignores (with a reason) a rare that is still an egg or missing from the feed', () => {
    expect(resolveRares(RARE_CFG, [egg('homeforge')]).rares).toEqual([]);
    expect(resolveRares(RARE_CFG, [egg('homeforge')]).ignored[0]).toMatch(/still an egg/);
    expect(resolveRares(RARE_CFG, []).ignored[0]).toMatch(/not in the feed/);
  });
});

describe('buildVillagePayload', () => {
  const NOW = Date.parse('2026-08-23T12:00:00Z');
  const projects = [
    common('moon'),
    project('aphorism', { repoUrl: 'https://github.com/trmnmc/aphorism', lastBuiltAt: '2026-08-23T06:00:00Z', runs: 6 }),
    common('homeforge'),
    common('dud'),           // hidden by config
    egg('dinner'),
  ];
  const payload = buildVillagePayload({ projects, config: RARE_CFG, events: [], feedStale: false, now: NOW });

  it('residents are renderer-shaped, hidden slugs excluded, rare included', () => {
    const ids = payload.residents.map((r) => r.id).sort();
    expect(ids).toEqual(['swarm:aphorism', 'swarm:homeforge', 'swarm:moon']);
    const moon = payload.residents.find((r) => r.slug === 'moon')!;
    expect(moon.kind).toBe('skill');
    expect(moon.nickname).toBe('');
    expect(moon.appearance.winged).toBe(false);
  });

  it('stats: a fresh lastBuiltAt is lively, a stale one dozes, nobody is scruffy', () => {
    const fresh = payload.residents.find((r) => r.slug === 'aphorism')!;
    const stale = payload.residents.find((r) => r.slug === 'moon')!;
    expect(fresh.stats).toEqual({ mood: 80, energy: 80 });
    expect(stale.stats).toEqual({ mood: 60, energy: 20 }); // energy < 25 dozes; mood 60 ≥ 35 never scruffy
  });

  it("eggs carry the future creature's hue and an activity flag", () => {
    expect(payload.eggs).toHaveLength(1);
    expect(payload.eggs[0]).toMatchObject({ slug: 'dinner', active: false });
    expect(payload.eggs[0]!.hue).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('counts are real: villagers include the rare; the pedestal shows the highest drop number', () => {
    expect(payload.counts).toEqual({ villagers: 3, eggs: 1, rares: 1 });
    expect(payload.rare?.slug).toBe('homeforge');
  });

  it('is deterministic: same inputs, same payload', () => {
    const again = buildVillagePayload({ projects, config: RARE_CFG, events: [], feedStale: false, now: NOW });
    expect(again).toEqual(payload);
  });
});
