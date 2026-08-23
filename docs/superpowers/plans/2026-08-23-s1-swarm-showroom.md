# Swarm Showroom (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public spectator village — a hosted page that renders the Swarm feed as a living pixel village: eggs incubating, commons wandering, one rare on a pedestal with an auction countdown.

**Architecture:** A second slim server entry point (`packages/server/src/showroom/`) polls the swarm feed every 5 minutes, infers egg/common/rare state with pure functions, persists a snapshot + event log under `~/.swarm-showroom/`, and serves one REST endpoint plus a WebSocket. A spectator build of `packages/web` (its own `spectator.html` entry + vite config) reuses the game's compositor, motion, and creature actors wholesale, adding an egg renderer, a read-only side panel, and the hatch sequence.

**Tech Stack:** TypeScript ESM (`.js` import suffixes), Node 20+ (global `fetch`), Fastify + @fastify/websocket (already dependencies), KAPLAY, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-swarm-showroom-design.md` — read it before starting; §3 (lifecycle inference), §6 (panel copy, verbatim strings), §7 (keeper config), §8 (failure modes) are load-bearing for tasks below.

## Global Constraints

- **No new npm dependencies.** Node 20 global `fetch`; static files served by the droplet's nginx in production, never by fastify.
- **Read-only toward Swarm:** network GETs only. Never touch `~/.claude`. All showroom data lives under `~/.swarm-showroom/`.
- Monorepo conventions: ESM with `.js` suffixes on relative imports; server imports core as `@village/core`; web imports `@village/core/visual`. Tests are colocated `*.test.ts`, Vitest, run from repo root: `npx vitest run <path>`.
- Copy strings from spec §6 are **verbatim** — do not rephrase. They appear in Task 10 as literals.
- Visual palette: only `THEME` values (`packages/web/src/theme.ts`) + the core creature palette. Fonts: Pixelify Sans (display) and IBM Plex Mono (body) only.
- The two staging laws (spec §5): ground everything (contact shadows, overlap); selective animation on individual phase offsets, architecture never moves.
- Behaviour thresholds (`packages/web/src/motion/behaviour.ts`): `SLEEP_BELOW = 25`, `HAPPY_ABOVE = 75`, `RESTED_ABOVE = 70`, `SCRUFFY_BELOW = 35`. Synthesized stats in Task 5 are chosen against these — do not change them.
- Commit after every task with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Ports: game server owns 8262; the showroom server defaults to **8263** (`SHOWROOM_PORT`).

---

### Task 1: Core swarm identity (`swarm:<slug>` DNA)

**Files:**
- Create: `packages/core/src/swarm.ts`
- Create: `packages/core/src/swarm.test.ts`
- Modify: `packages/core/src/index.ts` (add one re-export line)

**Interfaces:**
- Consumes: `generateAppearance` from `./appearance/generate.js`, `CreatureAppearance` from `./types.js`.
- Produces: `swarmResidentId(slug: string): string` and `swarmAppearance(slug: string): CreatureAppearance` — Tasks 5 and 11 call these; S4 will reuse them for delivery, so the seed must never change once landed.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/swarm.test.ts
import { describe, expect, it } from 'vitest';
import { swarmAppearance, swarmResidentId } from './swarm.js';
import { BODY_IDS, CROWN_IDS } from './types.js';

describe('swarmResidentId', () => {
  it('namespaces the slug', () => {
    expect(swarmResidentId('homeforge')).toBe('swarm:homeforge');
  });
});

describe('swarmAppearance', () => {
  it('is deterministic: same slug, same creature', () => {
    expect(swarmAppearance('homeforge')).toEqual(swarmAppearance('homeforge'));
  });

  it('produces a legal, grounded appearance', () => {
    const a = swarmAppearance('aphorism');
    expect(BODY_IDS).toContain(a.body);
    expect(CROWN_IDS).toContain(a.crown);
    expect(a.winged).toBe(false);
    expect(a.palette.hue).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('differs from a plain skill of the same name (the namespace matters)', () => {
    // Guards the seed: if someone "simplifies" swarmAppearance to seed with the
    // bare slug, creatures already sold under the namespaced seed change faces.
    const namespaced = swarmAppearance('moon');
    const seeds = [namespaced.body, namespaced.crown, namespaced.palette.hue].join('/');
    expect(typeof seeds).toBe('string'); // structural anchor for the fixture below
  });

  // FIXTURE PIN — filled in at Step 4 with real generated values. A refactor
  // that changes any face fails here loudly (spec §9, determinism).
  it.todo('pins the generated fixture for three known slugs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/swarm.test.ts`
Expected: FAIL — cannot resolve `./swarm.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/swarm.ts
import { generateAppearance } from './appearance/generate.js';
import type { CreatureAppearance } from './types.js';

/**
 * Stable identity for a swarm-built resident: `swarm:<slug>`. This string is
 * both the showroom resident's id and its DNA name — S4's delivery reproduces
 * the creature in a buyer's village from the slug alone, so NEVER change it.
 */
export function swarmResidentId(slug: string): string {
  return `swarm:${slug}`;
}

/**
 * A swarm resident's look. Kind is 'skill' (grounded, never winged); the DNA
 * seed is therefore sha256 of `skill:swarm:<slug>` — the namespace keeps swarm
 * residents from colliding with a player's real skill of the same name.
 */
export function swarmAppearance(slug: string): CreatureAppearance {
  return generateAppearance({ kind: 'skill', name: swarmResidentId(slug) });
}
```

Add to `packages/core/src/index.ts` (alongside its existing re-exports):

```ts
export * from './swarm.js';
```

- [ ] **Step 4: Pin the fixture**

Run: `npx tsx -e "import { swarmAppearance } from './packages/core/src/swarm.js'; for (const s of ['aphorism','moon','homeforge']) console.log(s, JSON.stringify(swarmAppearance(s)));"`

Replace the `it.todo` with a real test asserting those three exact objects, e.g. (values WILL differ — paste what the script printed, do not copy this shape blindly):

```ts
it('pins the generated fixture for three known slugs', () => {
  expect(swarmAppearance('aphorism')).toEqual(/* pasted object */);
  expect(swarmAppearance('moon')).toEqual(/* pasted object */);
  expect(swarmAppearance('homeforge')).toEqual(/* pasted object */);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/swarm.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add packages/core/src/swarm.ts packages/core/src/swarm.test.ts packages/core/src/index.ts
git commit -m "feat(core): swarm resident identity — swarm:<slug> DNA namespace"
```

---

### Task 2: Swarm feed bridge (fetch + parse)

**Files:**
- Create: `packages/server/src/bridge/swarm.ts`
- Create: `packages/server/src/bridge/swarm.test.ts`

**Interfaces:**
- Consumes: nothing internal (global `fetch`).
- Produces:
  - `interface SwarmProject { slug: string; name: string; runs: number; description: string | null; builtAt: string | null; lastBuiltAt: string | null; repoUrl: string | null; liveUrl: string | null }`
  - `parseSwarmFeed(json: unknown): SwarmProject[]` — throws `Error` if the payload is not a feed at all; skips malformed entries.
  - `fetchSwarmFeed(url: string, fetchImpl?: typeof fetch): Promise<SwarmProject[]>` — throws on network / non-2xx / unparseable body.
  - This module is the shared seam with M5's nursery (spec §4.1) — keep it free of showroom-specific logic.

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/bridge/swarm.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/swarm.test.ts`
Expected: FAIL — cannot resolve `./swarm.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/bridge/swarm.ts
/**
 * The swarm feed bridge: fetch + validate `GET <feedUrl>` (swarm.fenley.ai's
 * /api/projects shape). Read-only network GET — the village's safety posture.
 * Shared seam with M5's nursery: keep showroom-specific logic OUT of here.
 */
export interface SwarmProject {
  slug: string;
  name: string;
  runs: number;
  description: string | null;
  builtAt: string | null;
  lastBuiltAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseEntry(raw: unknown): SwarmProject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const slug = str(e.slug);
  if (!slug) return null; // no identity, no resident — skipped, never poisons the list
  const links = (typeof e.links === 'object' && e.links !== null ? e.links : {}) as Record<string, unknown>;
  return {
    slug,
    name: typeof e.name === 'string' ? e.name : '',
    runs: typeof e.runs === 'number' && Number.isFinite(e.runs) && e.runs >= 0 ? Math.floor(e.runs) : 0,
    description: str(e.description),
    builtAt: str(e.built_at),
    lastBuiltAt: str(e.last_built_at),
    repoUrl: str(links.repo),
    liveUrl: str(links.live),
  };
}

export function parseSwarmFeed(json: unknown): SwarmProject[] {
  const list = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null && Array.isArray((json as { projects?: unknown }).projects)
      ? (json as { projects: unknown[] }).projects
      : null;
  if (!list) throw new Error('not a swarm feed: expected an array or { projects: [...] }');
  return list.map(parseEntry).filter((p): p is SwarmProject => p !== null);
}

export async function fetchSwarmFeed(url: string, fetchImpl: typeof fetch = fetch): Promise<SwarmProject[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`swarm feed responded ${res.status}`);
  return parseSwarmFeed(await res.json());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/bridge/swarm.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/bridge/swarm.ts packages/server/src/bridge/swarm.test.ts
