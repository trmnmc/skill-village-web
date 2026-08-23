import { describe, expect, it } from 'vitest';
import { parseShowroomMessage, toShowroomView } from './protocol.js';

const resident = {
  id: 'swarm:moon', kind: 'skill', name: 'Moon', nickname: '',
  appearance: {
    body: 'round', crown: 'none', winged: false, restPosture: null,
    palette: { hue: '#7fb6d9', lite: '#a5cde6', dark: '#5795bd' },
  },
  stats: { mood: 60, energy: 20 },
  slug: 'moon', description: 'moon phases', runs: 4,
  builtAt: '2026-08-20T04:00:00Z', lastBuiltAt: '2026-08-21T04:00:00Z',
  repoUrl: 'https://github.com/trmnmc/moon', liveUrl: null,
};
const egg = {
  slug: 'dinner', name: '', runs: 2, description: null,
  lastBuiltAt: '2026-08-23T06:00:00Z', active: true, hue: '#e0a3b2',
};
const payload = {
  residents: [resident], eggs: [egg], rare: null, events: [],
  counts: { villagers: 1, eggs: 1, rares: 0 }, feedStale: false, trivia: {},
};

describe('toShowroomView', () => {
  it('accepts a well-formed payload', () => {
    const view = toShowroomView(payload)!;
    expect(view.residents[0]!.slug).toBe('moon');
    expect(view.eggs[0]!.hue).toBe('#e0a3b2');
    expect(view.counts.villagers).toBe(1);
  });

  it('drops malformed residents and eggs, keeps the rest', () => {
    const view = toShowroomView({
      ...payload,
      residents: [resident, { id: 'broken' }],
      eggs: [egg, { slug: 42 }],
    })!;
    expect(view.residents).toHaveLength(1);
    expect(view.eggs).toHaveLength(1);
  });

  it('returns null for garbage', () => {
    expect(toShowroomView(null)).toBeNull();
    expect(toShowroomView('nope')).toBeNull();
    expect(toShowroomView({})).toBeNull();
  });
});

describe('parseShowroomMessage', () => {
  it('reads village and hatch frames, rejects the rest', () => {
    const village = parseShowroomMessage(JSON.stringify({ type: 'village', village: payload }));
    expect(village?.type).toBe('village');
    const hatch = parseShowroomMessage(JSON.stringify({ type: 'hatch', slug: 'spark', name: 'spark' }));
    expect(hatch).toEqual({ type: 'hatch', slug: 'spark', name: 'spark' });
    expect(parseShowroomMessage('not json')).toBeNull();
    expect(parseShowroomMessage(JSON.stringify({ type: 'state' }))).toBeNull();
  });
});
