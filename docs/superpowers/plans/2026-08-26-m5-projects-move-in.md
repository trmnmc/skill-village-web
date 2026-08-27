# M5 — The Projects Move In: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects from `~/.claude/projects` become villagers: discovered read-only, fed by a transcript work signal, drawn in Homes with their helpers beside them.

**Architecture:** A new read-only scanner in the server bridge discovers project entries (folding worktrees), extracts per-transcript facts (`cwd`, helper mentions, mtime) behind a per-file cache, and folds the result into village state through a project-specific reconcile that never releases anything. Project health derives from `lastWorkedAt` at tick time — the raw signal is stored, the curve is tunable code. The web renderer grows a render-instance layer: one helper creature can be drawn beside every project that uses it, while unlinked helpers keep wandering the commons exactly as today.

**Tech Stack:** TypeScript (ESM, strict), vitest, Node `fs/promises`, KAPLAY (web renderer), Fastify (server). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md` (plus the zones/verbs tables in `docs/superpowers/specs/2026-08-22-roadmap-reconciliation-design.md`). The plan implements M5 fully, plus the §5 decay curve (the renderer needs project stats to mean something). The rest of M6 — signs copy, chat-with-the-project personas from CLAUDE.md, release/re-adopt UI — is a separate plan.

## Global Constraints

- **No file under `~/.claude` is ever written, moved, or locked.** The scanner modules (Tasks 4–6) may import only read APIs from `node:fs/promises` (`readdir`, `readFile`, `stat`). Reviewers: check the import lines.
- **The game never writes to a project's `sourcePath` in M5/M6** (spec §1).
- **`friendships` stays helper-only** (spec §1). Projects are created with `friendships: {}` and no code path adds project edges (nothing in the server grows friendships today — keep it that way).
- Worktree folding regex, verbatim from the spec: `/^(.+)--claude-worktrees-.+$/`
- Scan cadence: **boot + every 5 minutes** (spec §3). Cache file: `~/.skill-village/scan-cache.json`, keyed by file path, storing `{ size, mtimeMs, facts }`.
- Snapshot villages (the public droplet) **never scan projects** — same reasoning as the existing no-reconcile rule.
- Health/mood for projects are **derived from `lastWorkedAt` at tick time**; the stored values are a cache of the derivation, never the source of truth. Tuning the curve must never need a state migration (spec §1). `STATE_VERSION` stays 4 — every new field is optional and additive.
- Tests: `npx vitest run <file>` per task; full suite `npm test`; types `npm run typecheck`. All from the repo root.
- **Standing rule: push every commit immediately** (`git push` after every `git commit`).

---

### Task 1: Core — `'project'` joins the creature model

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/types.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CreatureKind = 'skill' | 'agent' | 'project'`, `type Role = 'project' | 'helper'`, `function role(kind: CreatureKind): Role`, and optional `Creature` fields `lastWorkedAt?: number`, `helperIds?: string[]`, `unresolvedMentions?: string[]`, `retired?: boolean`. Every later task relies on these exact names. (`types.ts` is re-exported by both `index.ts` and `visual.ts`, so server and renderer see them without further wiring.)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/types.test.ts`:

```ts
import { role } from './types.js';

describe('role', () => {
  it('derives helper for skills and agents, project for projects', () => {
    expect(role('skill')).toBe('helper');
    expect(role('agent')).toBe('helper');
    expect(role('project')).toBe('project');
  });
});
```

(Match the file's existing import style — if it already imports from `./types.js`, extend that import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/types.test.ts`
Expected: FAIL — `role` is not exported (and `'project'` is not a valid `CreatureKind`).

- [ ] **Step 3: Implement**

In `packages/core/src/types.ts`, replace the `CreatureKind` line:

```ts
/**
 * A creature is a skill (grounded) or an agent (winged) — together the helper
 * role — or a project, the villager role. The role layer is derived, never
 * stored (remap spec §1).
 */
export type CreatureKind = 'skill' | 'agent' | 'project';

export type Role = 'project' | 'helper';

export function role(kind: CreatureKind): Role {
  return kind === 'project' ? 'project' : 'helper';
}
```

And extend `Creature` (after `lastSeenAt`):

```ts
  /**
   * Projects only: the newest transcript mtime across the project's sessions,
   * worktrees folded in. The raw work signal — health derives from it at tick
   * time and is never persisted as truth (remap spec §1).
   */
  lastWorkedAt?: number;
  /** Projects only: resolved helper creature ids. Sorted, deduped. */
  helperIds?: string[];
  /**
   * Projects only: helper mentions that matched no creature on disk —
   * plugin-prefixed skills, built-in agent types. The "powers beyond the
   * village" tally (remap spec §3). Sorted, deduped.
   */
  unresolvedMentions?: string[];
  /**
   * Projects only (M6): released by the player. Discovery must never
   * resurrect a retired project; re-adopt clears the flag (remap spec §2).
   */
  retired?: boolean;
```

Also update `sourcePath`'s doc comment to cover projects:

```ts
  /**
   * Absolute path to the SKILL.md or agent .md this creature represents; for
   * a project, its real folder (from transcript `cwd`), `''` if unknown. The
   * game never writes to a project's folder in M5/M6.
   */
  sourcePath: string;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/types.test.ts` — PASS.
Run: `npm run typecheck` — the widened union must not break existing exhaustive switches; if `tsc` flags one (e.g. a `kind === 'agent' ? … : …` that assumed two members), fix it by treating `'project'` like `'skill'` (grounded, unwinged) and note it in the commit message.

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/types.ts packages/core/src/types.test.ts
git commit -m "feat(core): projects join the creature model as a third kind with a derived role"
git push
```

---

### Task 2: Core — the work-decay curve

**Files:**
- Create: `packages/core/src/sim/work.ts`
- Test: `packages/core/src/sim/work.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './sim/work.js';` beside the other sim exports)

**Interfaces:**
- Consumes: `STAT_FLOOR` from `./stats.js`.
- Produces: `workStats(msSinceWorked: number): { mood: number; energy: number }` plus the named tunables below. Task 9 (tick) is the only consumer.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/sim/work.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { workStats, THRIVING_MOOD, CONTENT_MOOD, DAY_MS } from './work.js';
import { STAT_FLOOR } from './stats.js';

describe('workStats', () => {
  it('worked within a day: thriving (hops — above behaviour thresholds 75/70)', () => {
    expect(workStats(0).mood).toBe(THRIVING_MOOD);
    expect(workStats(23 * 3_600_000)).toEqual({ mood: 85, energy: 80 });
  });

  it('eases from thriving to content across the first week', () => {
    expect(workStats(4 * DAY_MS).mood).toBeCloseTo(72.5, 5);
    expect(workStats(7 * DAY_MS).mood).toBeCloseTo(CONTENT_MOOD, 5);
  });

  it('droops past a week, relaxing toward the floor but never below it', () => {
    expect(workStats(12 * DAY_MS).mood).toBeCloseTo(STAT_FLOOR + 30 / 2, 5); // one half-life past day 7
    expect(workStats(365 * DAY_MS).mood).toBeGreaterThanOrEqual(STAT_FLOOR);
    expect(workStats(365 * DAY_MS).mood).toBeLessThan(31);
  });

  it('is monotone non-increasing and continuous at both joints', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 30; d += 0.25) {
      const { mood } = workStats(d * DAY_MS);
      expect(mood).toBeLessThanOrEqual(prev + 1e-9);
      prev = mood;
    }
  });

  it('a clock that jumped backwards reads as freshly worked, never as negative time', () => {
    expect(workStats(-5 * DAY_MS).mood).toBe(THRIVING_MOOD);
  });

  it('energy trails mood by 5, floored', () => {
    expect(workStats(0).energy).toBe(80);
    expect(workStats(365 * DAY_MS).energy).toBeGreaterThanOrEqual(STAT_FLOOR);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/sim/work.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`packages/core/src/sim/work.ts`:

```ts
import { STAT_FLOOR } from './stats.js';

export const DAY_MS = 86_400_000;

/** Worked within a day: thriving — above behaviour.ts's hop thresholds. */
export const THRIVING_MOOD = 85;
export const THRIVING_DAYS = 1;
/** Worked within a week: content — awake, not bouncing. */
export const CONTENT_MOOD = 60;
export const CONTENT_DAYS = 7;
/** Past a week the droop relaxes toward STAT_FLOOR on this half-life. */
export const DROOP_HALF_LIFE_DAYS = 5;

export interface WorkStats {
  mood: number;
  energy: number;
}

/**
 * A project's mood and energy as a pure function of how long since Claude
 * last worked in it (remap spec §5). Only real work heals — care never moves
 * these two. Tunable constants, not state: retuning this curve must never
 * need a migration, which is why callers derive at tick time and the stored
 * stats are only a cache of this function.
 *
 * Negative input (a clock that jumped backwards) reads as freshly worked,
 * matching applyTick's no-free-mood clamp in spirit: never punish, never
 * reward, a clock correction.
 */
