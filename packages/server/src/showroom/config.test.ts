import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEED_URL, loadShowroomConfig, parseShowroomConfig } from './config.js';

describe('parseShowroomConfig', () => {
  it('fills defaults for an empty object', () => {
    const { config, warnings } = parseShowroomConfig({});
    expect(config).toEqual({ feedUrl: DEFAULT_FEED_URL, rares: [], trivia: {}, hidden: [] });
    expect(warnings).toEqual([]);
  });

  it('accepts a full config', () => {
    const { config } = parseShowroomConfig({
      feedUrl: 'https://example.test/feed',
      rares: [{ slug: 'homeforge', number: 1, auctionOpensAt: '2026-08-25T21:00:00Z' }],
      trivia: { moon: 'its phase math also lights this village\'s night sky.' },
      hidden: ['dud'],
    });
    expect(config.rares).toHaveLength(1);
    expect(config.trivia.moon).toMatch(/night sky/);
    expect(config.hidden).toEqual(['dud']);
  });

  it('drops a rare with an unparseable date, with a warning', () => {
    const { config, warnings } = parseShowroomConfig({
      rares: [{ slug: 'x', number: 1, auctionOpensAt: 'someday' }],
    });
    expect(config.rares).toEqual([]);
    expect(warnings.join(' ')).toMatch(/auctionOpensAt/);
  });

  it('drops non-string trivia values and non-string hidden entries, with warnings', () => {
    const { config, warnings } = parseShowroomConfig({ trivia: { a: 1 }, hidden: [2, 'ok'] });
    expect(config.trivia).toEqual({});
    expect(config.hidden).toEqual(['ok']);
    expect(warnings).toHaveLength(2);
  });
});

describe('loadShowroomConfig', () => {
  it('returns defaults when the file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'showroom-'));
    const { config } = await loadShowroomConfig(join(dir, 'missing.json'));
    expect(config.feedUrl).toBe(DEFAULT_FEED_URL);
  });

  it('throws on unreadable JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'showroom-'));
    const path = join(dir, 'showroom.config.json');
    await writeFile(path, '{ not json');
    await expect(loadShowroomConfig(path)).rejects.toThrow();
  });
});
