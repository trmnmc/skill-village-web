import { describe, expect, it } from 'vitest';
import { fetchSwarmFeed, parseSwarmFeed } from './swarm.js';

const entry = {
  slug: 'moon', name: 'Moon', runs: 4,
  description: 'A zero-dependency Node CLI that prints the current phase of the moon',
  built_at: '2026-08-20T04:00:00Z', last_built_at: '2026-08-21T04:00:00Z',
  links: { repo: 'https://github.com/trmnmc/moon', live: 'https://moon.fenley.ai' },
};

describe('parseSwarmFeed', () => {
  it('parses a bare array', () => {
    const [p] = parseSwarmFeed([entry]);
    expect(p).toEqual({
      slug: 'moon', name: 'Moon', runs: 4,
      description: 'A zero-dependency Node CLI that prints the current phase of the moon',
      builtAt: '2026-08-20T04:00:00Z', lastBuiltAt: '2026-08-21T04:00:00Z',
      repoUrl: 'https://github.com/trmnmc/moon', liveUrl: 'https://moon.fenley.ai',
    });
  });

  it('parses a { projects: [...] } envelope', () => {
    expect(parseSwarmFeed({ projects: [entry] })).toHaveLength(1);
  });

  it('keeps sparse entries — "dinner"-style is legal, not malformed', () => {
    const [p] = parseSwarmFeed([{ slug: 'dinner', runs: 2 }]);
    expect(p).toEqual({
      slug: 'dinner', name: '', runs: 2, description: null,
      builtAt: null, lastBuiltAt: null, repoUrl: null, liveUrl: null,
    });
  });

  it('skips entries without a slug, keeping the rest', () => {
    const out = parseSwarmFeed([{ name: 'ghost' }, entry, 42, null]);
    expect(out.map((p) => p.slug)).toEqual(['moon']);
  });

  it('coerces bad runs to 0 rather than dropping the entry', () => {
    expect(parseSwarmFeed([{ slug: 'x', runs: 'many' }])[0]!.runs).toBe(0);
  });

  it('throws when the payload is not a feed at all', () => {
    expect(() => parseSwarmFeed('<html>oops</html>')).toThrow(/not a swarm feed/i);
    expect(() => parseSwarmFeed({ nope: true })).toThrow(/not a swarm feed/i);
  });
});

describe('fetchSwarmFeed', () => {
  it('fetches, parses, and returns projects', async () => {
    const fake = (async () =>
      new Response(JSON.stringify([entry]), { status: 200 })) as typeof fetch;
    await expect(fetchSwarmFeed('https://example.test/api/projects', fake)).resolves.toHaveLength(1);
  });

  it('throws on a non-2xx status', async () => {
    const fake = (async () => new Response('down', { status: 503 })) as typeof fetch;
    await expect(fetchSwarmFeed('https://example.test/api/projects', fake)).rejects.toThrow(/503/);
  });
});