export function workStats(msSinceWorked: number): WorkStats {
  const days = Math.max(0, msSinceWorked) / DAY_MS;
  let mood: number;
  if (days <= THRIVING_DAYS) {
    mood = THRIVING_MOOD;
  } else if (days <= CONTENT_DAYS) {
    const t = (days - THRIVING_DAYS) / (CONTENT_DAYS - THRIVING_DAYS);
    mood = THRIVING_MOOD + (CONTENT_MOOD - THRIVING_MOOD) * t;
  } else {
    const past = days - CONTENT_DAYS;
    mood = STAT_FLOOR + (CONTENT_MOOD - STAT_FLOOR) * Math.pow(0.5, past / DROOP_HALF_LIFE_DAYS);
  }
  return { mood, energy: Math.max(STAT_FLOOR, mood - 5) };
}
```

Add to `packages/core/src/index.ts`, beside the other `./sim/` exports:

```ts
export * from './sim/work.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/sim/work.test.ts` — PASS.

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/sim/work.ts packages/core/src/sim/work.test.ts packages/core/src/index.ts
git commit -m "feat(core): only real work heals - the project decay curve"
git push
```

---

### Task 3: Server — paths learn where Claude keeps its sessions

**Files:**
- Modify: `packages/server/src/config/paths.ts`
- Test: `packages/server/src/config/paths.test.ts`

**Interfaces:**
- Produces: `VillagePaths.claudeProjectsDir: string` (`<home>/.claude/projects`) and `VillagePaths.scanCachePath: string` (`<dataDir>/scan-cache.json`). Tasks 5, 6, 10 consume them.

- [ ] **Step 1: Write the failing tests**

Append to the existing describe in `packages/server/src/config/paths.test.ts` (follow its existing assertion style):

```ts
it('knows Claude Code session logs (read-only) and the scan cache', () => {
  const paths = resolvePaths({ home: '/h' });
  expect(paths.claudeProjectsDir).toBe(join('/h', '.claude', 'projects'));
  expect(paths.scanCachePath).toBe(join('/h', '.skill-village', 'scan-cache.json'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/config/paths.test.ts`
Expected: FAIL — properties do not exist.

- [ ] **Step 3: Implement**

In `VillagePaths`, after `pidPath`:

```ts
  /**
   * Claude Code's own session logs (`~/.claude/projects`). READ-ONLY — the
   * standing safety rule extends to the scanner: no file under `~/.claude`
   * is ever written, moved, or locked (remap spec §2).
   */
  claudeProjectsDir: string;
  /** Per-transcript facts cache (remap spec §3). Keyed by file path. */
  scanCachePath: string;
```

In `resolvePaths`'s return, after `pidPath`:

```ts
    claudeProjectsDir: join(claudeDir, 'projects'),
    scanCachePath: join(dataDir, 'scan-cache.json'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/config/paths.test.ts` — PASS.

- [ ] **Step 5: Commit and push**

```bash
git add packages/server/src/config/paths.ts packages/server/src/config/paths.test.ts
git commit -m "feat(server): paths learn where Claude keeps its sessions, and where the scan cache lives"
git push
```

---

### Task 4: Server — the transcript fact parser, pinned to real fixtures

**Files:**
- Create: `packages/server/src/bridge/transcripts.ts`
- Create: `packages/server/src/bridge/testing/fixtures/session.jsonl`
- Test: `packages/server/src/bridge/transcripts.test.ts`

**Interfaces:**
- Produces: `parseTranscript(text: string): TranscriptFacts` where `TranscriptFacts = { cwd: string | null; helperMentions: string[] }`. Pure — no fs, no clock. Task 5 consumes it.
- **Safety assertion (spec §6):** this module imports nothing at all from `node:fs`. Reviewer, check the imports.

- [ ] **Step 1: Pin the fixture**

`packages/server/src/bridge/testing/fixtures/session.jsonl` — real (redacted) line shapes, verified against live transcripts on 2026-08-26: `cwd` is a top-level field on user/assistant lines; skill use is a `tool_use` content item with `name: "Skill"` and `input.skill`; agent spawns carry `input.subagent_type`. One line each for: a cwd line, a resolvable skill, an agent spawn, a plugin-prefixed skill, a built-in agent type, a malformed line, and a newer cwd (newest wins). Write exactly:

```
{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":"okay lets continue"},"uuid":"u-1","timestamp":"2026-08-24T12:00:00.000Z","cwd":"C:\\Users\\dev\\Old-Place\\my-project","sessionId":"s-1","version":"2.1.0"}
{"parentUuid":"u-1","isSidechain":false,"message":{"model":"claude-fable-5","id":"msg_01","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_01","name":"Skill","input":{"skill":"brainstorming"},"caller":{"type":"direct"}}],"stop_reason":"tool_use"},"type":"assistant","uuid":"a-1","timestamp":"2026-08-24T12:01:00.000Z","cwd":"C:\\Users\\dev\\Old-Place\\my-project"}
{"parentUuid":"a-1","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_02","name":"Task","input":{"description":"Review the diff","prompt":"Review it.","subagent_type":"code-reviewer"}}],"type":"message"},"type":"assistant","uuid":"a-2","timestamp":"2026-08-24T12:02:00.000Z"}
{"parentUuid":"a-2","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_03","name":"Skill","input":{"skill":"anthropic-skills:xlsx"}}],"type":"message"},"type":"assistant","uuid":"a-3","timestamp":"2026-08-24T12:03:00.000Z"}
{"parentUuid":"a-3","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_04","name":"Task","input":{"subagent_type":"general-purpose"}}],"type":"message"},"type":"assistant","uuid":"a-4","timestamp":"2026-08-24T12:04:00.000Z"}
{"parentUuid":"a-4","isSidechain":false,"type":"assistant","message":{"role":"assis
{"parentUuid":"a-4","isSidechain":false,"type":"user","message":{"role":"user","content":"moved the checkout"},"uuid":"u-2","timestamp":"2026-08-24T12:05:00.000Z","cwd":"C:\\Users\\dev\\Projects\\my-project","sessionId":"s-1"}
```

(Line 6 is deliberately truncated mid-string — the malformed-line case. Do not "fix" it.)

- [ ] **Step 2: Write the failing tests**

`packages/server/src/bridge/transcripts.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseTranscript } from './transcripts.js';

const fixture = () =>
  readFile(new URL('./testing/fixtures/session.jsonl', import.meta.url), 'utf8');

describe('parseTranscript', () => {
  it('collects every helper mention — skills by input.skill, agents by any subagent_type', async () => {
    const facts = parseTranscript(await fixture());
    expect(facts.helperMentions).toEqual([
      'brainstorming',
      'code-reviewer',
      'anthropic-skills:xlsx',
      'general-purpose',
    ]);
  });

  it('the newest cwd wins', async () => {
    const facts = parseTranscript(await fixture());
    expect(facts.cwd).toBe('C:\\Users\\dev\\Projects\\my-project');
  });

  it('skips malformed lines without losing the rest (format-drift alarm: if the', async () => {
    // pinned shapes stop parsing, THIS file fails loudly — remap spec §3.
    const facts = parseTranscript(await fixture());
    expect(facts.helperMentions.length).toBe(4);
  });

  it('an empty or all-junk file yields empty facts', () => {
    expect(parseTranscript('')).toEqual({ cwd: null, helperMentions: [] });
    expect(parseTranscript('not json\n{"also":')).toEqual({ cwd: null, helperMentions: [] });
  });

  it('dedupes repeated mentions, keeping first-seen order', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'brainstorming' } }] },
    });
    expect(parseTranscript(`${line}\n${line}`).helperMentions).toEqual(['brainstorming']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/bridge/transcripts.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

`packages/server/src/bridge/transcripts.ts`:

```ts
/**
 * Per-file facts from one Claude Code session transcript (remap spec §3).
 *
 * Pure text in, facts out — no fs, no clock. The shapes this keys on are
 * Claude Code's internal transcript format: `cwd` as a top-level field, and
 * tool calls as `message.content[]` items of `{ type: 'tool_use', name,
 * input }`. That fragility is owned: the pinned fixture in
 * testing/fixtures/session.jsonl fails loudly when the format drifts,
 * instead of the village quietly starving.
 */
export interface TranscriptFacts {
  /** The last `cwd` value seen in the file — the newest wins. Null if none. */
  cwd: string | null;
  /**
   * Deduped helper mentions, first-seen order: every Skill call's
   * `input.skill` and every tool_use's `input.subagent_type`.
   */
  helperMentions: string[];
}

export function parseTranscript(text: string): TranscriptFacts {
  let cwd: string | null = null;
  const mentions = new Set<string>();

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // a half-written line from a crash; the rest is still good
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const entry = parsed as { cwd?: unknown; message?: { content?: unknown } };

    if (typeof entry.cwd === 'string' && entry.cwd !== '') cwd = entry.cwd;

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== 'object' || item === null) continue;
      const call = item as {
        type?: unknown;
        name?: unknown;
        input?: { skill?: unknown; subagent_type?: unknown } | null;
      };
      if (call.type !== 'tool_use' || typeof call.input !== 'object' || call.input === null) continue;
      if (call.name === 'Skill' && typeof call.input.skill === 'string') {
        mentions.add(call.input.skill);
      }
      if (typeof call.input.subagent_type === 'string') {
        mentions.add(call.input.subagent_type);
      }
    }
  }

  return { cwd, helperMentions: [...mentions] };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/bridge/transcripts.test.ts` — PASS.

- [ ] **Step 6: Commit and push**

```bash
git add packages/server/src/bridge/transcripts.ts packages/server/src/bridge/transcripts.test.ts packages/server/src/bridge/testing/fixtures/session.jsonl
git commit -m "feat(server): the village learns to read Claude's own diaries - transcript facts, pinned to real fixtures"
git push
```

---

### Task 5: Server — the per-file scan cache

**Files:**
- Create: `packages/server/src/bridge/scan-cache.ts`
- Test: `packages/server/src/bridge/scan-cache.test.ts`

**Interfaces:**
- Consumes: `parseTranscript` (Task 4), `VillagePaths` (Task 3).
- Produces (Task 6 and Task 10 consume):

```ts
interface FileFacts { lastActivityMs: number; cwd: string | null; helperMentions: string[] }
interface ScanCache { version: 1; files: Record<string, { size: number; mtimeMs: number; facts: FileFacts }> }
function emptyScanCache(): ScanCache
async function loadScanCache(paths: VillagePaths): Promise<ScanCache>       // missing/corrupt → empty
async function saveScanCache(paths: VillagePaths, cache: ScanCache): Promise<void>
async function collectFacts(files: readonly string[], previous: ScanCache):
  Promise<{ byFile: Map<string, FileFacts>; cache: ScanCache }>             // next cache pruned to `files`
```

- **Safety assertion:** imports from `node:fs/promises` are `stat`, `readFile`, `writeFile`, `mkdir` — and the *only* write targets are `paths.scanCachePath` (under `~/.skill-village`). Nothing under `~/.claude` is written.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/bridge/scan-cache.test.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSandbox, type Sandbox } from '../testing/sandbox.js';
import {
  collectFacts, emptyScanCache, loadScanCache, saveScanCache, type ScanCache,
} from './scan-cache.js';

const SKILL_LINE = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'brainstorming' } }] },
  cwd: '/home/dev/proj',
});

