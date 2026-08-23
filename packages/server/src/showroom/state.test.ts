import { describe, expect, it } from 'vitest';
import type { SwarmProject } from '../bridge/swarm.js';
import { parseShowroomConfig } from './config.js';
import { classify, diffSnapshots, mergeRoster, newRareEvents } from './state.js';

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