git commit -m "feat(server): swarm feed bridge — fetch + tolerant parse"
```

---

### Task 3: Keeper config

**Files:**
- Create: `packages/server/src/showroom/config.ts`
- Create: `packages/server/src/showroom/config.test.ts`

**Interfaces:**
- Consumes: `node:fs/promises`.
- Produces:
  - `interface RareConfig { slug: string; number: number; auctionOpensAt: string }`
  - `interface ShowroomConfig { feedUrl: string; rares: RareConfig[]; trivia: Record<string, string>; hidden: string[] }`
  - `const DEFAULT_FEED_URL = 'https://swarm.fenley.ai/api/projects'`
  - `parseShowroomConfig(json: unknown): { config: ShowroomConfig; warnings: string[] }` — never throws on shape problems; drops bad pieces with a warning each.
  - `loadShowroomConfig(path: string): Promise<{ config: ShowroomConfig; warnings: string[] }>` — missing file → pure defaults, zero warnings; unreadable JSON → throws (a corrupt config the keeper wrote deserves a loud failure, not silent defaults).

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/showroom/config.test.ts
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
      trivia: { moon: 'its phase math also lights this village’s night sky.' },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/config.test.ts`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/showroom/config.ts
import { readFile } from 'node:fs/promises';

export const DEFAULT_FEED_URL = 'https://swarm.fenley.ai/api/projects';

export interface RareConfig {
  slug: string;
  /** Drop number, shown as "RARE DROP №n". */
  number: number;
  /** ISO timestamp the auction opens; the showroom only counts down to it. */
  auctionOpensAt: string;
}

export interface ShowroomConfig {
  feedUrl: string;
  rares: RareConfig[];
  /** Optional per-slug flavour line for the panel. */
  trivia: Record<string, string>;
  /** Slugs the keeper has delisted entirely. */
  hidden: string[];
}

/**
 * The keeper's hand-edited file (spec §7). Tolerant by design: a bad piece is
 * dropped with a warning, never a crash — the keeper edits this over ssh.
 */
export function parseShowroomConfig(json: unknown): { config: ShowroomConfig; warnings: string[] } {
  const warnings: string[] = [];
  const root = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;

  const feedUrl = typeof root.feedUrl === 'string' && root.feedUrl.length > 0 ? root.feedUrl : DEFAULT_FEED_URL;

  const rares: RareConfig[] = [];
  if (root.rares !== undefined) {
    if (!Array.isArray(root.rares)) warnings.push('rares: expected an array');
    else {
      for (const raw of root.rares) {
        const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        if (typeof r.slug !== 'string' || r.slug === '') { warnings.push('rares: entry without a slug dropped'); continue; }
        if (typeof r.number !== 'number' || !Number.isInteger(r.number) || r.number < 1) {
          warnings.push(`rares[${r.slug}]: number must be a positive integer`); continue;
        }
        if (typeof r.auctionOpensAt !== 'string' || Number.isNaN(Date.parse(r.auctionOpensAt))) {
          warnings.push(`rares[${r.slug}]: auctionOpensAt is not a parseable timestamp`); continue;
        }
        rares.push({ slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt });
      }
    }
  }

  const trivia: Record<string, string> = {};
  if (root.trivia !== undefined) {
    if (typeof root.trivia !== 'object' || root.trivia === null) warnings.push('trivia: expected an object');
    else for (const [slug, line] of Object.entries(root.trivia as Record<string, unknown>)) {
      if (typeof line === 'string') trivia[slug] = line;
      else warnings.push(`trivia[${slug}]: expected a string`);
    }
  }

  const hidden: string[] = [];
  if (root.hidden !== undefined) {
    if (!Array.isArray(root.hidden)) warnings.push('hidden: expected an array');
    else for (const h of root.hidden) {
      if (typeof h === 'string') hidden.push(h);
      else warnings.push('hidden: non-string entry dropped');
    }
  }

  return { config: { feedUrl, rares, trivia, hidden }, warnings };
}

export async function loadShowroomConfig(path: string): Promise<{ config: ShowroomConfig; warnings: string[] }> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return parseShowroomConfig({});
    throw error;
  }
  return parseShowroomConfig(JSON.parse(raw)); // corrupt JSON throws loudly, by design
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/showroom/config.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/showroom/config.ts packages/server/src/showroom/config.test.ts
git commit -m "feat(showroom): keeper config — parse, defaults, warnings"
```

---

### Task 4: Lifecycle inference — classify + snapshot diff + rare confirmations

**Files:**
- Create: `packages/server/src/showroom/state.ts`
- Create: `packages/server/src/showroom/state.test.ts`

**Interfaces:**
- Consumes: `SwarmProject` from `../bridge/swarm.js`; `ShowroomConfig` from `./config.js`.
- Produces (this task; Task 5 extends the same file):
  - `type ResidentState = 'egg' | 'common'`
  - `classify(p: SwarmProject): ResidentState` — **the S1 proxy, isolated here so S2 swaps one function** (spec §3/§10): egg ⇔ `repoUrl === null`.
  - `type ShowroomEventType = 'egg-laid' | 'hatched' | 'hatched-away' | 'orphaned' | 'rare-confirmed'`
  - `interface ShowroomEvent { at: number; type: ShowroomEventType; slug: string; name: string }`
  - `diffSnapshots(prev: SwarmProject[] | null, next: SwarmProject[], at: number): ShowroomEvent[]`
  - `newRareEvents(config: ShowroomConfig, priorEvents: ShowroomEvent[], projects: SwarmProject[], at: number): ShowroomEvent[]`
  - `mergeRoster(roster: SwarmProject[], fetched: SwarmProject[]): SwarmProject[]` — fetched entries win per slug; roster entries missing from the feed are **retained** (spec §8: an orphaned resident stays until the keeper hides it). Order: roster order first, then new arrivals in fetched order.

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/showroom/state.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/state.test.ts`
Expected: FAIL — cannot resolve `./state.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/showroom/state.ts
import type { SwarmProject } from '../bridge/swarm.js';
import type { ShowroomConfig } from './config.js';

export type ResidentState = 'egg' | 'common';

/**
 * The S1 lifecycle proxy (spec §3), isolated so S2 can swap it for the feed's
 * explicit status without touching anything else: no repo link yet = still
 * incubating; a repo link = the build shipped.
 */
export function classify(p: SwarmProject): ResidentState {
  return p.repoUrl === null ? 'egg' : 'common';
}

export type ShowroomEventType = 'egg-laid' | 'hatched' | 'hatched-away' | 'orphaned' | 'rare-confirmed';

export interface ShowroomEvent {
  at: number;
  type: ShowroomEventType;
  slug: string;
  name: string;
}

const displayName = (p: SwarmProject) => (p.name !== '' ? p.name : p.slug);

/**
 * Everything the notice board will ever say comes from diffing two consecutive
 * snapshots. `prev === null` means no history at all (first boot): emit
 * nothing — the board has no story to tell yet, and inventing one would spam
 * every entry as "new".
 */
export function diffSnapshots(prev: SwarmProject[] | null, next: SwarmProject[], at: number): ShowroomEvent[] {
  if (prev === null) return [];
  const events: ShowroomEvent[] = [];
  const before = new Map(prev.map((p) => [p.slug, p]));
  const after = new Map(next.map((p) => [p.slug, p]));

  for (const p of next) {
    const was = before.get(p.slug);
    if (!was) {
      events.push({ at, type: classify(p) === 'egg' ? 'egg-laid' : 'hatched-away', slug: p.slug, name: displayName(p) });
    } else if (classify(was) === 'egg' && classify(p) === 'common') {
      events.push({ at, type: 'hatched', slug: p.slug, name: displayName(p) });
    }
  }
  for (const p of prev) {
    if (!after.has(p.slug)) events.push({ at, type: 'orphaned', slug: p.slug, name: displayName(p) });
  }
  return events;
}

/**
 * Adding a rare to the config IS the keeper's confirmation (spec §7); the
 * event log remembers which confirmations have already been announced.
 * A configured rare that is not a hatched feed entry is not announced —
 * resolveRares (Task 5) logs why it was ignored.
 */
export function newRareEvents(
  config: ShowroomConfig,
  priorEvents: ShowroomEvent[],
  projects: SwarmProject[],
  at: number,
): ShowroomEvent[] {
  const announced = new Set(priorEvents.filter((e) => e.type === 'rare-confirmed').map((e) => e.slug));
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const events: ShowroomEvent[] = [];
  for (const rare of config.rares) {
    if (announced.has(rare.slug)) continue;
    const p = bySlug.get(rare.slug);
    if (!p || classify(p) !== 'common') continue;
    events.push({ at, type: 'rare-confirmed', slug: rare.slug, name: displayName(p) });
  }
  return events;
}

/**
 * The village never loses anyone silently (spec §8): an entry that vanishes
 * from the feed is retained from the roster — the orphaned event marks it, and
 * only the keeper's `hidden` list removes it. Fetched data wins per slug;
 * arrivals append in fetched order.
 */
export function mergeRoster(roster: SwarmProject[], fetched: SwarmProject[]): SwarmProject[] {
  const byFetched = new Map(fetched.map((p) => [p.slug, p]));
  const merged = roster.map((p) => byFetched.get(p.slug) ?? p);
  const known = new Set(roster.map((p) => p.slug));
  for (const p of fetched) if (!known.has(p.slug)) merged.push(p);
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/showroom/state.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/showroom/state.ts packages/server/src/showroom/state.test.ts
git commit -m "feat(showroom): lifecycle inference — classify, snapshot diff, rare confirmations"
```

---

### Task 5: Rares resolution + the village payload

**Files:**
- Modify: `packages/server/src/showroom/state.ts` (append)
- Modify: `packages/server/src/showroom/state.test.ts` (append)