describe('scan cache', () => {
  let sandbox: Sandbox;
  beforeEach(async () => { sandbox = await makeSandbox(); });
  afterEach(async () => { await sandbox.cleanup(); });

  it('a missing or corrupt cache file loads as empty — insurance, not a prerequisite', async () => {
    expect(await loadScanCache(sandbox.paths)).toEqual(emptyScanCache());
    await writeFile(sandbox.paths.scanCachePath, '{not json', 'utf8');
    expect(await loadScanCache(sandbox.paths)).toEqual(emptyScanCache());
  });

  it('round-trips through save and load', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const { cache } = await collectFacts([file], emptyScanCache());
    await saveScanCache(sandbox.paths, cache);
    expect(await loadScanCache(sandbox.paths)).toEqual(cache);
  });

  it('parses fresh files and records size/mtime facts', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const { byFile } = await collectFacts([file], emptyScanCache());
    const facts = byFile.get(file)!;
    expect(facts.cwd).toBe('/home/dev/proj');
    expect(facts.helperMentions).toEqual(['brainstorming']);
    expect(facts.lastActivityMs).toBeGreaterThan(0);
  });

  it('an unchanged file is NOT reparsed — the cached facts are trusted verbatim', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const first = await collectFacts([file], emptyScanCache());
    // Poison the cached facts: if collectFacts reparses, the sentinel vanishes.
    const poisoned: ScanCache = structuredClone(first.cache);
    poisoned.files[file]!.facts.helperMentions = ['sentinel'];
    const second = await collectFacts([file], poisoned);
    expect(second.byFile.get(file)!.helperMentions).toEqual(['sentinel']);
  });

  it('a changed file (different size) is reparsed', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const first = await collectFacts([file], emptyScanCache());
    await writeFile(file, `${SKILL_LINE}\n${SKILL_LINE}`, 'utf8');
    const second = await collectFacts([file], first.cache);
    expect(second.byFile.get(file)!.helperMentions).toEqual(['brainstorming']);
    expect(second.cache.files[file]!.size).not.toBe(first.cache.files[file]!.size);
  });

  it('the next cache is pruned to the files actually seen', async () => {
    const a = join(sandbox.home, 'a.jsonl');
    const b = join(sandbox.home, 'b.jsonl');
    await writeFile(a, SKILL_LINE, 'utf8');
    await writeFile(b, SKILL_LINE, 'utf8');
    const both = await collectFacts([a, b], emptyScanCache());
    const onlyA = await collectFacts([a], both.cache);
    expect(Object.keys(onlyA.cache.files)).toEqual([a]);
  });

  it('a file that vanishes mid-scan is skipped, not fatal', async () => {
    const ghost = join(sandbox.home, 'ghost.jsonl');
    const { byFile, cache } = await collectFacts([ghost], emptyScanCache());
    expect(byFile.size).toBe(0);
    expect(cache.files).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/bridge/scan-cache.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`packages/server/src/bridge/scan-cache.ts`:

```ts
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { parseTranscript } from './transcripts.js';

/** Facts per transcript file (remap spec §3). */
export interface FileFacts {
  /**
   * The file's mtime. `~/.claude` is not under OneDrive on the reference
   * machine, so mtimes are trustworthy; line timestamps are the fallback if
   * a platform ever proves otherwise (spec §3) — which is why this is a
   * stored fact and not re-derived by callers.
   */
  lastActivityMs: number;
  cwd: string | null;
  helperMentions: string[];
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  facts: FileFacts;
}

export interface ScanCache {
  version: 1;
  files: Record<string, CacheEntry>;
}

export function emptyScanCache(): ScanCache {
  return { version: 1, files: {} };
}

/** The cache is insurance, never a prerequisite: missing or corrupt reads as empty. */
export async function loadScanCache(paths: VillagePaths): Promise<ScanCache> {
  try {
    const parsed = JSON.parse(await readFile(paths.scanCachePath, 'utf8')) as ScanCache;
    if (parsed?.version === 1 && typeof parsed.files === 'object' && parsed.files !== null) {
      return parsed;
    }
  } catch {
    // fall through to empty
  }
  return emptyScanCache();
}

export async function saveScanCache(paths: VillagePaths, cache: ScanCache): Promise<void> {
  await mkdir(dirname(paths.scanCachePath), { recursive: true });
  await writeFile(paths.scanCachePath, JSON.stringify(cache), 'utf8');
}

/**
 * Facts for every listed file, reparsing only what changed (size or mtime).
 * Returns the next cache, pruned to exactly the files seen this scan, so
 * transcripts Claude Code expires never pin cache entries forever.
 */
export async function collectFacts(
  files: readonly string[],
  previous: ScanCache,
): Promise<{ byFile: Map<string, FileFacts>; cache: ScanCache }> {
  const byFile = new Map<string, FileFacts>();
  const next = emptyScanCache();

  for (const file of files) {
    let size: number;
    let mtimeMs: number;
    try {
      ({ size, mtimeMs } = await stat(file));
    } catch {
      continue; // vanished between listing and reading — next scan settles it
    }

    const hit = previous.files[file];
    if (hit && hit.size === size && hit.mtimeMs === mtimeMs) {
      byFile.set(file, hit.facts);
      next.files[file] = hit;
      continue;
    }

    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const { cwd, helperMentions } = parseTranscript(text);
    const facts: FileFacts = { lastActivityMs: mtimeMs, cwd, helperMentions };
    byFile.set(file, facts);
    next.files[file] = { size, mtimeMs, facts };
  }

  return { byFile, cache: next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/bridge/scan-cache.test.ts` — PASS.

- [ ] **Step 5: Commit and push**

```bash
git add packages/server/src/bridge/scan-cache.ts packages/server/src/bridge/scan-cache.test.ts
git commit -m "feat(server): a memory for transcripts already read - the per-file scan cache"
git push
```

---

### Task 6: Server — project discovery (worktree folding, zero-jsonl skip, newest cwd)

**Files:**
- Create: `packages/server/src/bridge/projects.ts`
- Modify: `packages/server/src/testing/sandbox.ts` (fake `~/.claude/projects` tree — spec §6)
- Test: `packages/server/src/bridge/projects.test.ts`

**Interfaces:**
- Consumes: `collectFacts`/`ScanCache` (Task 5), `VillagePaths` (Task 3).
- Produces (Tasks 8 and 10 consume):

```ts
const WORKTREE_RE: RegExp   // /^(.+)--claude-worktrees-.+$/
interface DiscoveredProject {
  id: string          // `project:<entry-name>` after folding
  entryName: string   // the folded parent entry name (appearance seed)
  displayName: string // basename of the newest cwd, else entryName
  sourcePath: string  // the newest cwd, '' if unknown
  lastWorkedAt: number
  helperMentions: string[]  // union across sessions, sorted, deduped
}
interface ProjectScan { projects: DiscoveredProject[]; cache: ScanCache }
async function discoverProjects(paths: VillagePaths, previous: ScanCache): Promise<ProjectScan>
```

- Sandbox grows: `writeTranscript(entry: string, session: string, lines: string[]): Promise<string>` and `makeSandbox` now also mkdirs `paths.claudeProjectsDir`.
- **Safety assertion:** `projects.ts` imports only `readdir` from `node:fs/promises` (facts reads go through Task 5's module). Read-only, reviewer-checked.

- [ ] **Step 1: Extend the sandbox**

In `packages/server/src/testing/sandbox.ts`: add to the `Sandbox` interface:

```ts
  /** Write a session transcript into the sandbox's ~/.claude/projects/<entry>/<session>.jsonl */
  writeTranscript(entry: string, session: string, lines: string[]): Promise<string>;
```

In `makeSandbox`, after the existing `mkdir` calls add `await mkdir(paths.claudeProjectsDir, { recursive: true });`, and in the returned object:

```ts
    async writeTranscript(entry, session, lines) {
      const dir = join(paths.claudeProjectsDir, entry);
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${session}.jsonl`);
      await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
      return file;
    },
```

Also export a transcript-line helper beside `skillFixture`/`agentFixture`:

```ts
/** A minimal valid transcript line: optional cwd, optional helper mentions. */
export function transcriptLine(opts: { cwd?: string; skill?: string; agent?: string } = {}): string {
  const content: unknown[] = [];
  if (opts.skill) content.push({ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: opts.skill } });
  if (opts.agent) content.push({ type: 'tool_use', id: 't2', name: 'Task', input: { subagent_type: opts.agent } });
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content },
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}
```

- [ ] **Step 2: Write the failing tests**

`packages/server/src/bridge/projects.test.ts`:

```ts
import { utimes } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSandbox, transcriptLine, type Sandbox } from '../testing/sandbox.js';
import { emptyScanCache } from './scan-cache.js';
import { discoverProjects, WORKTREE_RE } from './projects.js';

