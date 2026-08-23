import { describe, expect, it } from 'vitest';
import { ago, formatAuctionCountdown, noticeLines, panelModel } from './copy.js';
import type { EggView, RareViewFull, ResidentView } from './protocol.js';

const NOW = Date.parse('2026-08-23T12:00:00Z');

describe('formatAuctionCountdown', () => {
  it('coarse above a day, clock below, open at zero, silent on garbage', () => {
    expect(formatAuctionCountdown(NOW, '2026-08-25T16:00:00Z')).toBe('2d 4h');
    expect(formatAuctionCountdown(NOW, '2026-08-23T19:41:22Z')).toBe('07:41:22');
    expect(formatAuctionCountdown(NOW, '2026-08-23T11:00:00Z')).toBe('open');
    expect(formatAuctionCountdown(NOW, 'someday')).toBe('');
  });
});

describe('ago', () => {
  it('humanizes and passes null through', () => {
    expect(ago(NOW, '2026-08-23T09:00:00Z')).toBe('3h ago');
    expect(ago(NOW, '2026-08-21T09:00:00Z')).toBe('2d ago');
    expect(ago(NOW, '2026-08-23T11:59:30Z')).toBe('just now');
    expect(ago(NOW, null)).toBeNull();
  });
});

describe('noticeLines', () => {
  it('writes the board in the spec\'s words', () => {
    expect(noticeLines([
      { at: 1, type: 'hatched', slug: 's', name: 'prompt-spark' },
      { at: 2, type: 'hatched-away', slug: 'm', name: 'moon' },
      { at: 3, type: 'egg-laid', slug: 'd', name: 'dinner' },
      { at: 4, type: 'orphaned', slug: 'g', name: 'ghost' },
      { at: 5, type: 'rare-confirmed', slug: 'h', name: 'homeforge' },
      { at: 6, type: 'someday-new-type', slug: 'x', name: 'x' },
    ])).toEqual([
      'hatched: prompt-spark.',
      'hatched while the lights were out: moon.',
      'a new arrival at the nursery: dinner.',
      'ghost wandered out of the feed.',
      'the keeper confirmed a rare: homeforge.',
    ]);
  });
});

const egg: EggView = {
  slug: 'dinner', name: '', runs: 2, description: null,
  lastBuiltAt: '2026-08-23T06:00:00Z', active: true, hue: '#e0a3b2',
};
const rare: RareViewFull = {
  slug: 'homeforge', number: 1, auctionOpensAt: '2026-08-25T16:00:00Z',
  name: 'homeforge', description: 'houses from words', runs: 5,
  builtAt: '2026-08-21T00:00:00Z', repoUrl: 'https://github.com/trmnmc/homeforge', liveUrl: 'https://hf.fenley.ai',
};

describe('panelModel', () => {
  it('egg: chip, ????? title, fallback description, the hatch box, no links', () => {
    const m = panelModel({ kind: 'egg', egg }, { trivia: {}, now: NOW });
    expect(m.chip).toBe('EGG · incubating');
    expect(m.title).toBe('?????');
    expect(m.desc).toBe('no description yet — the swarm writes its story as it builds.');
    expect(m.meta).toContain('run 2 under way');
    expect(m.boxes).toEqual(['hatches when the judge calls the build done. no repo yet — still growing.']);
    expect(m.links).toEqual([]);
  });

  it('common: links, trivia, and the never-for-sale box', () => {
    const resident = {
      id: 'swarm:moon', kind: 'skill', name: 'moon', nickname: '',
      appearance: { body: 'round', crown: 'none', winged: false, restPosture: null, palette: { hue: '#7fb6d9', lite: '#a5cde6', dark: '#5795bd' } },
      stats: { mood: 60, energy: 20 },
      slug: 'moon', description: 'moon phases', runs: 4,
      builtAt: '2026-08-20T04:00:00Z', lastBuiltAt: null, repoUrl: 'https://github.com/trmnmc/moon', liveUrl: null,
    } as unknown as ResidentView;
    const m = panelModel({ kind: 'common', resident }, { trivia: { moon: 'night sky line' }, now: NOW });
    expect(m.links).toEqual([{ label: 'repo', href: 'https://github.com/trmnmc/moon' }]);
    expect(m.trivia).toBe('night sky line');
    expect(m.boxes).toEqual(['lives here. commons are never for sale.']);
  });

  it('rare: accent chip, judge meta, countdown box and the promise', () => {
    const m = panelModel({ kind: 'rare', rare }, { trivia: {}, now: NOW });
    expect(m.chip).toBe('✻ RARE DROP №1');
    expect(m.chipAccent).toBe(true);
    expect(m.meta).toContain('judge-picked · keeper-confirmed');
    expect(m.boxes[0]).toBe('auction opens in 2d 4h');
    expect(m.boxes[1]).toBe('1 of 1. one buyer takes the repo, the live app, and the creature itself — it leaves this village and moves into yours.');
    expect(m.links).toHaveLength(2);
  });
});