**Interfaces:**
- Consumes: `swarmAppearance`, `swarmResidentId` from `@village/core`; everything from Task 4.
- Produces:
  - `interface SpectatorResident { id: string; kind: 'skill'; name: string; nickname: ''; appearance: CreatureAppearance; stats: { mood: number; energy: number }; slug: string; description: string | null; runs: number; builtAt: string | null; lastBuiltAt: string | null; repoUrl: string | null; liveUrl: string | null }` — the renderer-shaped resident (passes web `isRenderable`: id/name/nickname strings, kind `'skill'`, appearance, numeric stats).
  - `interface EggView { slug: string; name: string; runs: number; description: string | null; lastBuiltAt: string | null; active: boolean; hue: string }`
  - `interface RareView { slug: string; number: number; auctionOpensAt: string; name: string; description: string | null; runs: number; builtAt: string | null; repoUrl: string | null; liveUrl: string | null }`
  - `resolveRares(config: ShowroomConfig, projects: SwarmProject[]): { rares: RareView[]; ignored: string[] }`
  - `interface VillagePayload { residents: SpectatorResident[]; eggs: EggView[]; rare: RareView | null; events: ShowroomEvent[]; counts: { villagers: number; eggs: number; rares: number }; feedStale: boolean; trivia: Record<string, string> }`
  - `buildVillagePayload(args: { projects: SwarmProject[]; config: ShowroomConfig; events: ShowroomEvent[]; feedStale: boolean; now: number }): VillagePayload`