describe('discoverProjects', () => {
  let sandbox: Sandbox;
  beforeEach(async () => { sandbox = await makeSandbox(); });
  afterEach(async () => { await sandbox.cleanup(); });

  const discover = () => discoverProjects(sandbox.paths, emptyScanCache());

  it('one entry with sessions becomes one project', async () => {
    await sandbox.writeTranscript('C--Users-dev-proj-a', 's1', [
      transcriptLine({ cwd: 'C:\\Users\\dev\\proj-a', skill: 'brainstorming' }),
    ]);
    const { projects } = await discover();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: 'project:C--Users-dev-proj-a',
      entryName: 'C--Users-dev-proj-a',
      displayName: 'proj-a',
      sourcePath: 'C:\\Users\\dev\\proj-a',
      helperMentions: ['brainstorming'],
    });
    expect(projects[0]!.lastWorkedAt).toBeGreaterThan(0);
  });

  it('worktree entries fold into their parent (regex pinned from the spec)', async () => {
    expect(WORKTREE_RE.source).toBe('^(.+)--claude-worktrees-.+$');
    await sandbox.writeTranscript('proj-b', 's1', [transcriptLine({ skill: 'tdd' })]);
    const wt = await sandbox.writeTranscript('proj-b--claude-worktrees-feature-123abc', 's2', [
      transcriptLine({ skill: 'debugging' }),
    ]);
    await utimes(wt, new Date('2030-01-01'), new Date('2030-01-01'));
    const { projects } = await discover();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.id).toBe('project:proj-b');
    expect(projects[0]!.helperMentions).toEqual(['debugging', 'tdd']);
    expect(projects[0]!.lastWorkedAt).toBe(new Date('2030-01-01').getTime());
  });

  it('an orphan worktree folds into the synthesized parent name', async () => {
    await sandbox.writeTranscript('proj-c--claude-worktrees-solo-9f', 's1', [transcriptLine({})]);
    const { projects } = await discover();
    expect(projects.map((p) => p.id)).toEqual(['project:proj-c']);
  });

  it('an entry with zero .jsonl files is furniture, skipped', async () => {
    await sandbox.writeTranscript('proj-d', 's1', [transcriptLine({})]);
    // an entry directory with no sessions at all:
    const { mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(join(sandbox.paths.claudeProjectsDir, 'proj-empty'), { recursive: true });
    const { projects } = await discover();
    expect(projects.map((p) => p.id)).toEqual(['project:proj-d']);
  });

  it('the newest cwd wins across sessions; no cwd anywhere falls back to the entry name', async () => {
    const oldFile = await sandbox.writeTranscript('proj-e', 'old', [
      transcriptLine({ cwd: '/home/dev/old-place/proj-e' }),
    ]);
    await utimes(oldFile, new Date('2020-01-01'), new Date('2020-01-01'));
    await sandbox.writeTranscript('proj-e', 'new', [
      transcriptLine({ cwd: '/home/dev/new-place/proj-e-renamed' }),
    ]);
    await sandbox.writeTranscript('proj-f', 's1', [transcriptLine({})]);
    const { projects } = await discover();
    const e = projects.find((p) => p.id === 'project:proj-e')!;
    expect(e.sourcePath).toBe('/home/dev/new-place/proj-e-renamed');
    expect(e.displayName).toBe('proj-e-renamed');
    const f = projects.find((p) => p.id === 'project:proj-f')!;
    expect(f.sourcePath).toBe('');
    expect(f.displayName).toBe('proj-f');
  });

  it('display name splits Windows paths too, on any host platform', async () => {
    await sandbox.writeTranscript('proj-g', 's1', [
      transcriptLine({ cwd: 'C:\\Users\\dev\\Projects\\proj-g' }),
    ]);
    const { projects } = await discover();
    expect(projects[0]!.displayName).toBe('proj-g');
  });

  it('a machine with no ~/.claude/projects is an empty village, not an error', async () => {
    const { rm } = await import('node:fs/promises');
    await rm(sandbox.paths.claudeProjectsDir, { recursive: true, force: true });
    const { projects } = await discover();
    expect(projects).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/bridge/projects.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

`packages/server/src/bridge/projects.ts`:

```ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { VillagePaths } from '../config/paths.js';
import { collectFacts, type ScanCache } from './scan-cache.js';

/**
 * A worktree checkout's entry folds into its parent project (remap spec §2).
 * Verified on disk 2026-08-23; an orphan worktree (parent never opened
 * directly) still folds into the synthesized parent name.
 */
export const WORKTREE_RE = /^(.+)--claude-worktrees-.+$/;

export interface DiscoveredProject {
  /** `project:<entry-name>`, the folded parent entry. */
  id: string;
  /** The folded parent entry name. Stable — seeds the appearance. */
  entryName: string;
  /** Basename of the newest cwd, or the encoded entry name — ugly but true. */
  displayName: string;
  /** The project's real folder from transcript cwd, '' if unknown. Never written. */
  sourcePath: string;
  /** Newest transcript mtime across the project's sessions, worktrees folded in. */
  lastWorkedAt: number;
  /** Union of helper mentions across sessions. Sorted, deduped. */
  helperMentions: string[];
}

export interface ProjectScan {
  projects: DiscoveredProject[];
  cache: ScanCache;
}

/** Missing reads as empty — a fresh machine is not an error. */
async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * The last path segment, splitting on both separators. Transcript cwds carry
 * the writing machine's own path style; node's path.basename only splits the
 * host platform's, which would leave a Windows cwd whole on the Linux droplet.
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
}

/**
 * Read-only discovery over `~/.claude/projects` (remap spec §2): entry names
 * are the source of truth, worktrees fold into their parents, and an entry
 * with no sessions is skipped — a villager that can never change state is
 * furniture.
 */
export async function discoverProjects(
  paths: VillagePaths,
  previous: ScanCache,
): Promise<ProjectScan> {
  // Group entry directories under their folded parent name.
  const groups = new Map<string, string[]>();
  for (const entry of await listDir(paths.claudeProjectsDir)) {
    if (!entry.isDirectory()) continue;
    const parent = WORKTREE_RE.exec(entry.name)?.[1] ?? entry.name;
    groups.set(parent, [...(groups.get(parent) ?? []), entry.name]);
  }

  // Session transcripts live at the entry's top level; session sub-folders
  // (tool-results and friends) are not transcripts and are not descended into.
  const filesByGroup = new Map<string, string[]>();
  const allFiles: string[] = [];
  for (const [parent, entries] of groups) {
    const files: string[] = [];
    for (const name of entries) {
      const dir = join(paths.claudeProjectsDir, name);
      for (const f of await listDir(dir)) {
        if (f.isFile() && f.name.endsWith('.jsonl')) files.push(join(dir, f.name));
      }
    }
    if (files.length === 0) continue; // zero sessions: skipped (spec §2)
    filesByGroup.set(parent, files);
    allFiles.push(...files);
  }

  const { byFile, cache } = await collectFacts(allFiles, previous);

  const projects: DiscoveredProject[] = [];
  for (const [parent, files] of filesByGroup) {
    let lastWorkedAt = 0;
    let cwd: string | null = null;
    let cwdAt = -1;
    const mentions = new Set<string>();
    for (const file of files) {
      const facts = byFile.get(file);
      if (!facts) continue; // vanished mid-scan
      lastWorkedAt = Math.max(lastWorkedAt, facts.lastActivityMs);
      if (facts.cwd !== null && facts.lastActivityMs > cwdAt) {
        cwd = facts.cwd;
        cwdAt = facts.lastActivityMs;
      }
      for (const m of facts.helperMentions) mentions.add(m);
    }
    if (lastWorkedAt === 0) continue; // every session vanished mid-scan

    projects.push({
      id: `project:${parent}`,
      entryName: parent,
      displayName: cwd ? lastSegment(cwd) : parent,
      sourcePath: cwd ?? '',
      lastWorkedAt,
      helperMentions: [...mentions].sort(),
    });
  }

  projects.sort((a, b) => a.id.localeCompare(b.id));
  return { projects, cache };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/bridge/projects.test.ts` — PASS.
Also run: `npx vitest run packages/server/src` — the sandbox change must not break existing suites.

- [ ] **Step 6: Commit and push**

```bash
git add packages/server/src/bridge/projects.ts packages/server/src/bridge/projects.test.ts packages/server/src/testing/sandbox.ts
git commit -m "feat(server): the census - projects discovered read-only, worktrees folded home"
git push
```

---

### Task 7: Server — project stats derive from the work signal at tick time

**Files:**
- Modify: `packages/server/src/sim/tick.ts`
- Test: `packages/server/src/sim/tick.test.ts`

**Interfaces:**
- Consumes: `role`, `workStats` from `@village/core` (Tasks 1–2).
- Produces: no signature change — `applyTick(state, now)` now treats project creatures specially. Bond and xp stay untouched either way.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/sim/tick.test.ts` (reuse its existing state/creature factory helpers; if it builds creatures inline, mirror that shape and add `kind: 'project'`, `lastWorkedAt`):

```ts
import { generateAppearance, STAT_FLOOR, workStats, type Creature, type Stats } from '@village/core';
import { emptyState } from '../state/schema.js';

describe('projects: only real work heals', () => {
  const DAY = 86_400_000;

  const projectCreature = (id: string, stats: Stats, over: Partial<Creature> = {}): Creature => ({
    id,
    kind: 'project',
    name: id.slice('project:'.length),
    nickname: '',
    appearance: generateAppearance({ kind: 'project', name: id }),
    stats,
    stage: 'adult',
    personality: null,
    sourcePath: '',
    friendships: {},
    lastSeenAt: 0,
    ...over,
  });

  const stateWith = (c: Creature) => ({ ...emptyState(0), creatures: { [c.id]: c } });

  it('mood/energy come from lastWorkedAt, not from lastSeenAt decay', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:p', { mood: 99, energy: 99, bond: 40, xp: 7 }, {
      lastWorkedAt: now - 12 * DAY,
      lastSeenAt: now, // freshly petted — must not matter
    });
    const { state: next } = applyTick(stateWith(project), now);
    const ticked = next.creatures['project:p']!;
    expect(ticked.stats.mood).toBeCloseTo(workStats(12 * DAY).mood, 5);
    expect(ticked.stats.energy).toBeCloseTo(workStats(12 * DAY).energy, 5);
    // care builds bond only (spec §5): bond and xp ride through untouched
    expect(ticked.stats.bond).toBe(40);
    expect(ticked.stats.xp).toBe(7);
  });

  it('a freshly worked project is thriving whatever its stored stats say', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:q', { mood: 5, energy: 5, bond: 0, xp: 0 }, {
      lastWorkedAt: now - 3_600_000,
    });
    const { state: next } = applyTick(stateWith(project), now);
    expect(next.creatures['project:q']!.stats.mood).toBe(85);
  });

  it('a project with no lastWorkedAt falls back to ordinary decay', () => {
    const now = 100 * DAY;
    const project = projectCreature('project:r', { mood: 90, energy: 90, bond: 0, xp: 0 }, {
      lastSeenAt: now - 24 * 3_600_000,
    });
    const { state: next } = applyTick(stateWith(project), now);
    expect(next.creatures['project:r']!.stats.mood).toBeLessThan(90);
    expect(next.creatures['project:r']!.stats.mood).toBeGreaterThanOrEqual(STAT_FLOOR);
  });
});
```

(If this file already has a creature/state factory, extend it instead of adding a second one — the assertions above are the contract, not the helper names.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/sim/tick.test.ts`
Expected: FAIL — project mood still comes from `decayStats`.

- [ ] **Step 3: Implement**

In `packages/server/src/sim/tick.ts`, change the import and the stats line:

```ts
import { decayStats, levelForXp, nextStage, role, workStats, type Creature } from '@village/core';
```

Inside the loop, replace `const stats = hoursAway > 0 ? decayStats(...) : creature.stats;` with:

```ts
    // Projects: only real work heals (remap spec §5). Mood and energy are a
    // pure function of the work signal, recomputed every tick — the stored
    // values are a cache of the curve, so retuning it needs no migration.
    // Bond and xp still only ever rise, same as everyone else's.
    const stats =
      role(creature.kind) === 'project' && creature.lastWorkedAt !== undefined
        ? { ...creature.stats, ...workStats(now - creature.lastWorkedAt) }
        : hoursAway > 0
          ? decayStats(creature.stats, hoursAway)
          : creature.stats;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/sim/tick.test.ts` — PASS.

- [ ] **Step 5: Commit and push**

```bash
git add packages/server/src/sim/tick.ts packages/server/src/sim/tick.test.ts
git commit -m "feat(server): a project's health is its work, recomputed every tick"
git push
```

---

### Task 8: Server — reconcile safety, name resolution, and the project fold

**Files:**
- Modify: `packages/server/src/bridge/reconcile.ts`
- Modify: `packages/server/src/bridge/creature.ts`
- Test: `packages/server/src/bridge/reconcile.test.ts`, `packages/server/src/bridge/creature.test.ts`

**Interfaces:**
- Consumes: `DiscoveredProject` (Task 6), `role` and the new `Creature` fields (Task 1), `generateAppearance`, `STARTING_STATS`.
- Produces:
  - `creatureFromProject(found: DiscoveredProject, now: number): Creature` in `creature.ts`.
  - `linkHelpers(mentions: readonly string[], creatures: Record<string, Creature>): { helperIds: string[]; unresolved: string[] }` in `reconcile.ts`.
  - `reconcileProjects(state: VillageState, projects: readonly DiscoveredProject[], now: number): { state: VillageState; events: VillageEvent[] }` in `reconcile.ts` — **never releases anything**.
  - The existing `reconcile` (helper scan) now **carries project creatures through untouched** instead of auto-releasing them.

- [ ] **Step 1: Write the failing tests**

**(a)** Append to `packages/server/src/bridge/reconcile.test.ts` — the critical safety test first:

```ts
import { generateAppearance, type Creature } from '@village/core';
import { emptyState } from '../state/schema.js';
import { creatureFromProject } from './creature.js';
import { linkHelpers, reconcileProjects } from './reconcile.js';
import type { DiscoveredProject } from './projects.js';

const project = (over: Partial<DiscoveredProject> = {}): DiscoveredProject => ({
  id: 'project:C--dev-proj-a',
  entryName: 'C--dev-proj-a',
  displayName: 'proj-a',
  sourcePath: '/home/dev/proj-a',
  lastWorkedAt: 1000,
  helperMentions: [],
  ...over,
});

const anyCreature = (id: string, kind: 'skill' | 'agent'): Creature => ({
  id,
  kind,
  name: id.slice(id.indexOf(':') + 1),
  nickname: '',
  appearance: generateAppearance({ kind, name: id.slice(id.indexOf(':') + 1) }),
  stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
  stage: 'adult',
  personality: null,
  sourcePath: `/x/${id}`,
  friendships: {},
  lastSeenAt: 0,
});

const stateWithCreature = (c: Creature) => ({ ...emptyState(0), creatures: { [c.id]: c } });

describe('reconcile leaves projects alone', () => {
  it('a helper scan that finds nothing must NOT auto-release project creatures', () => {
    // Without this guard, the first refresh() after a project moves in would
    // evict every project — the helper scan knows nothing about them.
    const resident = creatureFromProject(project(), 100);
    const result = reconcile(stateWithCreature(resident), { creatures: [], problems: [] }, 2000);
    expect(result.released).toEqual([]);
    expect(result.state.creatures[resident.id]).toBeDefined();
    expect(result.events.filter((e) => e.type === 'auto-released')).toEqual([]);
  });
});

describe('linkHelpers — the §3 resolution table', () => {
  const roster = {
    'skill:brainstorming': anyCreature('skill:brainstorming', 'skill'),
    'agent:code-reviewer': anyCreature('agent:code-reviewer', 'agent'),
  };
  it('resolves only mentions with a creature on disk; the rest are tallied, never lost', () => {
    const { helperIds, unresolved } = linkHelpers(
      ['brainstorming', 'anthropic-skills:xlsx', 'claude-api', 'general-purpose', 'code-reviewer'],
      roster,
    );
    expect(helperIds).toEqual(['agent:code-reviewer', 'skill:brainstorming']);
    expect(unresolved).toEqual(['anthropic-skills:xlsx', 'claude-api', 'general-purpose']);
  });
  it('a name that is both a skill and an agent links both', () => {
    const both = { ...roster, 'agent:brainstorming': anyCreature('agent:brainstorming', 'agent') };
    expect(linkHelpers(['brainstorming'], both).helperIds).toEqual([
      'agent:brainstorming', 'skill:brainstorming',
    ]);
  });
});

describe('reconcileProjects', () => {
  it('a new project moves in with resolved links and the unresolved tally', () => {
    const state = stateWithCreature(anyCreature('skill:brainstorming', 'skill'));
    const result = reconcileProjects(state, [project({ helperMentions: ['brainstorming', 'general-purpose'] })], 2000);
    const c = result.state.creatures['project:C--dev-proj-a']!;
    expect(c.kind).toBe('project');
    expect(c.name).toBe('proj-a');
    expect(c.helperIds).toEqual(['skill:brainstorming']);
    expect(c.unresolvedMentions).toEqual(['general-purpose']);
    expect(c.friendships).toEqual({});
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'moved-in', creatureId: 'project:C--dev-proj-a' }),
    );
  });

  it('the identity rule: an existing project keeps stats, bond, nickname; only the signal refreshes', () => {
    const seed = creatureFromProject(project({ lastWorkedAt: 500 }), 100);
    const existing = { ...seed, nickname: 'Bramble', stats: { ...seed.stats, bond: 40 } };
    const result = reconcileProjects(stateWithCreature(existing), [project({ lastWorkedAt: 9000 })], 2000);
    const c = result.state.creatures[existing.id]!;
    expect(c.stats.bond).toBe(40);
    expect(c.nickname).toBe('Bramble');
    expect(c.lastWorkedAt).toBe(9000);
  });

  it('a retired project is never resurrected — discovery skips it whole', () => {
    const retired = { ...creatureFromProject(project({ lastWorkedAt: 500 }), 100), retired: true };
    const result = reconcileProjects(stateWithCreature(retired), [project({ lastWorkedAt: 9000 })], 2000);
    expect(result.state.creatures[retired.id]!.lastWorkedAt).toBe(500);
    expect(result.events).toEqual([]);
  });

  it('a project missing from the scan is kept, frozen — transcripts expire, villagers do not', () => {
    const existing = creatureFromProject(project(), 100);
    const result = reconcileProjects(stateWithCreature(existing), [], 2000);
    expect(result.state.creatures[existing.id]).toEqual(existing);
  });

  it('helpers in state are untouched by the project fold', () => {
    const helper = anyCreature('skill:brainstorming', 'skill');
    const result = reconcileProjects(stateWithCreature(helper), [project()], 2000);
    expect(result.state.creatures['skill:brainstorming']).toEqual(helper);
  });
});
```

(If this file already builds creatures/states with its own helpers, extend those instead of duplicating — the assertions are the contract, not the helper names.)

**(b)** Append to `packages/server/src/bridge/creature.test.ts`:

```ts
import { creatureFromProject } from './creature.js';

describe('creatureFromProject', () => {
  const found = {
    id: 'project:C--dev-proj-a', entryName: 'C--dev-proj-a', displayName: 'proj-a',
    sourcePath: '/home/dev/proj-a', lastWorkedAt: 1234, helperMentions: ['brainstorming'],
  };
  it('is born an adult project with the starting stats and empty links', () => {
    const c = creatureFromProject(found, 99);
    expect(c.id).toBe('project:C--dev-proj-a');
    expect(c.kind).toBe('project');
    expect(c.name).toBe('proj-a');
    expect(c.stage).toBe('adult');
    expect(c.lastWorkedAt).toBe(1234);
    expect(c.helperIds).toEqual([]);
    expect(c.friendships).toEqual({});
    expect(c.appearance.winged).toBe(false);
  });
  it('appearance is seeded from the immutable entry name, not the display name', () => {
    const renamed = creatureFromProject({ ...found, displayName: 'totally-else' }, 99);
    expect(renamed.appearance).toEqual(creatureFromProject(found, 99).appearance);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/bridge/reconcile.test.ts packages/server/src/bridge/creature.test.ts`
Expected: FAIL — `linkHelpers`, `reconcileProjects`, `creatureFromProject` do not exist; the safety test fails because `reconcile` releases the project.

- [ ] **Step 3: Implement**

**(a)** `packages/server/src/bridge/creature.ts` — add:

```ts
import type { DiscoveredProject } from './projects.js';

/**
 * A discovered project moves in as an adult, like every creature whose real
 * thing already exists. Links start empty — reconcileProjects resolves them
 * against the roster it has in hand.
 */
export function creatureFromProject(found: DiscoveredProject, now: number): Creature {
  return {
    id: found.id,
    kind: 'project',
    name: found.displayName,
    nickname: '',
    // Seeded from the immutable entry name, not the display name: a project
    // folder renamed on disk keeps its body.
    appearance: generateAppearance({ kind: 'project', name: found.entryName }),
    stats: { ...STARTING_STATS },
    stage: 'adult',
    personality: null,
    sourcePath: found.sourcePath,
    friendships: {},
    lastSeenAt: now,
    lastWorkedAt: found.lastWorkedAt,
    helperIds: [],
    unresolvedMentions: [],
  };
}
```

**(b)** `packages/server/src/bridge/reconcile.ts` — two changes.

First, the safety guard in the existing `reconcile`'s released-loop:

```ts
  for (const [id, creature] of Object.entries(state.creatures)) {
    if (creatures[id]) continue;
    // The helper scan says nothing about projects — they are discovered from
    // ~/.claude/projects, not from skill/agent files, and reconcileProjects
    // owns their fate. Without this, the first refresh after a project moved
    // in would auto-release every project in the village.
    if (role(creature.kind) === 'project') {
      creatures[id] = creature;
      continue;
    }
    released.push(creature);
    ...
```

(add `role` to the `@village/core` import.)

Second, append the project fold:

```ts
import type { DiscoveredProject } from './projects.js';
import { creatureFromProject } from './creature.js';

/**
 * A mention becomes a helper *link* only if it matches a helper creature
 * already loaded (remap spec §3) — by name for skills, by name for agents.
 * Everything else still counts as project activity but links nothing; the
 * unresolved names are kept so the number is never silently lost.
 */
export function linkHelpers(
  mentions: readonly string[],
  creatures: Record<string, Creature>,
): { helperIds: string[]; unresolved: string[] } {
  const helperIds = new Set<string>();
  const unresolved = new Set<string>();
  for (const mention of mentions) {
    let hit = false;
    for (const id of [`skill:${mention}`, `agent:${mention}`]) {
      if (creatures[id]) {
        helperIds.add(id);
        hit = true;
      }
    }
    if (!hit) unresolved.add(mention);
  }
  return { helperIds: [...helperIds].sort(), unresolved: [...unresolved].sort() };
}

/**
 * Fold a project discovery into the stored village. Pure, like reconcile.
 *
 * Deliberately gentler than the helper reconcile: it NEVER releases. Claude
 * Code expires old transcripts, so a project vanishing from the scan means
 * its diary faded, not that the project died — the creature stays, frozen,
 * and droops on the work curve. Retired projects (M6) are skipped whole:
 * discovery must not resurrect them (remap spec §2).
 */
export function reconcileProjects(
  state: VillageState,
  projects: readonly DiscoveredProject[],
  now: number,
): { state: VillageState; events: VillageEvent[] } {
  const events: VillageEvent[] = [];
  const creatures = { ...state.creatures };

  for (const found of projects) {
    const links = linkHelpers(found.helperMentions, state.creatures);
    const existing = creatures[found.id];

    if (!existing) {
      creatures[found.id] = {
        ...creatureFromProject(found, now),
        helperIds: links.helperIds,
        unresolvedMentions: links.unresolved,
      };
      events.push({ at: now, type: 'moved-in', creatureId: found.id });
      continue;
    }

    if (existing.retired) continue;

    if (existing.sourcePath !== found.sourcePath) {
      events.push({
        at: now,
        type: 'resynced',
        creatureId: found.id,
        detail: `Source moved to ${found.sourcePath}`,
      });
    }
    // The identity rule again: stats, bond, nickname, persona and appearance
    // survive; only the pointer and the work signal refresh.
    creatures[found.id] = {
      ...existing,
      name: found.displayName,
      sourcePath: found.sourcePath,
      lastWorkedAt: found.lastWorkedAt,
      helperIds: links.helperIds,
      unresolvedMentions: links.unresolved,
    };
  }

  return { state: { ...state, creatures, updatedAt: now }, events };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/bridge` — PASS (including the pre-existing reconcile suite).

- [ ] **Step 5: Commit and push**