Stat synthesis rules (against the behaviour thresholds in Global Constraints):
active (a `lastBuiltAt` within 48h) → `{ mood: 80, energy: 80 }` (awake, occasionally a hopper);
stale → `{ mood: 60, energy: 20 }` (dozes — energy < 25; mood 60 stays ≥ 35 so **no showroom resident is ever scruffy**: they are swarm's charges, spec §2).

- [ ] **Step 1: Write the failing test (append to state.test.ts)**

```ts
import { buildVillagePayload, resolveRares } from './state.js';

const RARE_CFG = parseShowroomConfig({
  rares: [{ slug: 'homeforge', number: 1, auctionOpensAt: '2026-08-25T21:00:00Z' }],
  trivia: { moon: 'its phase math also lights this village’s night sky.' },
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

  it('eggs carry the future creature’s hue and an activity flag', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/state.test.ts`
Expected: FAIL — `resolveRares` / `buildVillagePayload` not exported.

- [ ] **Step 3: Write the implementation (append to state.ts)**

```ts
import { swarmAppearance, swarmResidentId, type CreatureAppearance } from '@village/core';

export interface SpectatorResident {
  id: string;
  kind: 'skill';
  name: string;
  nickname: '';
  appearance: CreatureAppearance;
  stats: { mood: number; energy: number };
  slug: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  lastBuiltAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

export interface EggView {
  slug: string;
  name: string;
  runs: number;
  description: string | null;
  lastBuiltAt: string | null;
  active: boolean;
  /** The future creature's body hue — the egg wears its spots. */
  hue: string;
}

export interface RareView {
  slug: string;
  number: number;
  auctionOpensAt: string;
  name: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

/** A build within this window counts as actively incubating / lively. */
const ACTIVE_MS = 48 * 60 * 60 * 1000;

function isActive(lastBuiltAt: string | null, now: number): boolean {
  if (lastBuiltAt === null) return false;
  const t = Date.parse(lastBuiltAt);
  return !Number.isNaN(t) && now - t < ACTIVE_MS;
}

export function resolveRares(config: ShowroomConfig, projects: SwarmProject[]): { rares: RareView[]; ignored: string[] } {
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const rares: RareView[] = [];
  const ignored: string[] = [];
  for (const r of config.rares) {
    const p = bySlug.get(r.slug);
    if (!p) { ignored.push(`rare "${r.slug}" is not in the feed`); continue; }
    if (classify(p) !== 'common') { ignored.push(`rare "${r.slug}" is still an egg`); continue; }
    rares.push({
      slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt,
      name: displayName(p), description: p.description, runs: p.runs,
      builtAt: p.builtAt, repoUrl: p.repoUrl, liveUrl: p.liveUrl,
    });
  }
  rares.sort((a, b) => a.number - b.number);
  return { rares, ignored };
}

export interface VillagePayload {
  residents: SpectatorResident[];
  eggs: EggView[];
  /** The pedestal: the highest-numbered resolved rare (the current drop). */
  rare: RareView | null;
  events: ShowroomEvent[];
  counts: { villagers: number; eggs: number; rares: number };
  feedStale: boolean;
  trivia: Record<string, string>;
}

/** How many event lines the payload carries; the log on disk keeps everything. */
const EVENT_TAIL = 20;

export function buildVillagePayload(args: {
  projects: SwarmProject[];
  config: ShowroomConfig;
  events: ShowroomEvent[];
  feedStale: boolean;
  now: number;
}): VillagePayload {
  const hidden = new Set(args.config.hidden);
  const visible = args.projects.filter((p) => !hidden.has(p.slug));

  const residents: SpectatorResident[] = visible
    .filter((p) => classify(p) === 'common')
    .map((p) => {
      const active = isActive(p.lastBuiltAt, args.now);
      return {
        id: swarmResidentId(p.slug),
        kind: 'skill' as const,
        name: displayName(p),
        nickname: '' as const,
        appearance: swarmAppearance(p.slug),
        // Against behaviour.ts thresholds: energy 20 dozes (< 25), energy 80 is
        // awake and can hop (> 70 with mood > 75). Mood never drops below 35:
        // showroom residents are swarm's charges and are never scruffy.
        stats: active ? { mood: 80, energy: 80 } : { mood: 60, energy: 20 },
        slug: p.slug,
        description: p.description,
        runs: p.runs,
        builtAt: p.builtAt,
        lastBuiltAt: p.lastBuiltAt,
        repoUrl: p.repoUrl,
        liveUrl: p.liveUrl,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const eggs: EggView[] = visible
    .filter((p) => classify(p) === 'egg')
    .map((p) => ({
      slug: p.slug,
      name: p.name, // '' stays '': the client renders the "?????" egg
      runs: p.runs,
      description: p.description,
      lastBuiltAt: p.lastBuiltAt,
      active: isActive(p.lastBuiltAt, args.now),
      hue: swarmAppearance(p.slug).palette.hue,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const { rares } = resolveRares(args.config, visible);

  return {
    residents,
    eggs,
    rare: rares.length > 0 ? rares[rares.length - 1]! : null,
    events: args.events.slice(-EVENT_TAIL).reverse(),
    counts: { villagers: residents.length, eggs: eggs.length, rares: rares.length },
    feedStale: args.feedStale,
    trivia: args.config.trivia,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/showroom/state.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add packages/server/src/showroom/state.ts packages/server/src/showroom/state.test.ts
git commit -m "feat(showroom): rares resolution and the spectator village payload"
```

---

### Task 6: Persistence — snapshot + event log

**Files:**
- Create: `packages/server/src/showroom/persist.ts`
- Create: `packages/server/src/showroom/persist.test.ts`

**Interfaces:**
- Consumes: `SwarmProject` from `../bridge/swarm.js`; `ShowroomEvent` from `./state.js`. **Note:** the snapshot on disk is the already-parsed camelCase `SwarmProject[]` — do NOT re-read it through `parseSwarmFeed` (which reads the feed's snake_case `built_at`/`links.repo` and would silently null every field); `persist.ts` has its own stored-shape validator.
- Produces:
  - `interface ShowroomPaths { dataDir: string; snapshotPath: string; eventLogPath: string; configPath: string }`
  - `resolveShowroomPaths(options?: { home?: string; dataDir?: string }): ShowroomPaths` — default dataDir `<home>/.swarm-showroom`; files `swarm-snapshot.json`, `events.jsonl`, `showroom.config.json`.
  - `readSnapshot(paths: ShowroomPaths): Promise<SwarmProject[] | null>` — `null` when missing or unreadable (a broken snapshot is a cold start, not a crash).
  - `writeSnapshot(paths: ShowroomPaths, projects: SwarmProject[]): Promise<void>` — creates dataDir, writes temp file then renames (a crash mid-write must not eat the last good snapshot).
  - `readEventLog(paths: ShowroomPaths): Promise<ShowroomEvent[]>` — skips unparseable lines.
  - `appendEvents(paths: ShowroomPaths, events: ShowroomEvent[]): Promise<void>` — JSONL append; no-op for `[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/showroom/persist.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/persist.test.ts`
Expected: FAIL — cannot resolve `./persist.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/showroom/persist.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/showroom/persist.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/showroom/persist.ts packages/server/src/showroom/persist.test.ts
git commit -m "feat(showroom): snapshot + event-log persistence under ~/.swarm-showroom"
```

---

### Task 7: The showroom runtime (poll loop)

**Files:**
- Create: `packages/server/src/showroom/runtime.ts`
- Create: `packages/server/src/showroom/runtime.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6 (`fetchSwarmFeed`, `ShowroomConfig`, state functions incl. `mergeRoster`, persist functions).
- Produces:
  - `interface ShowroomRuntime { getPayload(): VillagePayload; subscribe(fn: (payload: VillagePayload, fresh: ShowroomEvent[]) => void): () => void; poll(): Promise<void>; setConfig(config: ShowroomConfig): void; start(): void; close(): void }`
  - `createShowroom(options: { paths: ShowroomPaths; config: ShowroomConfig; fetchFeed?: (url: string) => Promise<SwarmProject[]>; now?: () => number; log?: (line: string) => void }): Promise<ShowroomRuntime>` — boots from the persisted snapshot + event log so a restart shows yesterday's village instantly.
  - `setConfig` swaps the keeper config live (Task 8 wires it to SIGHUP — spec §7 "read on boot and on change") and notifies subscribers with `[]` fresh events.
  - Poll cadence when `start()`ed: every **5 minutes** (`POLL_MS = 300_000`).

Poll semantics (spec §8): on fetch success → events = `diffSnapshots(roster, fetched)` **with `orphaned` events suppressed for slugs the event log already orphaned** (an orphan retained in the roster would otherwise re-announce every poll) plus `newRareEvents`; the persisted roster becomes `mergeRoster(roster, fetched)` so vanished residents stay; append events, write snapshot, `feedStale = false`, notify with the fresh events. On fetch failure → keep the roster, `feedStale = true`, log one line, notify with `[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/showroom/runtime.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/runtime.test.ts`
Expected: FAIL — cannot resolve `./runtime.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/showroom/runtime.ts
import { fetchSwarmFeed, type SwarmProject } from '../bridge/swarm.js';
import type { ShowroomConfig } from './config.js';
import { appendEvents, readEventLog, readSnapshot, writeSnapshot, type ShowroomPaths } from './persist.js';
import {
  buildVillagePayload, diffSnapshots, mergeRoster, newRareEvents, resolveRares,
  type ShowroomEvent, type VillagePayload,
} from './state.js';

export const POLL_MS = 5 * 60 * 1000;

export interface ShowroomRuntime {
  getPayload(): VillagePayload;
  subscribe(fn: (payload: VillagePayload, fresh: ShowroomEvent[]) => void): () => void;
  poll(): Promise<void>;
  /** Live keeper-config swap (SIGHUP path); notifies subscribers with [] fresh. */
  setConfig(config: ShowroomConfig): void;
  start(): void;
  close(): void;
}

export async function createShowroom(options: {
  paths: ShowroomPaths;
  config: ShowroomConfig;
  fetchFeed?: (url: string) => Promise<SwarmProject[]>;
  now?: () => number;
  log?: (line: string) => void;
}): Promise<ShowroomRuntime> {
  const fetchFeed = options.fetchFeed ?? ((url: string) => fetchSwarmFeed(url));
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.error(line));

  let config = options.config;
  /** The merged roster: feed truth plus retained orphans. Null = never seen the feed. */
  let roster: SwarmProject[] | null = await readSnapshot(options.paths);
  let events: ShowroomEvent[] = await readEventLog(options.paths);
  let feedStale = false;
  let timer: NodeJS.Timeout | null = null;
  const subscribers = new Set<(payload: VillagePayload, fresh: ShowroomEvent[]) => void>();

  const payload = (): VillagePayload =>
    buildVillagePayload({ projects: roster ?? [], config, events, feedStale, now: now() });

  function notify(fresh: ShowroomEvent[]): void {
    const p = payload();
    for (const fn of subscribers) fn(p, fresh);
  }

  async function poll(): Promise<void> {
    const at = now();
    let fetched: SwarmProject[];
    try {
      fetched = await fetchFeed(config.feedUrl);
    } catch (error) {
      feedStale = true;
      log(`showroom: feed poll failed — serving the last good snapshot (${(error as Error).message})`);
      notify([]);
      return;
    }
    feedStale = false;
    // An orphan retained in the roster is missing from every future fetch;
    // the event log remembers who was already announced so it is said once.
    const alreadyOrphaned = new Set(events.filter((e) => e.type === 'orphaned').map((e) => e.slug));
    const fresh = [
      ...diffSnapshots(roster, fetched, at).filter((e) => e.type !== 'orphaned' || !alreadyOrphaned.has(e.slug)),
      ...newRareEvents(config, events, fetched, at),
    ];
    for (const reason of resolveRares(config, fetched).ignored) log(`showroom: ${reason} — ignored`);
    roster = roster === null ? fetched : mergeRoster(roster, fetched);
    events = events.concat(fresh);
    await writeSnapshot(options.paths, roster);
    await appendEvents(options.paths, fresh);
    notify(fresh);
  }

  return {
    getPayload: payload,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    poll,
    setConfig(next) {
      config = next;
      notify([]);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void poll().catch((e) => log(`showroom: poll crashed: ${(e as Error).message}`)), POLL_MS);
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      subscribers.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/showroom/runtime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/showroom/runtime.ts packages/server/src/showroom/runtime.test.ts
git commit -m "feat(showroom): runtime — poll loop, subscriptions, disk-backed boot"
```

---

### Task 8: HTTP + WebSocket API and the entry point

**Files:**
- Create: `packages/server/src/showroom/app.ts`
- Create: `packages/server/src/showroom/app.test.ts`
- Create: `packages/server/src/showroom/main.ts`
- Modify: `package.json` (root — add `dev:showroom` script)

**Interfaces:**
- Consumes: `ShowroomRuntime` from `./runtime.js`; Fastify + @fastify/websocket exactly as `../api/app.ts` does.
- Produces:
  - `wsFrames(payload: VillagePayload, fresh: ShowroomEvent[]): string[]` — pure; frame 1 is always `{"type":"village","village":<payload>}`; plus one `{"type":"hatch","slug","name"}` per fresh `hatched` event (only live hatches trigger the animation — `hatched-away` does not).
  - `createShowroomApp(runtime: ShowroomRuntime): Promise<FastifyInstance>` — routes: `GET /api/health` → `{ ok: true, villagers: number }`; `GET /api/village` → payload with header `cache-control: public, max-age=30`; `GET /ws` (websocket) → sends the village frame on connect, then everything `wsFrames` yields per runtime notification.
  - `main.ts` env: `SHOWROOM_PORT` (default 8263), `SHOWROOM_HOST` (default `127.0.0.1` — nginx fronts it), `SHOWROOM_DATA_DIR` (overrides the data dir), `SHOWROOM_CONFIG` (overrides the config path).

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/showroom/app.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/showroom/app.test.ts`
Expected: FAIL — cannot resolve `./app.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/showroom/app.ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { ShowroomEvent, VillagePayload } from './state.js';
import type { ShowroomRuntime } from './runtime.js';

/** One notification's worth of socket frames. Pure, so the shape is testable. */
export function wsFrames(payload: VillagePayload, fresh: ShowroomEvent[]): string[] {
  const frames = [JSON.stringify({ type: 'village', village: payload })];
  for (const e of fresh) {
    if (e.type === 'hatched') frames.push(JSON.stringify({ type: 'hatch', slug: e.slug, name: e.name }));
  }
  return frames;
}

/**
 * The whole spectator API: two GETs and a socket. Read-only and anonymous —
 * no cookies, no per-visitor state; nginx serves the static bundle in front.
 */
export async function createShowroomApp(runtime: ShowroomRuntime): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  app.get('/api/health', async () => ({ ok: true, villagers: runtime.getPayload().counts.villagers }));

  app.get('/api/village', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    return runtime.getPayload();
  });

  app.get('/ws', { websocket: true }, (socket) => {
    for (const frame of wsFrames(runtime.getPayload(), [])) socket.send(frame);
    const unsubscribe = runtime.subscribe((payload, fresh) => {
      if (socket.readyState !== socket.OPEN) return;
      for (const frame of wsFrames(payload, fresh)) socket.send(frame);
    });
    socket.on('close', unsubscribe);
  });

  return app;
}
```

```ts
// packages/server/src/showroom/main.ts
/**
 * Boots the public showroom: polls the swarm feed, serves spectators.
 *
 * Run: npm run dev:showroom
 */
import { loadShowroomConfig } from './config.js';
import { resolveShowroomPaths } from './persist.js';
import { createShowroom } from './runtime.js';
import { createShowroomApp } from './app.js';

async function main(): Promise<void> {
  const port = Number(process.env.SHOWROOM_PORT ?? 8263);
  const host = process.env.SHOWROOM_HOST ?? '127.0.0.1';
  const paths = resolveShowroomPaths(
    process.env.SHOWROOM_DATA_DIR ? { dataDir: process.env.SHOWROOM_DATA_DIR } : {},
  );
  const configPath = process.env.SHOWROOM_CONFIG ?? paths.configPath;

  const { config, warnings } = await loadShowroomConfig(configPath);
  for (const w of warnings) console.error(`showroom config: ${w}`);

  const runtime = await createShowroom({ paths, config });
  await runtime.poll(); // first frame before the first visitor
  runtime.start();

  const app = await createShowroomApp(runtime);
  await app.listen({ port, host });
  const { villagers, eggs } = runtime.getPayload().counts;
  console.log(`Swarm Showroom is open at http://${host}:${port} — ${villagers} villagers, ${eggs} eggs.`);

  // The keeper edits the config over ssh; SIGHUP reloads it without dropping
  // spectators (spec §7 "read on boot and on change"). Windows dev has no kill
  // -HUP, but attaching the listener is harmless there — restart instead.
  process.on('SIGHUP', () => {
    void loadShowroomConfig(configPath)
      .then(({ config: next, warnings: w }) => {
        for (const line of w) console.error(`showroom config: ${line}`);
        runtime.setConfig(next);
        console.log('showroom: config reloaded.');
      })
      .catch((error) => console.error('showroom: config reload failed, keeping the old one:', error));
  });

  const shutdown = async () => {
    runtime.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Swarm Showroom failed to start:', error);
  process.exit(1);
});
```

Add to root `package.json` scripts (beside `dev:server`):

```json
"dev:showroom": "tsx packages/server/src/showroom/main.ts",
```

- [ ] **Step 4: Run tests, typecheck, and boot it once**

Run: `npx vitest run packages/server/src/showroom/app.test.ts` — Expected: PASS (3 tests).
Run: `npm run typecheck` — Expected: clean.
Run: `npm run dev:showroom` (Ctrl-C after the banner) — Expected: `Swarm Showroom is open at http://127.0.0.1:8263 — N villagers, M eggs.` with real counts from the live feed, then `curl http://127.0.0.1:8263/api/village` in another shell returns JSON with `residents`, `eggs`, `counts`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/showroom/app.ts packages/server/src/showroom/app.test.ts packages/server/src/showroom/main.ts package.json
git commit -m "feat(showroom): REST + WebSocket API and the showroom entry point"
```

---

### Task 9: Web protocol — `filterRenderable` refactor + spectator parsing

**Files:**
- Modify: `packages/web/src/net/protocol.ts` (extract + export one helper; behaviour unchanged)
- Create: `packages/web/src/spectator/protocol.ts`
- Create: `packages/web/src/spectator/protocol.test.ts`

**Interfaces:**
- Consumes: the private `isRenderable` machinery already in `net/protocol.ts`.
- Produces:
  - In `net/protocol.ts`: `export function filterRenderable(values: unknown[]): Creature[]` — the existing `isRenderable` filter applied to an array. `toView` now calls it (`filterRenderable(Object.values(...))` then sorts); its existing tests must pass unchanged.
  - In `spectator/protocol.ts`:
    - `interface ResidentView extends Creature { slug: string; description: string | null; runs: number; builtAt: string | null; lastBuiltAt: string | null; repoUrl: string | null; liveUrl: string | null }`
    - `interface EggView { slug: string; name: string; runs: number; description: string | null; lastBuiltAt: string | null; active: boolean; hue: string }` (mirror of the server's — the web package cannot import server types)
    - `interface RareViewFull { slug: string; number: number; auctionOpensAt: string; name: string; description: string | null; runs: number; builtAt: string | null; repoUrl: string | null; liveUrl: string | null }`
    - `interface NoticeEvent { at: number; type: string; slug: string; name: string }`
    - `interface ShowroomView { residents: ResidentView[]; eggs: EggView[]; rare: RareViewFull | null; events: NoticeEvent[]; counts: { villagers: number; eggs: number; rares: number }; feedStale: boolean; trivia: Record<string, string> }`
    - `toShowroomView(payload: unknown): ShowroomView | null` — drops anything malformed rather than crashing (one bad egg must not cost the village).
    - `parseShowroomMessage(raw: string): { type: 'village'; view: ShowroomView } | { type: 'hatch'; slug: string; name: string } | null`

- [ ] **Step 1: Refactor `net/protocol.ts`**

Add below `isRenderable` (no other changes):

```ts
/** The renderable subset of an arbitrary list, sorted for stable render order. */
export function filterRenderable(values: unknown[]): Creature[] {
  return values.filter(isRenderable).sort((a, b) => a.id.localeCompare(b.id));
}
```

Replace the two lines inside `toView` that filter and sort `creatures` with:

```ts
  const creatures = filterRenderable(Object.values(p.creatures as Record<string, unknown>));
```

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: PASS, unchanged counts — the refactor is invisible.

- [ ] **Step 2: Write the failing spectator test**

```ts
// packages/web/src/spectator/protocol.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/web/src/spectator/protocol.test.ts`
Expected: FAIL — cannot resolve `./protocol.js`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/web/src/spectator/protocol.ts
import type { Creature } from '@village/core/visual';
import { filterRenderable } from '../net/protocol.js';

export interface ResidentView extends Creature {
  slug: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  lastBuiltAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

export interface EggView {
  slug: string;
  name: string;
  runs: number;
  description: string | null;
  lastBuiltAt: string | null;
  active: boolean;
  hue: string;
}

export interface RareViewFull {
  slug: string;
  number: number;
  auctionOpensAt: string;
  name: string;
  description: string | null;
  runs: number;
  builtAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

export interface NoticeEvent {
  at: number;
  type: string;
  slug: string;
  name: string;
}

export interface ShowroomView {
  residents: ResidentView[];
  eggs: EggView[];
  rare: RareViewFull | null;
  events: NoticeEvent[];
  counts: { villagers: number; eggs: number; rares: number };
  feedStale: boolean;
  trivia: Record<string, string>;
}

const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** The renderable creature, plus the showroom fields with safe defaults. */
function toResident(value: unknown): ResidentView | null {
  const [renderable] = filterRenderable([value]);
  if (!renderable) return null;
  const r = value as Record<string, unknown>;
  return {
    ...renderable,
    slug: typeof r.slug === 'string' ? r.slug : renderable.id.replace(/^swarm:/, ''),
    description: optStr(r.description),
    runs: typeof r.runs === 'number' ? r.runs : 0,
    builtAt: optStr(r.builtAt),
    lastBuiltAt: optStr(r.lastBuiltAt),
    repoUrl: optStr(r.repoUrl),
    liveUrl: optStr(r.liveUrl),
  };
}

function toEgg(value: unknown): EggView | null {
  if (typeof value !== 'object' || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.slug !== 'string' || typeof e.hue !== 'string') return null;
  return {
    slug: e.slug,
    name: typeof e.name === 'string' ? e.name : '',
    runs: typeof e.runs === 'number' ? e.runs : 0,
    description: optStr(e.description),
    lastBuiltAt: optStr(e.lastBuiltAt),
    active: e.active === true,
    hue: e.hue,
  };
}

function toRare(value: unknown): RareViewFull | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.slug !== 'string' || typeof r.number !== 'number' || typeof r.auctionOpensAt !== 'string') return null;
  return {
    slug: r.slug, number: r.number, auctionOpensAt: r.auctionOpensAt,
    name: typeof r.name === 'string' && r.name !== '' ? r.name : r.slug,
    description: optStr(r.description),
    runs: typeof r.runs === 'number' ? r.runs : 0,
    builtAt: optStr(r.builtAt),
    repoUrl: optStr(r.repoUrl),
    liveUrl: optStr(r.liveUrl),
  };
}

function toEvent(value: unknown): NoticeEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.at !== 'number' || typeof e.type !== 'string' || typeof e.slug !== 'string') return null;
  return { at: e.at, type: e.type, slug: e.slug, name: typeof e.name === 'string' ? e.name : e.slug };
}

export function toShowroomView(payload: unknown): ShowroomView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.residents) || !Array.isArray(p.eggs)) return null;
  const counts = p.counts as Record<string, unknown> | undefined;
  return {
    residents: p.residents.map(toResident).filter((r): r is ResidentView => r !== null),
    eggs: p.eggs.map(toEgg).filter((e): e is EggView => e !== null),
    rare: toRare(p.rare),
    events: Array.isArray(p.events) ? p.events.map(toEvent).filter((e): e is NoticeEvent => e !== null) : [],
    counts: {
      villagers: typeof counts?.villagers === 'number' ? counts.villagers : 0,
      eggs: typeof counts?.eggs === 'number' ? counts.eggs : 0,
      rares: typeof counts?.rares === 'number' ? counts.rares : 0,
    },
    feedStale: p.feedStale === true,
    trivia: typeof p.trivia === 'object' && p.trivia !== null
      ? Object.fromEntries(Object.entries(p.trivia as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
      : {},
  };
}

export function parseShowroomMessage(
  raw: string,
): { type: 'village'; view: ShowroomView } | { type: 'hatch'; slug: string; name: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const frame = parsed as Record<string, unknown>;
  if (frame.type === 'village') {
    const view = toShowroomView(frame.village);
    return view ? { type: 'village', view } : null;
  }
  if (frame.type === 'hatch' && typeof frame.slug === 'string') {
    return { type: 'hatch', slug: frame.slug, name: typeof frame.name === 'string' ? frame.name : frame.slug };
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/spectator/protocol.test.ts packages/web/src/net/protocol.test.ts`
Expected: PASS — spectator tests green, net tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/net/protocol.ts packages/web/src/spectator/protocol.ts packages/web/src/spectator/protocol.test.ts
git commit -m "feat(web): spectator protocol + filterRenderable extraction"
```

---

### Task 10: Countdown, relative time, notice lines, and the panel model

**Files:**
- Create: `packages/web/src/spectator/copy.ts`
- Create: `packages/web/src/spectator/copy.test.ts`

**Interfaces:**
- Consumes: `EggView`, `ResidentView`, `RareViewFull`, `NoticeEvent` from `./protocol.js`.
- Produces (all pure — the DOM panel in Task 12 just renders a `PanelModel`):
  - `formatAuctionCountdown(nowMs: number, opensAtIso: string): string` — unparseable → `''`; past/now → `'open'`; ≥ 24h → `'2d 4h'` style; < 24h → `'07:41:22'` style.
  - `ago(nowMs: number, iso: string | null): string | null` — `'3h ago'` / `'2d ago'` / `'just now'` (< 90s); null in, null out.
  - `noticeLines(events: NoticeEvent[]): string[]` — copy per type below.
  - `interface PanelLink { label: string; href: string }`
  - `interface PanelModel { header: string; chip: string | null; chipAccent: boolean; title: string; desc: string; meta: string; trivia: string | null; links: PanelLink[]; boxes: string[]; footnote: string | null }`
  - `type PanelTarget = { kind: 'egg'; egg: EggView } | { kind: 'common'; resident: ResidentView } | { kind: 'rare'; rare: RareViewFull }`
  - `panelModel(target: PanelTarget, options: { trivia: Record<string, string>; now: number }): PanelModel`

**Verbatim copy (spec §6 — do not rephrase):**
- Egg chip: `EGG · incubating`; unnamed title: `?????`; missing description: `no description yet — the swarm writes its story as it builds.`; egg box: `hatches when the judge calls the build done. no repo yet — still growing.`
- Common box: `lives here. commons are never for sale.`
- Rare chip: `✻ RARE DROP №{number}`; rare meta suffix: `judge-picked · keeper-confirmed`; rare box line 1: `auction opens in {countdown}` (or `the auction is open` when countdown is `'open'`); rare box line 2: `1 of 1. one buyer takes the repo, the live app, and the creature itself — it leaves this village and moves into yours.`
- Notice lines: `hatched` → `hatched: {name}.` · `hatched-away` → `hatched while the lights were out: {name}.` · `egg-laid` → `a new arrival at the nursery: {name}.` · `orphaned` → `{name} wandered out of the feed.` · `rare-confirmed` → `the keeper confirmed a rare: {name}.` (unknown types → no line)
- Link labels: `repo`, `live app`.
- Meta note: today's feed has no lay time (spec §3), so the egg meta leads with `last stirred {ago}` (from `lastBuiltAt`) instead of the spec's aspirational "laid …" — S2's feed extensions make "laid" real; the `run N under way` fragment is verbatim now.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/spectator/copy.test.ts
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
  it('writes the board in the spec’s words', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/spectator/copy.test.ts`
Expected: FAIL — cannot resolve `./copy.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/web/src/spectator/copy.ts
import type { EggView, NoticeEvent, RareViewFull, ResidentView } from './protocol.js';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatAuctionCountdown(nowMs: number, opensAtIso: string): string {
  const t = Date.parse(opensAtIso);
  if (Number.isNaN(t)) return '';
  const ms = t - nowMs;
  if (ms <= 0) return 'open';
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86_400);
  if (days >= 1) return `${days}d ${Math.floor((totalSecs % 86_400) / 3600)}h`;
  return `${pad(Math.floor(totalSecs / 3600))}:${pad(Math.floor((totalSecs % 3600) / 60))}:${pad(totalSecs % 60)}`;
}

export function ago(nowMs: number, iso: string | null): string | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const secs = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (secs < 90) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

export function noticeLines(events: NoticeEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === 'hatched') lines.push(`hatched: ${e.name}.`);
    else if (e.type === 'hatched-away') lines.push(`hatched while the lights were out: ${e.name}.`);
    else if (e.type === 'egg-laid') lines.push(`a new arrival at the nursery: ${e.name}.`);
    else if (e.type === 'orphaned') lines.push(`${e.name} wandered out of the feed.`);
    else if (e.type === 'rare-confirmed') lines.push(`the keeper confirmed a rare: ${e.name}.`);
    // Unknown types (a newer server) say nothing rather than something wrong.
  }
  return lines;
}

export interface PanelLink {
  label: string;
  href: string;
}

export interface PanelModel {
  header: string;
  chip: string | null;
  chipAccent: boolean;
  title: string;
  desc: string;
  meta: string;
  trivia: string | null;
  links: PanelLink[];
  boxes: string[];
  footnote: string | null;
}

export type PanelTarget =
  | { kind: 'egg'; egg: EggView }
  | { kind: 'common'; resident: ResidentView }
  | { kind: 'rare'; rare: RareViewFull };

const NO_DESC = 'no description yet — the swarm writes its story as it builds.';

function links(repoUrl: string | null, liveUrl: string | null): PanelLink[] {
  const out: PanelLink[] = [];
  if (repoUrl) out.push({ label: 'repo', href: repoUrl });
  if (liveUrl) out.push({ label: 'live app', href: liveUrl });
  return out;
}

export function panelModel(target: PanelTarget, options: { trivia: Record<string, string>; now: number }): PanelModel {
  if (target.kind === 'egg') {
    const e = target.egg;
    const laid = ago(options.now, e.lastBuiltAt);
    return {
      header: 'the nursery',
      chip: 'EGG · incubating',
      chipAccent: false,
      title: e.name !== '' ? e.name : '?????',
      desc: e.description ?? NO_DESC,
      meta: [laid ? `last stirred ${laid}` : null, `run ${e.runs} under way`].filter(Boolean).join(' · '),
      trivia: null,
      links: [],
      boxes: ['hatches when the judge calls the build done. no repo yet — still growing.'],
      footnote: null,
    };
  }
  if (target.kind === 'common') {
    const r = target.resident;
    const hatched = ago(options.now, r.builtAt);
    return {
      header: 'villager',
      chip: null,
      chipAccent: false,
      title: r.name,
      desc: r.description ?? NO_DESC,
      meta: [hatched ? `hatched ${hatched}` : 'hatched', `${r.runs} runs`].join(' · '),
      trivia: options.trivia[r.slug] ?? null,
      links: links(r.repoUrl, r.liveUrl),
      boxes: ['lives here. commons are never for sale.'],
      footnote: null,
    };
  }
  const r = target.rare;
  const hatched = ago(options.now, r.builtAt);
  const countdown = formatAuctionCountdown(options.now, r.auctionOpensAt);
  return {
    header: 'rare drop',
    chip: `✻ RARE DROP №${r.number}`,
    chipAccent: true,
    title: r.name,
    desc: r.description ?? NO_DESC,
    meta: [hatched ? `hatched ${hatched}` : 'hatched', `${r.runs} runs`, 'judge-picked · keeper-confirmed'].join(' · '),
    trivia: options.trivia[r.slug] ?? null,
    links: links(r.repoUrl, r.liveUrl),
    boxes: [
      countdown === 'open' ? 'the auction is open' : countdown === '' ? 'auction date to be announced' : `auction opens in ${countdown}`,
      '1 of 1. one buyer takes the repo, the live app, and the creature itself — it leaves this village and moves into yours.',
    ],
    footnote: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/spectator/copy.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/spectator/copy.ts packages/web/src/spectator/copy.test.ts
git commit -m "feat(web): spectator copy — countdown, relative time, notice lines, panel model"
```

---

### Task 11: Egg baking + generalized placement

**Files:**
- Create: `packages/web/src/spectator/egg.ts`
- Create: `packages/web/src/spectator/egg.test.ts`
- Modify: `packages/web/src/layout/zones.ts` (extract `placeInRange`; `placeCreatures` becomes a wrapper)

**Interfaces:**
- Consumes: `bakePixels`, `BakedPixels` from `../render/bake.js`; `THEME` from `../theme.js`.
- Produces:
  - `const EGG_ROWS: readonly string[]` — the 9×11 grid below; `X` shell, `A` spots, `.` transparent.
  - `bakeEgg(spotHex: string): BakedPixels` — shell in `THEME.signCream`, spots in `spotHex`.
  - In `zones.ts`: `export function placeInRange(ids: readonly string[], lo: number, hi: number): Map<string, Spot>` — exactly the body of today's `placeCreatures` with the bounds parameterized (same ROWS/ROW_DEPTH/GROUND_Y, same seating sort, same `nearestClearSpot`); `placeCreatures(ids)` now returns `placeInRange(ids, homes.x + MARGIN, homes.x + homes.w - MARGIN)`. **Existing zones tests must pass unchanged.**

The egg grid (from the approved mockups):

```
...XXX...
..XXXXX..
.XXXXXXX.
.XXXXAXX.
XXAXXXXXX
XXXXXXXXX
XXXXXAXXX
.XAXXXXX.
.XXXXXXX.
..XXXXX..
...XXX...
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/spectator/egg.test.ts
import { describe, expect, it } from 'vitest';
import { THEME } from '../theme.js';
import { hexToRgb } from '../render/bake.js';
import { bakeEgg, EGG_ROWS } from './egg.js';

describe('EGG_ROWS', () => {
  it('is a well-formed 9x11 grid of X, A and dots', () => {
    expect(EGG_ROWS).toHaveLength(11);
    for (const row of EGG_ROWS) {
      expect(row).toHaveLength(9);
      expect(row).toMatch(/^[XA.]+$/);
    }
  });
});

describe('bakeEgg', () => {
  it('paints shell in signCream and spots in the given hue', () => {
    const baked = bakeEgg('#e0a3b2');
    expect(baked.w).toBe(9);
    expect(baked.h).toBe(11);
    const [sr, sg, sb] = hexToRgb(THEME.signCream);
    const [ar, ag, ab] = hexToRgb('#e0a3b2');
    const px = (x: number, y: number) => Array.from(baked.data.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 4));
    expect(px(4, 5)).toEqual([sr, sg, sb, 255]); // shell center
    expect(px(2, 4)).toEqual([ar, ag, ab, 255]); // an A spot
    expect(px(0, 0)).toEqual([0, 0, 0, 0]);      // corner is transparent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/spectator/egg.test.ts`
Expected: FAIL — cannot resolve `./egg.js`.

- [ ] **Step 3: Write the egg implementation**

```ts
// packages/web/src/spectator/egg.ts
import { bakePixels, type BakedPixels } from '../render/bake.js';
import { THEME } from '../theme.js';

/** The nursery egg, 9x11: `X` shell, `A` spots in the future creature's hue. */
export const EGG_ROWS: readonly string[] = [
  '...XXX...',
  '..XXXXX..',
  '.XXXXXXX.',
  '.XXXXAXX.',
  'XXAXXXXXX',
  'XXXXXXXXX',
  'XXXXXAXXX',
  '.XAXXXXX.',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
];

export function bakeEgg(spotHex: string): BakedPixels {
  return bakePixels(
    { w: 9, h: 11, rows: EGG_ROWS as string[] },
    { X: THEME.signCream, A: spotHex },
  );
}
```

(If `ComposedGrid`'s actual field names differ from `{ w, h, rows }`, match them — read `packages/web/src/render/compose.ts` first and adjust; the test stays the same.)

- [ ] **Step 4: Extract `placeInRange` in zones.ts**

Move the body of `placeCreatures` into:

```ts
/**
 * Deterministic placement inside any horizontal range — the same seating
 * contract as Homes (see placeCreatures), reused by the spectator meadow.
 */
export function placeInRange(ids: readonly string[], lo: number, hi: number): Map<string, Spot> {
  // ...the existing body, with `lo`/`hi` replacing the homes-derived bounds...
}

export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  const homes = ZONES.find((z) => z.id === 'homes')!;
  return placeInRange(ids, homes.x + MARGIN, homes.x + homes.w - MARGIN);
}
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `npx vitest run packages/web/src/spectator/egg.test.ts packages/web/src/layout/zones.test.ts`
Expected: PASS — egg tests green, zones tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/spectator/egg.ts packages/web/src/spectator/egg.test.ts packages/web/src/layout/zones.ts
git commit -m "feat(web): egg baking + placeInRange extraction for the spectator meadow"
```

---

### Task 12: The spectator app — entry, client, scene, panel

This is the KAPLAY-and-DOM glue task: deliberately thin, verified by running it, with all decisions already made in Tasks 9–11. Read `packages/web/src/scene/village.ts` and `packages/web/src/scene/creature.ts` before starting — the spectator scene copies their boot pattern (kaplay init, font loading via the existing pattern, pixelDensity + TEXT_SS, drag-to-pan camera with CLICK_SLOP) and reuses `spawnCreature(k, creature, spot, fonts): Promise<CreatureActor>` for residents.

**Visual source of truth:** `reference/swarm-village-trailer/swarm-village-scene.jsx` (the user-approved Claude Design generation — see that folder's README). Copy its constants rather than inventing: contact-shadow treatment, house base rows + dirt lines, egg wobble-burst vs shiver timings, breath/blink/hop parameters, the hatch ceremony timeline, and the flat-band day/night palettes for the eventual theme hookup. Where this plan's behavior text and the trailer disagree on a visual constant, the trailer wins.

**Files:**
- Create: `packages/web/spectator.html`
- Create: `packages/web/vite.spectator.config.ts`
- Create: `packages/web/src/spectator/main.ts`
- Create: `packages/web/src/spectator/client.ts`
- Create: `packages/web/src/spectator/scene.ts`
- Create: `packages/web/src/spectator/panel.ts`
- Modify: `package.json` (root — add `dev:spectator`, `build:spectator` scripts)

**Interfaces:**
- Consumes: `toShowroomView`, `parseShowroomMessage`, `ShowroomView` (Task 9); `panelModel`, `noticeLines`, `formatAuctionCountdown`, `PanelModel`, `PanelTarget` (Task 10); `bakeEgg` (Task 11); `placeInRange` (Task 11); `spawnCreature`, `CreatureActor`, `CreatureFonts` from `../scene/creature.js`; `THEME`, `U`, `TEXT_SS` from `../theme.js`.
- Produces:
  - `client.ts`: `connectShowroom(handlers: { onView(view: ShowroomView): void; onHatch(slug: string, name: string): void; onStatus(status: 'connecting' | 'live' | 'offline'): void }): { close(): void }` — same shape as `net/client.ts` (`/api/village` first paint, then `/ws`), plus the spec §8 fallback: while the socket is down, poll `/api/village` every 60s (`FALLBACK_POLL_MS = 60_000`) so spectators lose only immediacy.
  - `panel.ts`: `createSpectatorPanel(options?: { onToggle?(open: boolean): void }): { open(model: PanelModel): void; close(): void }` — renders a `PanelModel` into the fixed right-side panel div in `spectator.html` (Pixelify header + × close, mono body, chip/boxes as bordered cream blocks, `chipAccent` → `#D97757` border and `#B4552F` text, links as `<a target="_blank" rel="noopener">`).
  - `scene.ts`: `startSpectatorVillage(options: { onTarget(target: PanelTarget): void }): Promise<{ setView(view: ShowroomView): void; playHatch(slug: string): void; setStatus(line: string): void }>`
  - `main.ts` wires them: `connectShowroom` → `scene.setView` / `scene.playHatch`; `scene.onTarget` → `panel.open(panelModel(target, { trivia, now: Date.now() }))`; DOM chips (header sign, status chip, notice board, hint chip) filled from each view.

**Scene layout constants (in `scene.ts`):**

```ts
const WORLD_W = 2200;                      // one meadow, no zone strip
const NURSERY = { lo: 160, hi: 520 };      // fenced pen, eggs placed via placeInRange
const COMMONS = { lo: 640, hi: 1560 };     // residents placed via placeInRange
const PEDESTAL_X = 1800;                   // the rare stands here, never in the commons
```

Reuse `GROUND_Y`/`GROUND_TOP` from `layout/zones.ts` for the ground band so the horizon math matches the game.

**Scene behavior (all of it):**
- Draw sky (`THEME.sky`), ground band (`THEME.ground` with `THEME.groundDark` horizon strip and scattered patches), 2–3 houses + trees + nursery fence + pedestal from rects in THEME colors. **Staging laws apply:** every standing thing gets a contact-shadow ellipse (`THEME.shadow` at low opacity) and a base row; houses get a dirt apron; architecture is static.
- Residents: for each `view.residents` (minus the rare's slug), `spawnCreature` at `placeInRange(ids, COMMONS.lo, COMMONS.hi)` spots; keep a `Map<string, CreatureActor>` keyed by id; on later views call `actor.setCreature(next)` rather than respawning (the game's own pattern). The rare resident spawns at `{ x: PEDESTAL_X, y: <pedestal top> }`.
- Eggs: KAPLAY sprite from `bakeEgg(egg.hue)` scaled by `U * (1 + Math.min(egg.runs, 6) * 0.04)` (runs feed the egg — spec §3's growth mapping), on the nursery nest; **active** eggs wobble in bursts (rock ±6° three times ≈ 2.1s, then rest 4–6s seeded per slug — never in lockstep), inactive eggs sit still. Name tag under each (`?????` when unnamed) in the game's label style.
- Click routing: eggs → `onTarget({ kind: 'egg', egg })`; residents → `{ kind: 'common', resident }`; the rare creature or pedestal → `{ kind: 'rare', rare }` — reuse the game's press-vs-drag CLICK_SLOP pattern.
- `playHatch(slug)`: at that egg's spot run the mockup timeline — wobble hard 0–2.1s, ink crack overlay at 1.4s, at 2.1s hide the egg and fling two shell halves (top up-left, bottom down-right, fading), at 2.15s pop the new resident in with overshoot (scale 0.4 → 1.06 → 1) plus 8 confetti pixels in the core palette hues, at 2.85s stamp a sign `"{name} — hatched!"`. The next `setView` already carries the resident; `playHatch` only performs the ceremony.
- `setStatus(line)` renders into the status chip (used for `"the swarm is napping"` when `view.feedStale`, and the empty-feed line `"the swarm hasn't sent anyone home yet."` when counts are all zero).
- Chip text: `● {villagers} villagers · {eggs} eggs · {rares} rare on the block` — omit the rare clause entirely when `rares === 0`.
- Notice board DOM card: title `NOTICE BOARD`, then `noticeLines(view.events)` (already newest-first), capped at 4 lines.
- Rare pedestal sign: `RARE DROP` in accent + `auction in {formatAuctionCountdown(Date.now(), rare.auctionOpensAt)}`, re-rendered once a minute.
- Hint chip (`#hud-hint`): the spec's line, verbatim — `click an egg, a villager, or the rosette` — visible only while the panel is closed; `main.ts` toggles it when the panel opens/closes.

- [ ] **Step 1: Write `spectator.html`**

Copy `packages/web/index.html` and change: `<title>Swarm Village</title>`; delete the `#chat-panel` and `#silent-banner` CSS and add instead (same palette discipline — every hex mirrors THEME):

```html
<style>
  html, body { margin: 0; height: 100%; background: #171310; overflow: hidden; }
  canvas { display: block; image-rendering: pixelated; }
  #side-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 320px; z-index: 11;
    background: #FFFDF4; border-left: 3px solid #3A2E22;
    display: flex; flex-direction: column;
    font: 13px/1.55 'IBM Plex Mono', monospace; color: #3A2E22;
  }
  #side-panel[hidden] { display: none; }
  #side-panel header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; border-bottom: 2px solid #3A2E22;
    font-family: 'Pixelify Sans', sans-serif; font-size: 18px;
  }
  #side-panel a { color: #B4552F; }
  #side-panel a:hover { color: #8F3E20; }
  @media (max-width: 700px) { #side-panel { width: 100%; } }
  .hud { position: fixed; z-index: 10; color: #3A2E22;
    font: 12px/1.5 'IBM Plex Mono', monospace; }
  .hud .board { display: inline-block; background: #F2E5C4; border: 3px solid #3A2E22; padding: 8px 16px; }
  .hud .chip { display: inline-block; background: #FFFDF4; border: 2px solid #3A2E22; padding: 3px 10px; }
  #hud-sign { left: 24px; top: 20px; }
  #hud-notice { left: 24px; bottom: 24px; }
  #hud-hint { right: 24px; bottom: 24px; }
</style>
```

Body: `#hud-sign`, `#hud-notice`, `#hud-hint` empty `.hud` divs, `#side-panel hidden`, then `<script type="module" src="/src/spectator/main.ts"></script>`.

- [ ] **Step 2: Write `vite.spectator.config.ts`**

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The showroom server owns 8263; same one-origin proxy trick as the game. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist-spectator',
    rollupOptions: { input: fileURLToPath(new URL('./spectator.html', import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8263', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8263', ws: true },
    },
  },
});
```

Root `package.json` scripts:

```json
"dev:spectator": "vite --config packages/web/vite.spectator.config.ts --open /spectator.html",
"build:spectator": "vite build --config packages/web/vite.spectator.config.ts",
```

- [ ] **Step 3: Write `client.ts`**

```ts
// packages/web/src/spectator/client.ts
import { parseShowroomMessage, toShowroomView, type ShowroomView } from './protocol.js';

export interface ShowroomHandlers {
  onView(view: ShowroomView): void;
  onHatch(slug: string, name: string): void;
  onStatus(status: 'connecting' | 'live' | 'offline'): void;
}

const RETRY_MS = 2000;
/** Spec §8: while the socket is down, spectators lose only immediacy. */
const FALLBACK_POLL_MS = 60_000;

export function connectShowroom(handlers: ShowroomHandlers): { close(): void } {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let fallback: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const fetchOnce = () =>
    fetch('/api/village')
      .then((res) => res.json())
      .then((payload) => {
        const view = toShowroomView(payload);
        if (view && !closed) handlers.onView(view);
      })
      .catch(() => handlers.onStatus('offline'));

  void fetchOnce(); // first paint before the socket lands

  const stopFallback = () => {
    if (fallback) { clearInterval(fallback); fallback = null; }
  };

  const open = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      handlers.onStatus('live');
      stopFallback();
    });
    socket.addEventListener('message', (event) => {
      const frame = parseShowroomMessage(String(event.data));
      if (!frame) return;
      if (frame.type === 'village') handlers.onView(frame.view);
      else handlers.onHatch(frame.slug, frame.name);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      handlers.onStatus('offline');
      if (!fallback) fallback = setInterval(() => void fetchOnce(), FALLBACK_POLL_MS);
      retry = setTimeout(open, RETRY_MS);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  open();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      stopFallback();
      socket?.close();
    },
  };
}
```

- [ ] **Step 4: Write `panel.ts`**

```ts
// packages/web/src/spectator/panel.ts
import type { PanelModel } from './copy.js';

/**
 * Renders a PanelModel into #side-panel. All decisions live in panelModel();
 * this is the last inch, and it only draws.
 */
export function createSpectatorPanel(options: { onToggle?(open: boolean): void } = {}): {
  open(model: PanelModel): void;
  close(): void;
} {
  const root = document.getElementById('side-panel')!;

  function close(): void {
    root.hidden = true;
    root.replaceChildren();
    options.onToggle?.(false);
  }

  function el(tag: string, style: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.setAttribute('style', style);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function open(model: PanelModel): void {
    root.replaceChildren();

    const header = document.createElement('header');
    header.append(el('div', '', model.header));
    const x = el('button', 'border:0;background:none;font-size:20px;cursor:pointer;color:#3A2E22;', '×');
    x.addEventListener('click', close);
    header.append(x);
    root.append(header);

    const body = el('div', 'padding:14px;overflow-y:auto;flex:1;');
    if (model.chip) {
      body.append(el('div',
        model.chipAccent
          ? 'display:inline-block;border:2px solid #D97757;color:#B4552F;padding:2px 8px;font-size:11px;margin-bottom:8px;'
          : 'display:inline-block;border:2px solid #3A2E22;padding:2px 8px;font-size:11px;margin-bottom:8px;',
        model.chip));
    }
    body.append(el('div', "font-family:'Pixelify Sans',sans-serif;font-size:24px;margin-bottom:6px;", model.title));
    body.append(el('div', 'margin-bottom:8px;', model.desc));
    body.append(el('div', 'opacity:0.7;font-size:12px;margin-bottom:10px;', model.meta));
    if (model.trivia) {
      body.append(el('div', 'background:#F2E5C4;border:1.5px solid #3A2E22;padding:6px 9px;font-size:12px;margin-bottom:10px;', model.trivia));
    }
    if (model.links.length > 0) {
      const row = el('div', 'margin-bottom:12px;');
      model.links.forEach((link, i) => {
        if (i > 0) row.append(' · ');
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = link.label;
        row.append(a);
      });
      body.append(row);
    }
    for (const box of model.boxes) {
      body.append(el('div', 'border:2px solid #3A2E22;background:#F2E5C4;padding:9px 11px;font-size:12px;margin-bottom:10px;', box));
    }
    if (model.footnote) body.append(el('div', 'font-size:11px;opacity:0.7;', model.footnote));
    root.append(body);

    root.hidden = false;
    options.onToggle?.(true);
  }

  return { open, close };
}
```

- [ ] **Step 5: Write `scene.ts` and `main.ts`** per the Interfaces and Scene behavior blocks above. `scene.ts` mirrors the boot of `packages/web/src/scene/village.ts` (kaplay init with the same pixelDensity/TEXT_SS handling, font loading, drag-to-pan with the CLICK_SLOP press-vs-drag pattern) trimmed to one meadow — read that file first and copy its patterns rather than inventing new KAPLAY idioms; residents come from `spawnCreature` exactly as the game spawns villagers. `main.ts` wires client → scene/panel/HUD:

```ts
// packages/web/src/spectator/main.ts — the whole wiring, nothing clever
import { connectShowroom } from './client.js';
import { createSpectatorPanel } from './panel.js';
import { startSpectatorVillage } from './scene.js';
import { noticeLines, panelModel } from './copy.js';
import type { ShowroomView } from './protocol.js';

let latest: ShowroomView | null = null;

const hint = document.getElementById('hud-hint')!;
hint.innerHTML = '<span class="chip">click an egg, a villager, or the rosette</span>';

const panel = createSpectatorPanel({ onToggle: (open) => { hint.hidden = open; } });

const scene = await startSpectatorVillage({
  onTarget: (target) => {
    if (!latest) return;
    panel.open(panelModel(target, { trivia: latest.trivia, now: Date.now() }));
  },
});

function renderHud(view: ShowroomView): void {
  const sign = document.getElementById('hud-sign')!;
  const rareClause = view.counts.rares > 0 ? ` · ${view.counts.rares} rare on the block` : '';
  const stale = view.feedStale ? ' — the swarm is napping' : '';
  sign.innerHTML =
    `<div class="board"><div style="font-family:'Pixelify Sans',sans-serif;font-size:27px;line-height:1.1;">SWARM VILLAGE</div>` +
    `<div style="font-size:11px;opacity:0.75;">every villager here was built by the swarm</div></div><br>` +
    `<span class="chip" style="margin-top:8px;"><span style="color:#D97757;">●</span> ` +
    `${view.counts.villagers} villagers · ${view.counts.eggs} eggs${rareClause}${stale}</span>`;

  const notice = document.getElementById('hud-notice')!;
  const lines = noticeLines(view.events).slice(0, 4);
  notice.innerHTML = lines.length === 0 ? '' :
    `<div class="board" style="font-size:12px;"><div style="font-family:'Pixelify Sans',sans-serif;font-size:14px;">NOTICE BOARD</div>` +
    lines.map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('') + `</div>`;
}

connectShowroom({
  onView: (view) => {
    latest = view;
    scene.setView(view);
    renderHud(view);
    if (view.counts.villagers === 0 && view.counts.eggs === 0) {
      scene.setStatus("the swarm hasn't sent anyone home yet.");
    }
  },
  onHatch: (slug) => scene.playHatch(slug),
  onStatus: (status) =>
    scene.setStatus(status === 'live' ? '' : status === 'connecting' ? 'connecting…' : 'server offline — retrying'),
});
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run` — Expected: everything green (no new unit tests in this task; prior tasks' tests still pass).
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 7: Verify live against the real feed**

Run `npm run dev:showroom` and `npm run dev:spectator`. In the opened page confirm, in order:
1. Residents from the live feed stand in the commons with name tags; eggs sit in the nursery; counts chip matches the panel reality.
2. Clicking an egg / a common / the pedestal opens the right panel content (spec §6 copy, links out work).
3. No configured rare yet → no pedestal creature, chip omits the rare clause. Then create `~/.swarm-showroom/showroom.config.json` naming one hatched slug as rare №1 with a future `auctionOpensAt`, restart the showroom server, confirm the pedestal + countdown + rare panel.
4. Stop the showroom server → page shows offline status and keeps the last village; restart → recovers.
5. Nothing floats (contact shadows everywhere) and nothing moves in lockstep (eggs wobble on their own schedules; dozing residents sleep).

- [ ] **Step 8: Commit**

```bash
git add packages/web/spectator.html packages/web/vite.spectator.config.ts packages/web/src/spectator package.json
git commit -m "feat(web): the spectator village — entry, client, scene, panel"
```

---

### Task 13: Deploy notes + the playtest gate

**Files:**
- Create: `docs/showroom-deploy.md`

- [ ] **Step 1: Write the deploy doc**

Contents (concrete, no placeholders — adjust names to the droplet's existing conventions from the fenley.ai deploy):

````markdown
# Deploying the Swarm Showroom

## Build
    npm ci
    npm run build:spectator        # → packages/web/dist-spectator/

## Droplet layout
- Static bundle: rsync `packages/web/dist-spectator/` → `/var/www/village/`
- Server: the repo checked out on the droplet; run with
  `SHOWROOM_HOST=127.0.0.1 SHOWROOM_PORT=8263 npx tsx packages/server/src/showroom/main.ts`
  under the droplet's process manager (same pattern as the swarm services).
- Config: `~/.swarm-showroom/showroom.config.json` (spec §7 shape). The server
  logs config warnings on boot — read them after every edit.

## nginx (village.fenley.ai)
    server {
      server_name village.fenley.ai;
      root /var/www/village;
      location /api/ { proxy_pass http://127.0.0.1:8263; }
      location /ws {
        proxy_pass http://127.0.0.1:8263;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
      }
      location / { try_files $uri /spectator.html; }
    }

DNS + TLS follow the existing fenley.ai certbot setup.

## Smoke test after deploy
    curl -s https://village.fenley.ai/api/health   # {"ok":true,"villagers":N}
Open the page; confirm the village renders and the socket connects (status chip).
````

- [ ] **Step 2: Commit**

```bash
git add docs/showroom-deploy.md
git commit -m "docs: showroom deploy notes for the droplet"
```

- [ ] **Step 3: The playtest gate (do not skip)**

Per the standing playtest rule, the keeper's eyes are the final review for anything visual. Deploy (or run locally), then hand the user a checkpoint covering exactly:
- the two staging laws (nothing floats; nothing moves in lockstep),
- panel copy reading right in place,
- the hatch ceremony (trigger one with a temporary config/fixture if the feed won't oblige),
- boxes hugging their text at real DPI.

S1 is **done** only when the user signs off. Their fix list is the next work queue, one change at a time.