```bash
git add packages/server/src/bridge/reconcile.ts packages/server/src/bridge/reconcile.test.ts packages/server/src/bridge/creature.ts packages/server/src/bridge/creature.test.ts
git commit -m "feat(server): projects fold into the village gently - linked, tallied, never evicted"
git push
```

---

### Task 9: Server — `village.scanProjects()`, boot, and the 5-minute loop

**Files:**
- Modify: `packages/server/src/village.ts`
- Modify: `packages/server/src/main.ts`
- Test: `packages/server/src/village.test.ts`

**Interfaces:**
- Consumes: `discoverProjects` (Task 6), `loadScanCache`/`saveScanCache` (Task 5), `reconcileProjects` (Task 8).
- Produces: `Village.scanProjects(): Promise<void>` — quiet no-op on a snapshot (unlike `refresh()`, which throws: refresh is called by a user-facing route, the scan by a background loop). `createVillage` runs it once at boot, after `refresh()`. `main.ts` re-runs it every 5 minutes.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/village.test.ts` (reuse its sandbox + `createVillage` patterns; it already builds villages with `now` injected):

```ts
import { transcriptLine } from './testing/sandbox.js';

describe('scanProjects', () => {
  it('boot discovers projects alongside helpers', async () => {
    await sandbox.writeSkill('brainstorming', skillFixture('brainstorming'));
    await sandbox.writeTranscript('C--dev-proj-a', 's1', [
      transcriptLine({ cwd: '/dev/proj-a', skill: 'brainstorming' }),
    ]);
    const village = await createVillage({ paths: sandbox.paths, now: () => 5000 });
    const creatures = village.getState().creatures;
    expect(creatures['project:C--dev-proj-a']).toMatchObject({
      kind: 'project',
      name: 'proj-a',
      helperIds: ['skill:brainstorming'],
    });
    await village.close();
  });

  it('a later scan refreshes the signal without touching identity', async () => {
    await sandbox.writeTranscript('C--dev-proj-b', 's1', [transcriptLine({ cwd: '/dev/proj-b' })]);
    const village = await createVillage({ paths: sandbox.paths, now: () => 5000 });
    const before = village.getState().creatures['project:C--dev-proj-b']!;
    await sandbox.writeTranscript('C--dev-proj-b', 's2', [transcriptLine({ cwd: '/dev/proj-b' })]);
    await village.scanProjects();
    const after = village.getState().creatures['project:C--dev-proj-b']!;
    expect(after.lastWorkedAt).toBeGreaterThanOrEqual(before.lastWorkedAt!);
    expect(after.appearance).toEqual(before.appearance);
    await village.close();
  });

  it('writes and reuses the scan cache file', async () => {
    await sandbox.writeTranscript('C--dev-proj-c', 's1', [transcriptLine({})]);
    const village = await createVillage({ paths: sandbox.paths, now: () => 5000 });
    const { readFile } = await import('node:fs/promises');
    const cache = JSON.parse(await readFile(sandbox.paths.scanCachePath, 'utf8'));
    expect(Object.keys(cache.files)).toHaveLength(1);
    await village.close();
  });

  it('a snapshot village never scans — quiet no-op, state untouched', async () => {
    const village = await createVillage({ paths: sandbox.paths, now: () => 5000, snapshot: true });
    const before = village.getState();
    await expect(village.scanProjects()).resolves.toBeUndefined();
    expect(village.getState()).toBe(before);
    await village.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: FAIL — `scanProjects` does not exist.

- [ ] **Step 3: Implement**

In `packages/server/src/village.ts`:

Imports:

```ts
import { discoverProjects } from './bridge/projects.js';
import { loadScanCache, saveScanCache } from './bridge/scan-cache.js';
import { reconcile, reconcileProjects } from './bridge/reconcile.js';
```

`Village` interface, after `refresh()`:

```ts
  /**
   * Rescan Claude Code's session logs (read-only) and fold project life in:
   * work recency, helper links, new arrivals. Quiet no-op on a snapshot —
   * unlike refresh(), nothing user-facing awaits an error from the 5-minute
   * background loop.
   */
  scanProjects(): Promise<void>;
```

Implementation, after `refresh`:

```ts
  const scanProjects = async () => {
    if (snapshot) return;
    const previous = await loadScanCache(paths);
    const scan = await discoverProjects(paths, previous);
    // Same shape as refresh(): all reads finish first, then reconcile against
    // the live `state` with nothing awaited in between, so a chat or ledger
    // spend that committed during the scan is never reverted.
    const at = now();
    const result = reconcileProjects(state, scan.projects, at);
    await commit(result.state, result.events);
    await saveScanCache(paths, scan.cache);
  };
```

Boot line — replace `if (!snapshot) await refresh();` with:

```ts
  if (!snapshot) {
    await refresh();
    await scanProjects();
  }
```

Return object: add `scanProjects,` beside `refresh,`.

In `packages/server/src/main.ts`, after the tick timer block:

```ts
  // The work signal: boot + every 5 minutes (remap spec §3). Its own timer,
  // not a tick multiple — the tick interval changes when a client attaches.
  const PROJECT_SCAN_MS = 300_000;
  const scanTimer = setInterval(() => {
    void village.scanProjects().catch((error) => console.error('Project scan failed:', error));
  }, PROJECT_SCAN_MS);
```

And in `shutdown`, beside `clearInterval(timer);`:

```ts
    clearInterval(scanTimer);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/village.test.ts` — PASS.
Run: `npx vitest run packages/server` — the whole server suite stays green (existing `createVillage` tests now also run a project scan against sandboxes with an empty `claudeProjectsDir`; that must be a no-op).

- [ ] **Step 5: Commit and push**

```bash
git add packages/server/src/village.ts packages/server/src/main.ts packages/server/src/village.test.ts
git commit -m "feat(server): the village checks the diaries every five minutes"
git push
```

---

### Task 10: Web — the protocol and the labels let projects through

**Files:**
- Modify: `packages/web/src/net/protocol.ts`
- Modify: `packages/web/src/render/label.ts`
- Test: `packages/web/src/net/protocol.test.ts`, `packages/web/src/render/label.test.ts`

**Interfaces:**
- Produces: `filterRenderable`/`toView` accept `kind: 'project'`; `fileLabel` renders a project as `name/`. No other shape changes — new creature fields ride through `toView` untouched because it never strips fields.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/net/protocol.test.ts` (reuse its existing valid-creature fixture, overriding `kind` and `id`):

```ts
it('projects are renderable villagers', () => {
  const project = { ...validCreature(), id: 'project:proj-a', kind: 'project', helperIds: ['skill:x'] };
  const view = toView({ creatures: { [project.id]: project }, problems: [] });
  expect(view!.creatures).toHaveLength(1);
  expect(view!.creatures[0]!.kind).toBe('project');
  expect(view!.creatures[0]!.helperIds).toEqual(['skill:x']); // fields ride through
});
```

Append to `packages/web/src/render/label.test.ts`:

```ts
it('a project labels as its folder', () => {
  const project = { ...baseCreature(), kind: 'project' as const, name: 'proj-a' };
  expect(fileLabel(project)).toBe('proj-a/');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/net/protocol.test.ts packages/web/src/render/label.test.ts`
Expected: FAIL — `'project'` kind is filtered out; label falls into the `.md` branch.

- [ ] **Step 3: Implement**

`protocol.ts`, in `isRenderable`:

```ts
    (c.kind === 'skill' || c.kind === 'agent' || c.kind === 'project') &&
```

`label.ts`, in `fileLabel`:

```ts
export function fileLabel(creature: Creature): string {
  // Skills and projects are folders and end in `/`; agents are files and end
  // in `.md` — a glance still tells the species apart (spec §4).
  if (creature.kind === 'skill' || creature.kind === 'project') return `${creature.name}/`;
  return creature.name.endsWith('.md') ? creature.name : `${creature.name}.md`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/net/protocol.test.ts packages/web/src/render/label.test.ts` — PASS.

- [ ] **Step 5: Commit and push**

```bash
git add packages/web/src/net/protocol.ts packages/web/src/net/protocol.test.ts packages/web/src/render/label.ts packages/web/src/render/label.test.ts
git commit -m "feat(web): the gate learns the third kind"
git push
```

---

### Task 11: Web — the render list: commons, tethered instances, presence

**Files:**
- Create: `packages/web/src/layout/instances.ts`
- Modify: `packages/web/src/layout/zones.ts` (one line: `export { hash as layoutHash };` at the bottom — the FNV hash the whole layout already uses)
- Test: `packages/web/src/layout/instances.test.ts`

**Interfaces:**
- Consumes: `placeCreatures`, `HOMES_LO`, `HOMES_HI`, `Spot`, `layoutHash` from `./zones.js`; `Creature` from `@village/core/visual`.
- Produces (Task 13 consumes all of these — exact names matter):

```ts
interface RenderEntry { key: string; creature: Creature; spot: Spot; presence: number }
function presenceScale(helperCount: number): number          // 1 + 0.06n, capped at 1.3
const TETHER = 96                                            // px, spec §4's tether radius
function instanceKey(projectId: string, helperId: string): string   // `${projectId}>${helperId}`
function keyCreatureId(key: string): string                  // helper id inside an instance key, else the key
function instanceSpots(projectId: string, anchor: Spot, helperIds: readonly string[]): Map<string, Spot>
function buildRenderList(creatures: readonly Creature[]): RenderEntry[]
```

`'>'` as the key separator is safe: it cannot appear in a Windows file name, and creature ids are built from on-disk names.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/layout/instances.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Creature } from '@village/core/visual';
import { HOMES_LO, HOMES_HI } from './zones.js';
import {
  buildRenderList, instanceKey, instanceSpots, keyCreatureId, presenceScale, TETHER,
} from './instances.js';

const creature = (id: string, kind: Creature['kind'], over: Partial<Creature> = {}): Creature => ({
  id, kind, name: id.split(':')[1]!, nickname: '',
  appearance: {
    body: 'pip', crown: 'none', winged: kind === 'agent',
    palette: { hue: '#888888', lite: '#aaaaaa', dark: '#666666' }, restPosture: null,
  },
  stats: { mood: 70, energy: 70, bond: 0, xp: 0 },
  stage: 'adult', personality: null, sourcePath: '', friendships: {}, lastSeenAt: 0,
  ...over,
});

describe('presenceScale', () => {
  it('grows mildly with helpers and caps', () => {
    expect(presenceScale(0)).toBe(1);
    expect(presenceScale(2)).toBeCloseTo(1.12, 10);
    expect(presenceScale(50)).toBe(1.3);
  });
});

describe('keys', () => {
  it('round-trip: an instance key names its helper; a villager key names itself', () => {
    expect(keyCreatureId(instanceKey('project:p', 'skill:s'))).toBe('skill:s');
    expect(keyCreatureId('skill:s')).toBe('skill:s');
    expect(keyCreatureId('project:p')).toBe('project:p');
  });
});

describe('instanceSpots', () => {
  const anchor = { x: 2000, y: 700, wander: 30 };
  it('tethers every instance to the anchor, same depth row, short leash', () => {
    const spots = instanceSpots('project:p', anchor, ['skill:a', 'agent:b', 'skill:c']);
    expect(spots.size).toBe(3);
    for (const spot of spots.values()) {
      expect(Math.abs(spot.x - anchor.x)).toBeLessThanOrEqual(TETHER);
      expect(spot.y).toBe(anchor.y);
      expect(spot.wander).toBeGreaterThan(0);
      expect(spot.wander).toBeLessThan(30);
    }
  });
  it('is deterministic and clamps to the seatable stretch of Homes', () => {
    const a = instanceSpots('project:p', anchor, ['skill:a']);
    const b = instanceSpots('project:p', anchor, ['skill:a']);
    expect(a).toEqual(b);
    const edge = instanceSpots('project:p', { x: HOMES_LO, y: 700, wander: 0 }, ['skill:a', 'skill:b']);
    for (const spot of edge.values()) {
      expect(spot.x).toBeGreaterThanOrEqual(HOMES_LO);
      expect(spot.x).toBeLessThanOrEqual(HOMES_HI);
    }
  });
});

describe('buildRenderList', () => {
  const project = creature('project:p', 'project', { helperIds: ['skill:linked'] });
  const linked = creature('skill:linked', 'skill');
  const loner = creature('skill:loner', 'skill');

  it('projects and unlinked helpers are villagers; linked helpers appear only beside their projects', () => {
    const entries = buildRenderList([project, linked, loner]);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain('project:p');
    expect(keys).toContain('skill:loner');
    expect(keys).not.toContain('skill:linked'); // no commons entry — it left for the aura
    expect(keys).toContain(instanceKey('project:p', 'skill:linked'));
  });

  it('the instance rides within the tether of its project and carries the helper creature', () => {
    const entries = buildRenderList([project, linked, loner]);
    const anchor = entries.find((e) => e.key === 'project:p')!;
    const inst = entries.find((e) => e.key === instanceKey('project:p', 'skill:linked'))!;
    expect(Math.abs(inst.spot.x - anchor.spot.x)).toBeLessThanOrEqual(TETHER);
    expect(inst.creature).toBe(linked);
  });

  it('one helper, many projects: one creature, many render instances (spec §4)', () => {
    const p2 = creature('project:q', 'project', { helperIds: ['skill:linked'] });
    const entries = buildRenderList([project, p2, linked]);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain(instanceKey('project:p', 'skill:linked'));
    expect(keys).toContain(instanceKey('project:q', 'skill:linked'));
  });

  it('a project wears its presence; everyone else wears 1', () => {
    const entries = buildRenderList([project, linked, loner]);
    expect(entries.find((e) => e.key === 'project:p')!.presence).toBeCloseTo(1.06, 10);
    expect(entries.find((e) => e.key === 'skill:loner')!.presence).toBe(1);
  });

  it('a helperId with no creature in view links nothing and crashes nothing', () => {
    const ghostly = creature('project:g', 'project', { helperIds: ['skill:gone'] });
    const entries = buildRenderList([ghostly]);
    expect(entries.map((e) => e.key)).toEqual(['project:g']);
    expect(entries[0]!.presence).toBeCloseTo(1.06, 10); // count is helperIds' length — links it *claims*
  });

  it('with no projects at all, today\'s village is exactly reproduced', () => {
    const entries = buildRenderList([linked, loner]);
    expect(entries.map((e) => e.key).sort()).toEqual(['skill:linked', 'skill:loner']);
    expect(entries.every((e) => e.presence === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/layout/instances.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Add to the bottom of `packages/web/src/layout/zones.ts`:

```ts
/** The layout's FNV hash, shared so instances.ts fans out on the same draws. */
export { hash as layoutHash };
```

`packages/web/src/layout/instances.ts`:

```ts
import type { Creature } from '@village/core/visual';
import { HOMES_HI, HOMES_LO, layoutHash, placeCreatures, type Spot } from './zones.js';

/**
 * One thing to draw: a villager (a project, or a helper with no links — the
 * commons), or a helper *instance* standing beside one project that uses it.
 * One creature, many render instances (remap spec §4): the creature keeps one
 * persona, one stats block, one panel; only the bodies multiply.
 */
export interface RenderEntry {
  /** The creature id for a villager; `<projectId>><helperId>` for an instance. */
  key: string;
  creature: Creature;
  spot: Spot;
  /** Body scale multiplier — the genie framing. 1 for everything but projects. */
  presence: number;
}

/** Mild and capped: a ten-helper project is a big genie, not a kaiju. */
export function presenceScale(helperCount: number): number {
  return Math.min(1.3, 1 + 0.06 * helperCount);
}

/** How far an instance may stand from its project's anchor (spec §4's tether). */
export const TETHER = 96;
/** The fan: nearest ring, step per pair, and the short leash instances amble on. */
const FAN_START = 40;
const FAN_STEP = 34;
const INSTANCE_LEASH = 18;

/** `>` cannot appear in a Windows file name, so no creature id contains it. */
export function instanceKey(projectId: string, helperId: string): string {
  return `${projectId}>${helperId}`;
}

/** The creature a render key belongs to: the helper inside an instance key, else itself. */
export function keyCreatureId(key: string): string {
  const cut = key.indexOf('>');
  return cut === -1 ? key : key.slice(cut + 1);
}

/**
 * Deterministic fan around a project's anchor: sides alternate, rings step
 * outward, and a per-key jitter keeps two projects' auras from being
 * congruent. Same depth row as the project, so feet stay on believable
 * ground; no keep-out or spacing pass — a crowd pressed close around its
 * genie is the intended reading, not a seating bug.
 */
export function instanceSpots(
  projectId: string,
  anchor: Spot,
  helperIds: readonly string[],
): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  [...helperIds].sort().forEach((helperId, i) => {
    const key = instanceKey(projectId, helperId);
    const side = i % 2 === 0 ? 1 : -1;
    const dist = Math.min(TETHER, FAN_START + Math.floor(i / 2) * FAN_STEP + (layoutHash(key) % 13));
    const x = Math.min(HOMES_HI, Math.max(HOMES_LO, anchor.x + side * dist));
    spots.set(key, { x, y: anchor.y, wander: INSTANCE_LEASH });
  });
  return spots;
}

/**
 * The whole village as things-to-draw. Projects and unlinked helpers seat
 * through placeCreatures exactly as today — nothing vanishes on remap day
 * (spec §4); a helper leaves the commons only when a scan links it. Linked
 * helpers are drawn once per project that uses them.
 */
export function buildRenderList(creatures: readonly Creature[]): RenderEntry[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));

  const linked = new Set<string>();
  for (const c of creatures) {
    for (const helperId of c.helperIds ?? []) {
      if (byId.has(helperId)) linked.add(helperId);
    }
  }

  const villagers = creatures.filter((c) => c.kind === 'project' || !linked.has(c.id));
  const spots = placeCreatures(villagers.map((c) => c.id));

  const entries: RenderEntry[] = villagers.map((c) => ({
    key: c.id,
    creature: c,
    spot: spots.get(c.id)!,
    presence: c.kind === 'project' ? presenceScale((c.helperIds ?? []).length) : 1,
  }));

  for (const project of villagers) {
    if (project.kind !== 'project') continue;
    const anchor = spots.get(project.id)!;
    const links = (project.helperIds ?? []).filter((id) => byId.has(id));
    for (const [key, spot] of instanceSpots(project.id, anchor, links)) {
      entries.push({ key, creature: byId.get(keyCreatureId(key))!, spot, presence: 1 });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/layout` — PASS (zones suite included).

- [ ] **Step 5: Commit and push**

```bash
git add packages/web/src/layout/instances.ts packages/web/src/layout/instances.test.ts packages/web/src/layout/zones.ts
git commit -m "feat(web): genies and their auras - the render list learns instances, tethers, presence"
git push
```

---

### Task 12: Web — the actor learns presence, and sprites stop double-loading

**Files:**
- Modify: `packages/web/src/scene/creature.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `spawnCreature(k, creature, spot, fonts, presence = 1)` — fifth parameter, default 1, so every existing call keeps compiling. Sprite keys become content-addressed so the same helper can spawn as several instances without reloading (and an appearance change still gets a fresh key).

No test file covers this scene module (none exists today); verification is typecheck + the full suite + Task 14's live check. The one testable number, `presenceScale`, was pinned in Task 11.

- [ ] **Step 1: Implement the edits**

In `packages/web/src/scene/creature.ts`:

**(a)** Signature:

```ts
export async function spawnCreature(
  k: KAPLAYCtx,
  creature: Creature,
  spot: Spot,
  fonts: CreatureFonts,
  /**
   * Body-scale multiplier — a project's aura grows mildly with its helper
   * count (remap spec §4). Text chrome (nameplate, bubble) deliberately does
   * NOT scale: names stay readable at every presence.
   */
  presence = 1,
): Promise<CreatureActor> {
```

**(b)** Immediately inside, bind `const P = presence;`.

**(c)** Content-addressed sprite keys with load guards (two instances of one helper share textures; an appearance change gets a new key so the guard can never serve a stale look):

```ts
  const lookKey = simpleHash(JSON.stringify(creature.appearance)).toString(36);
  const restKey = `body:${creature.id}:${lookKey}`;
  if (!k.getSprite(restKey)) {
    await loadSprite(k, restKey, toCanvas(bakePixels(restGrid, map)));
  }
```

and for the roam texture:

```ts
  const roamKey = `${restKey}:roam`;
  const roamGrid = dangles ? composeGrid(creature.appearance, 'trailing') : null;
  if (roamGrid && !k.getSprite(roamKey)) {
    await loadSprite(k, roamKey, toCanvas(bakePixels(roamGrid, map)));
  }
```

**(d)** Scale the drawn body by `P` — every place the body's metrics reach the screen, and nowhere else:

- `const restH = restGrid.h * U * P;`
- shadow creation: `k.rect(bw * 0.78 * P, 10, { radius: 5 })`; per-frame: `shadow.width = bw * 0.78 * P * squash;`
- body creation: `k.scale(U * P)`; per-frame: `body.scale = k.vec2(U * sx * P, U * sy * P);`
- `const bh = grid.h * U * P;` (in `update`)
- wings creation: `k.pos(side * (bw / 2) * P, -restH * 0.55)` and `k.scale(U * side * P, U * P)`; the per-frame `wing.pos.y = -bh * 0.55 + hover;` already follows the scaled `bh`.
- eye math in `update`: `const baseX = (anchor.c - grid.w / 2 + 1) * U * P;`, `const baseY = (anchor.r - grid.h + 1) * U * P;`, pupil offset `y + U * 0.125 * sy * P`, and the three overlay scales become `k.vec2(sx * P, sy * P)`.
- zzz drift and umbrella geometry: leave at 1 — sleep glyphs and umbrellas are chrome, like the nameplate.

Everything hung off `-restH`/`-bh` (plate, nameplate, fileTag, bubble base) follows automatically because those two are now scaled.

- [ ] **Step 2: Verify**

Run: `npm run typecheck` — green.
Run: `npm test` — the full suite stays green (this file has no direct tests; regressions would surface in boundaries/scene-adjacent suites).

- [ ] **Step 3: Commit and push**

```bash
git add packages/web/src/scene/creature.ts
git commit -m "feat(web): a creature can be drawn larger than life, and twice"
git push
```

---

### Task 13: Web — the scene draws the new village

**Files:**
- Modify: `packages/web/src/scene/village.ts`

**Interfaces:**
- Consumes: `buildRenderList`, `keyCreatureId`, `instanceKey`, `RenderEntry` (Task 11); `spawnCreature`'s `presence` param (Task 12).
- Produces: no exported-interface change — `startVillage`'s options and returned methods keep their signatures. Internally, every per-creature map (`actors`, `known`, `placements`, `generations`) is re-keyed by **render key**; `sayFor`/`greetFor`/`thinkFor`/`clearThoughtFor` fan out to every body of the creature.

No test file exists for this module; verification is typecheck + full suite + the live check in Task 14.

- [ ] **Step 1: Implement the edits**

In `packages/web/src/scene/village.ts`:

**(a)** Imports: add `buildRenderList`, `keyCreatureId`, and type `RenderEntry` from `../layout/instances.js`; remove `placeCreatures` from the `../layout/zones.js` import (it moved behind `buildRenderList`; keep the other zone imports).

**(b)** State: add `const presences = new Map<string, number>();` beside `known`.

**(c)** `setView` — replace the block from `const spots = placeCreatures(...)` through the resident-porch override with:

```ts
      let entries = buildRenderList(view.creatures);

      // The resident stands at the robot-house porch, not its hashed spot
      // (spec §4: a glance at the house says who the robot is). One body at
      // the porch, however many instances the helper usually casts — its key
      // collapses to the bare creature id while it holds the post.
      residentId = view.robotResidentId;
      if (residentId !== null) {
        const mine = entries.filter((e) => e.creature.id === residentId);
        if (mine.length > 0) {
          entries = entries.filter((e) => e.creature.id !== residentId);
          entries.push({ key: residentId, creature: mine[0]!.creature, spot: { ...PORCH_SPOT }, presence: mine[0]!.presence });
        }
      }
```

(The follow-on lines that read `spots` for the resident label/presence checks keep working off `view.creatures` + `residentId` — they never used `spots`.)

**(d)** The sync loop — iterate entries instead of creatures. `placements`, `known`, `generations`, `actors` are all keyed by `e.key` now:

```ts
      placements = new Map(entries.map((e) => [e.key, e.spot]));
      const seen = new Set<string>();

      for (const e of entries) {
        seen.add(e.key);
        const before = known.get(e.key);
        const changed =
          before &&
          (JSON.stringify(before.appearance) !== JSON.stringify(e.creature.appearance) ||
            presences.get(e.key) !== e.presence);
        if (!actors.has(e.key) || changed) {
          actors.get(e.key)?.destroy();
          actors.delete(e.key);
          const gen = (generations.get(e.key) ?? 0) + 1;
          generations.set(e.key, gen);
          const { key, creature, presence } = e;
          void spawnCreature(k, creature, e.spot, { pixel: pixelFont, mono: monoFont }, presence)
            .then((actor) => {
              if (generations.get(key) !== gen) { actor.destroy(); return; }
              actor.setSpot(placements.get(key) ?? e.spot);
              actor.setCreature(known.get(key) ?? creature);
              actors.set(key, actor);
            })
            .catch(() => { /* failed sprite load: nothing to add */ });
        } else {
          const actor = actors.get(e.key)!;
          actor.setSpot(e.spot);
          actor.setCreature(e.creature);
        }
      }

      for (const [key, actor] of actors) {
        if (!seen.has(key)) { actor.destroy(); actors.delete(key); }
      }

      presences.clear();
      for (const e of entries) presences.set(e.key, e.presence);
```

(Preserve the existing comments where the logic is unchanged — the generation-race note, the respawn-only-on-look-change note — updating "creature id" wording to "render key".)

**(e)** Sound snapshots — a creature's chime x is its first body's spot (a linked helper has no commons spot any more):

```ts
      const xByCreature = new Map<string, number>();
      for (const e of entries) {
        if (!xByCreature.has(e.creature.id)) xByCreature.set(e.creature.id, e.spot.x);
      }
      const snapshots: CreatureSnapshot[] = view.creatures.map((c) => ({
        id: c.id,
        stage: stageOf(c),
        x: xByCreature.get(c.id) ?? 0,
        voice: voiceParamsFor(c),
      }));
```

**(f)** `known` now maps render key → creature:

```ts
      known = new Map(entries.map((e) => [e.key, e.creature]));
```

The hover loop, idle-tick candidates, and drag ghost all read `placements`/`known` by the same keys and keep working; `hoveredId` becomes a render key, which is exactly what the click path wants — `known.get(gesture.targetId)` hands the click the *helper* creature for an instance, so clicking any instance opens the same helper panel (spec §4) with zero panel changes.

**(g)** Robot-house drop/evict must unwrap instance keys back to creature ids:

```ts
      if (inRobotHouse(worldX, worldY)) {
        opts.onRobotDrop?.(keyCreatureId(gesture.targetId));
      } else if (keyCreatureId(gesture.targetId) === residentId) {
        opts.onRobotEvict?.(keyCreatureId(gesture.targetId));
      }
```

**(h)** The four speak-throughs fan out to every body:

```ts
    sayFor(creatureId, text, source) {
      // One creature, possibly several bodies — every instance says the line.
      for (const [key, actor] of actors) {
        if (keyCreatureId(key) === creatureId) actor.say(text, source);
      }
    },
    greetFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.greet();
    },
    thinkFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.think();
    },
    clearThoughtFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.clearThought();
    },
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck` — green.
Run: `npm test` — full suite green.

- [ ] **Step 3: Commit and push**

```bash
git add packages/web/src/scene/village.ts
git commit -m "feat(web): the projects move in - Homes seats genies, auras, and the commons"
git push
```

---

### Task 14: Verification, live smoke, and the wrap

**Files:**
- Modify: `docs/village-deploy.md` (one paragraph)

- [ ] **Step 1: Full verification**

Run: `npm test` — expect the pre-M5 counts (973 passed + 1 skipped) **plus** every new test, 0 failures.
Run: `npm run typecheck` — green.

- [ ] **Step 2: Live smoke (dev server + browser)**

Start the dev server via the Browser pane (`preview_start {name:"dev"}` — never Bash) and confirm:
1. The console line `Skill Village is awake … with N villagers` shows N > 75 (the ~40 real project entries joined the 75 helpers).
2. In the page: Homes shows visibly larger project creatures; the few transcript-linked helpers (e.g. `brainstorming`) stand beside their projects and are gone from the commons; hover shows `<name>/` labels on projects.
3. Click an instance → the helper's panel opens. Click a project → its panel opens.
4. `GET /api/state` → project creatures carry `lastWorkedAt`, `helperIds`, `unresolvedMentions`.
5. Console shows no errors; a freshly worked project (this repo!) hops.

If the pane won't composite, use the gstack `browse` daemon for screenshots (`~/.claude/skills/gstack/browse/dist/browse`).

- [ ] **Step 3: Docs**

Append to the deploy runbook (`docs/village-deploy.md`), in the snapshot-mode section:

```markdown
Project villagers (M5) never appear on the droplet by scanning — snapshot mode
skips the transcript scan entirely (`scanProjects` is a quiet no-op). They
reach the public village only inside a reseeded `state.json`, and a project's
`sourcePath` is a real local folder path from the owner's machine: reseeding
publishes those path strings, same posture as helper `sourcePath`s today
(names world-readable, never contents). Note that a reseed also overwrites
live visitor state (bonds, robot resident) — see the reseed caution above.
```

- [ ] **Step 4: Commit and push**

```bash
git add docs/village-deploy.md
git commit -m "docs(deploy): what snapshot mode means for project villagers"
git push
```

- [ ] **Step 5: Hand to the owner's eyes**

The visual verdict is the user's (standing playtest rule). Offer a pixel-playtester pass plus their own look at: presence scale legibility, aura crowding around big genies, commons density after the linked few leave, and whether all-instances-speak reads charming or noisy. Tunables if it reads wrong: `presenceScale`'s `0.06`/`1.3`, `TETHER`/`FAN_*`/`INSTANCE_LEASH` in `instances.ts`.

---

## Known deliberate deferrals (M6 plan's opening scope)

- **Signs copy** — "last worked 12 days ago", which helpers it misses (spec §5): panel/HUD copy over data M5 already ships (`lastWorkedAt`, `helperIds`).
- **Project personas** from CLAUDE.md + README: today `ensurePersona` will try to `readFile` a project's `sourcePath` (a folder), fail quietly, and card the project from its name alone — chat works, voice is generic. M6 replaces the source text, read-only.
- **Release / re-adopt UI** — the `retired` flag and its discovery guard ship now; the Adoption Center listing is M6.
- **Care copy for projects** — `pet`/`play` bump mood briefly until the next tick's derivation overwrites it; bond/xp persist. Functionally "care builds bond only" (spec §5); making the UI say so is M6 polish.
- **Unresolved-mentions UI** ("powers beyond the village") — the tally is stored; showing it is a polish call (spec §3).

## Self-Review (performed while writing)

- **Spec coverage:** §1 → Tasks 1, 2, 6, 8; §2 → Tasks 3, 6, 8 (retired guard); §3 → Tasks 4, 5, 8 (resolution table as tests), 9 (cadence); §4 → Tasks 11, 12, 13; §5 → Tasks 2, 7 (rest deferred, listed above); §6 → fixtures (T4), scanner units (T5/T6), sandbox tree (T6), safety assertions stated per task; §7 respected — no git supplement, no project friendships (by construction: nothing in the server grows friendships), no hooks, no writes.
- **The one integration landmine** — helper `reconcile` auto-releasing projects — is Task 8's first test.
- **Type consistency:** `DiscoveredProject` (T6) is consumed by name in T8/T9; `RenderEntry`/`keyCreatureId` (T11) in T13; `workStats` (T2) in T7; `presence` param (T12) in T13. Names match across tasks.
- **Windows-path fragility** (`basename` vs backslashes) handled explicitly in T6 with a platform-agnostic `lastSegment` and a pinned test.
