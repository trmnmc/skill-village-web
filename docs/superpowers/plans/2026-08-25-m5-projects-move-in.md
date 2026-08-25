# M5 — The Projects Move In: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every project under `~/.claude/projects` becomes a villager in Homes, with the helper creatures its transcripts actually used drawn standing beside it.

**Architecture:** A third `CreatureKind` (`'project'`) joins skills and agents, and a derived `role()` layer splits the cast into projects and helpers without storing the split. A new read-only scanner under `packages/server/src/bridge/projects/` folds worktree entries into their parent, streams each transcript for two markers (`Skill` tool calls and `subagent_type` values), and resolves those mentions against the helper roster the existing scan just loaded. The renderer gains a plan step: one creature can now be drawn many times — once beside each project that uses it — so the actor map is keyed by a render-instance key rather than a creature id.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node 22 `fs/promises` + `readline` streaming, vitest, KAPLAY for the scene.

**Spec:** `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md` (covers M5 + M6; this plan implements M5 only — the care loop in §5 is M6 and is deliberately out of scope).

---

## Spec drift — measured 2026-08-25, read this before Task 3

The spec's §3 sizing was taken on 2026-08-23. It has moved, and two of its
structural assumptions are wrong. All figures below were measured on the
reference machine on 2026-08-25 and are what the tasks are built against.

| Spec said (2026-08-23) | Measured (2026-08-25) | Consequence |
|---|---|---|
| 314 transcripts, ~20 MB | **486 transcripts, 200 MB** | 10x the data. Still fine — see timing below — but the cache stops being decorative. |
| (implied) `.jsonl` files sit flat in each entry | **95 flat, 341 at `<entry>/<sessionId>/subagents/*.jsonl`, 49 nested deeper still** | Discovery **must walk recursively**. A flat `readdir` finds only 20% of the transcripts. |
| 24 entries, 10 worktrees, no orphans | **38 entries, 19 worktrees, 0 orphans, 19 projects after folding** | Folding rule holds exactly as specced. |
| — | **1 entry has zero `.jsonl`** (`C--Users-truman-Projects-agent-skills-tamagotchi`) | The zero-jsonl skip is live, not theoretical: 18 project creatures, not 19. |

**Timing (measured, same machine):** a full recursive streaming scan of all
486 files / 200 MB takes **934 ms** with a substring pre-filter before
`JSON.parse`, and **1129 ms** parsing every one of the 69,046 lines. So the
pre-filter is a ~20% saving, not a rescue, and a cold scan costs about a
second. The spec's verdict ("a full streaming scan is trivial today") still
holds; the cache is what keeps the **every-5-minute** rescan free.

**Link graph (measured):** across every transcript there are 22 distinct
skill mentions and 5 distinct agent mentions. Against the live roster of 76
helper files (72 skills + 4 agents), **11 resolve** and **16 names do not** —
`general-purpose`, `Explore`, `Plan`, `claude`, `run`, `design`,
`update-config`, `claude-api`, `schedule`, `artifact-design`,
`artifact-diagramming`, `artifact-capabilities`, `claude-code-guide`,
`anthropic-skills:pptx`, `anthropic-skills:pdf`,
`anthropic-skills:explain-usage`. That is exactly the spec's §3 table:
built-ins and plugin-prefixed names have no file on disk. **65 of 76 helpers
will wander the commons on day one** — so the commons is the common case,
not the exception, and Task 11 sizes it accordingly.

**Marker shapes (verified against real transcripts):**

- skill use — a `line.message.content[]` block with `type === 'tool_use'` and
  `name === 'Skill'`, the name in `input.skill` (e.g. `"brainstorming"`).
- agent spawn — same block shape, `input.subagent_type` (e.g.
  `"general-purpose"`). The tool is named `Agent` on this build, so match on
  the **input field**, not on the tool name, and a rename cannot starve the village.
- `cwd` is a **top-level field on every line**, present on line 1 of 388 of
  486 files. Read line 1 first; only scan on when it is absent.
- There are also top-level `attributionSkill` / `attributionAgent` fields on
  subagent transcripts. **Deliberately not used** — they attribute a line to
  the helper that produced it, which would count a helper's own output as the
  project using it. The two `input.*` markers are the spec's signal; keep to them.

---

## Global Constraints

Copied from the spec and from rules this repo already enforces. Every task's
requirements implicitly include this section.

- **Nothing under `~/.claude` is ever written, moved, or locked.** The
  scanner uses read APIs only (`readdir`, `stat`, `createReadStream`). This
  extends the standing M2 safety rule to the transcript scanner (spec §2, §6).
- **No writes to any real project folder.** `sourcePath` on a project
  creature is a pointer the game reads and never touches (spec §7).
- **`packages/web` must never import the bare `@village/core` barrel** — only
  `@village/core/visual`. Enforced by `packages/web/src/boundaries.test.ts`.
  Anything the renderer needs from core must be exported from
  `packages/core/src/visual.ts`, which may not pull in a Node builtin.
- **Core never reads the clock.** Timestamps are passed in as `now: number`.
- **Optional fields, not required ones.** Every field added to `Creature` in
  Task 1 is optional, so the 75 creatures in the live save stay valid and no
  creature object has to be rewritten by a migration.
- **Malformed input is skipped, never thrown.** A half-written transcript
  line, an unreadable file, or a missing directory means "no facts here", the
  same way `listDir` in `bridge/scan.ts` already treats a missing directory as
  empty.
- **Determinism.** Placement and appearance are pure functions of ids, so the
  same village draws the same way on every reload (`zones.ts` contract).
- **Import specifiers end in `.js`** even for `.ts` sources (ESM + NodeNext).
- **Verification:** `npm test` and `npm run typecheck` must both be green at
  every commit. Baseline at plan time: **937 passed + 1 skipped**, typecheck
  clean, at `c33355a`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `packages/core/src/role.ts` | The derived role layer: `role(kind)`, `isProject`, `helperIdsOf`. Pure, browser-safe. |
| `packages/server/src/bridge/projects/entries.ts` | Read `~/.claude/projects`: recursive transcript walk, worktree folding, zero-jsonl skip. |
| `packages/server/src/bridge/projects/transcript.ts` | One file in, one `TranscriptFacts` out. The only module that knows Claude Code's line shape. |
| `packages/server/src/bridge/projects/cache.ts` | `scan-cache.json` load/save and the size+mtime hit test. |
| `packages/server/src/bridge/projects/resolve.ts` | Turn a raw mention into a helper creature id, or nothing. |
| `packages/server/src/bridge/projects/scan.ts` | Orchestration: entries to facts (cached) to one `ProjectFacts` per project. |
| `packages/server/src/bridge/projects/creature.ts` | `creatureFromProject`. |
| `packages/server/src/bridge/projects/testing/fixtures/*.jsonl` | Pinned, redacted transcript excerpts (spec §6). |
| `packages/web/src/layout/instances.ts` | Pure: creatures to render instances (`helperId@projectId`, commons, projects). |

**Modified**

| File | Change |
|---|---|
| `packages/core/src/types.ts` | `CreatureKind` gains `'project'`; four optional project fields on `Creature`. |
| `packages/core/src/index.ts`, `src/visual.ts` | Export `role.js` from both barrels. |
| `packages/server/src/config/paths.ts` | `projectsDir`, `scanCachePath`. |
| `packages/server/src/testing/sandbox.ts` | `writeTranscript`, `writeSubagentTranscript`. |
| `packages/server/src/bridge/scan.ts` | Run the project scan after the helper scan; merge both into `ScanResult`. |
| `packages/server/src/bridge/reconcile.ts` | Projects refresh their facts on every scan; a retired project is never auto-released. |
| `packages/server/src/village.ts` | Skip shadow-mirroring for projects (a project has no file to mirror). |
| `packages/server/src/state/schema.ts` | `STATE_VERSION` 5 + a v4 to v5 step. |
| `packages/web/src/net/protocol.ts` | Accept `kind: 'project'`; carry `helperIds` through to the view. |
| `packages/web/src/layout/zones.ts` | Split Homes into a projects neighbourhood and a commons; tethered placement. |
| `packages/web/src/scene/village.ts` | Actor map keyed by instance key, not creature id. |

---

## Task 1: The `project` kind and the role layer

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/role.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/visual.ts`
- Test: `packages/core/src/role.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `CreatureKind` now includes `'project'`; `CreatureRole = 'project' | 'helper'`; `role(kind: CreatureKind): CreatureRole`; `isProject(c: { kind: CreatureKind }): boolean`; `helperIdsOf(c: { helperIds?: string[] }): readonly string[]`. `Creature` gains optional `lastWorkedAt?: number`, `helperIds?: string[]`, `unresolvedHelpers?: number`, `retired?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/role.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { role, isProject, helperIdsOf } from './role.js';

describe('role', () => {
  it('calls a project a project and everything else a helper', () => {
    expect(role('project')).toBe('project');
    expect(role('skill')).toBe('helper');
    expect(role('agent')).toBe('helper');
  });

  it('isProject reads the kind, not a stored flag', () => {
    expect(isProject({ kind: 'project' })).toBe(true);
    expect(isProject({ kind: 'skill' })).toBe(false);
  });

  it('helperIdsOf treats a missing list as empty, so every pre-M5 creature is safe', () => {
    expect(helperIdsOf({})).toEqual([]);
    expect(helperIdsOf({ helperIds: ['skill:brainstorming'] })).toEqual(['skill:brainstorming']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/role.test.ts`
Expected: FAIL — `Failed to resolve import "./role.js"`.

- [ ] **Step 3: Write the role module**

Create `packages/core/src/role.ts`:

```ts
import type { CreatureKind } from './types.js';

/**
 * What a creature *is* in the remapped village. Derived from `kind` on every
 * read and never stored: a stored role is a second source of truth that can
 * disagree with the kind, and there is no case where it should.
 */
export type CreatureRole = 'project' | 'helper';

export function role(kind: CreatureKind): CreatureRole {
  return kind === 'project' ? 'project' : 'helper';
}

export function isProject(creature: { kind: CreatureKind }): boolean {
  return creature.kind === 'project';
}

/**
 * A project's resolved helper links. Every creature written before M5 lacks
 * the field entirely, and so does every helper — both read as "no links"
 * rather than as a bug, which is why the field is optional and this accessor
 * exists instead of bare `creature.helperIds`.
 */
export function helperIdsOf(creature: { helperIds?: string[] }): readonly string[] {
  return creature.helperIds ?? [];
}
```

- [ ] **Step 4: Widen the kind and add the project fields**

In `packages/core/src/types.ts`, replace the first two lines:

```ts
/** A creature is either a skill (grounded) or an agent (winged). */
export type CreatureKind = 'skill' | 'agent';
```

with:

```ts
/**
 * A helper is either a skill (grounded) or an agent (winged); a project is the
 * villager those helpers work for. `role()` in `role.ts` is the derived split.
 */
export type CreatureKind = 'skill' | 'agent' | 'project';
```

Then in the same file, inside `export interface Creature`, insert these four
fields immediately after the `sourcePath` field:

```ts
  /**
   * Projects only: the newest transcript mtime across every session of this
   * project, worktrees folded in. Epoch millis; 0 when nothing is known.
   * Health and mood derive from this at tick time (M6) rather than being
   * persisted, so tuning the decay curve never needs a state migration.
   */
  lastWorkedAt?: number;
  /** Projects only: resolved helper creature ids, sorted and deduped. */
  helperIds?: string[];
  /**
   * Projects only: how many mentions matched no helper on disk — built-in
   * skills, built-in agent types and plugin-prefixed names. Kept so the
   * number is never silently lost ("powers beyond the village", spec §3).
   */
  unresolvedHelpers?: number;
  /**
   * Projects only: the player released it (M6). Discovery does not resurrect
   * a retired project and reconcile does not auto-release it; the folder is
   * never touched either way.
   */
  retired?: boolean;
```

- [ ] **Step 5: Export the module from both barrels**

In `packages/core/src/index.ts`, add immediately after `export * from './types.js';`:

```ts
export * from './role.js';
```

In `packages/core/src/visual.ts`, add immediately after `export * from './types.js';`:

```ts
export * from './role.js';
```

`role.ts` imports only a type from `types.ts`, so it pulls in no Node builtin
and the browser-safe subpath stays browser-safe.

- [ ] **Step 6: Run the test and the full suite**

Run: `npx vitest run packages/core/src/role.test.ts`
Expected: PASS (3 tests).

Run: `npm test && npm run typecheck`
Expected: 940 passed + 1 skipped, typecheck clean. Widening a union is
backwards-compatible for every existing `switch`, and the new fields are
optional — nothing else should move. If `typecheck` reports a non-exhaustive
switch on `CreatureKind` somewhere, fix it by treating the new kind the way
`role()` does rather than by casting.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/role.ts packages/core/src/role.test.ts packages/core/src/types.ts packages/core/src/index.ts packages/core/src/visual.ts
git commit -m "feat(core): a project is a creature kind, and role is derived from it"
```

---

## Task 2: Where the projects live, and a sandbox that can write transcripts

**Files:**
- Modify: `packages/server/src/config/paths.ts`
- Modify: `packages/server/src/testing/sandbox.ts`
- Test: `packages/server/src/config/paths.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `VillagePaths.projectsDir: string` (`<home>/.claude/projects`), `VillagePaths.scanCachePath: string` (`<home>/.skill-village/scan-cache.json`); `Sandbox.writeTranscript(entry: string, session: string, lines: unknown[]): Promise<string>` returning the absolute file path, and `Sandbox.writeSubagentTranscript(entry: string, session: string, agent: string, lines: unknown[]): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/config/paths.test.ts` (add `join` and `sep`
to its `node:path` import if they are not already there):

```ts
describe('project paths', () => {
  it('points at ~/.claude/projects and keeps the cache in the game data dir', () => {
    const paths = resolvePaths({ home: '/home/tester' });
    expect(paths.projectsDir).toBe(join('/home/tester', '.claude', 'projects'));
    expect(paths.scanCachePath).toBe(join('/home/tester', '.skill-village', 'scan-cache.json'));
  });

  it('never puts the scan cache inside ~/.claude', () => {
    const paths = resolvePaths({ home: '/home/tester' });
    expect(paths.scanCachePath.includes(`${sep}.claude${sep}`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/config/paths.test.ts`
Expected: FAIL — `expected undefined to be '/home/tester/.claude/projects'`.

- [ ] **Step 3: Add the two paths**

In `packages/server/src/config/paths.ts`, add to the `VillagePaths` interface,
immediately after the `archiveDir` field:

```ts
  /** Claude Code's own transcript store. Read-only, always: never written, moved or locked. */
  projectsDir: string;
  /** Per-file transcript facts, so a rescan reparses only what changed. Game-owned. */
  scanCachePath: string;
```

and add to the object `resolvePaths` returns, immediately after `archiveDir`:

```ts
    projectsDir: join(claudeDir, 'projects'),
    scanCachePath: join(dataDir, 'scan-cache.json'),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/config/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Teach the sandbox to write transcripts**

In `packages/server/src/testing/sandbox.ts`, add to the `Sandbox` interface
immediately after `writeAgent`:

```ts
  /** Write a session transcript at ~/.claude/projects/<entry>/<session>.jsonl */
  writeTranscript(entry: string, session: string, lines: unknown[]): Promise<string>;
  /** Write a nested subagent transcript — the shape 80% of real transcripts have. */
  writeSubagentTranscript(entry: string, session: string, agent: string, lines: unknown[]): Promise<string>;
```

and add these two implementations to the returned object, immediately after
`writeAgent`:

```ts
    async writeTranscript(entry, session, lines) {
      const dir = join(paths.projectsDir, entry);
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${session}.jsonl`);
      await writeFile(file, `${lines.map(transcriptLine).join('\n')}\n`, 'utf8');
      return file;
    },

    async writeSubagentTranscript(entry, session, agent, lines) {
      const dir = join(paths.projectsDir, entry, session, 'subagents');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${agent}.jsonl`);
      await writeFile(file, `${lines.map(transcriptLine).join('\n')}\n`, 'utf8');
      return file;
    },
```

and add this helper at module scope, beside `skillFixture`:

```ts
/** A string line is written verbatim, so a test can plant a malformed one. */
function transcriptLine(line: unknown): string {
  return typeof line === 'string' ? line : JSON.stringify(line);
}
```

- [ ] **Step 6: Run the suite**

Run: `npm test && npm run typecheck`
Expected: 942 passed + 1 skipped, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/config/paths.ts packages/server/src/config/paths.test.ts packages/server/src/testing/sandbox.ts
git commit -m "feat(server): paths for the transcript store and the scan cache"
```

---

## Task 3: Entry folding and the recursive transcript walk

**Files:**
- Create: `packages/server/src/bridge/projects/entries.ts`
- Test: `packages/server/src/bridge/projects/entries.test.ts`

**Interfaces:**
- Consumes: `VillagePaths.projectsDir`, `Sandbox.writeTranscript`, `Sandbox.writeSubagentTranscript` (Task 2).
- Produces: `WORKTREE_PATTERN: RegExp`; `foldEntryName(entry: string): string`; `interface ProjectEntry { project: string; transcripts: string[] }`; `listProjectEntries(projectsDir: string): Promise<ProjectEntry[]>` — sorted by `project`, projects with no transcripts omitted, `transcripts` absolute and sorted.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/bridge/projects/entries.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSandbox, type Sandbox } from '../../testing/sandbox.js';
import { foldEntryName, listProjectEntries } from './entries.js';

describe('foldEntryName', () => {
  it('folds a worktree entry into its parent', () => {
    expect(foldEntryName('C--Users-t-Projects-village--claude-worktrees-m5-abc123'))
      .toBe('C--Users-t-Projects-village');
  });

  it('leaves an ordinary entry alone', () => {
    expect(foldEntryName('C--Users-t-Projects-village')).toBe('C--Users-t-Projects-village');
  });

  it('folds at the first marker, so a worktree of a worktree lands on the root project', () => {
    expect(foldEntryName('root--claude-worktrees-a--claude-worktrees-b')).toBe('root');
  });
});

describe('listProjectEntries', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  it('treats a missing projects directory as an empty village, not an error', async () => {
    expect(await listProjectEntries(join(box.home, 'nowhere'))).toEqual([]);
  });

  it('folds a worktree entry in with its parent under one project', async () => {
    await box.writeTranscript('proj', 's1', [{ cwd: '/w/proj' }]);
    await box.writeTranscript('proj--claude-worktrees-feature-abc', 's2', [{ cwd: '/w/proj/wt' }]);

    const entries = await listProjectEntries(box.paths.projectsDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.project).toBe('proj');
    expect(entries[0]!.transcripts).toHaveLength(2);
  });

  it('folds an orphan worktree into a parent that was never opened directly', async () => {
    await box.writeTranscript('ghost--claude-worktrees-only-abc', 's1', [{ cwd: '/w/ghost/wt' }]);

    const entries = await listProjectEntries(box.paths.projectsDir);
    expect(entries.map((e) => e.project)).toEqual(['ghost']);
  });

  it('finds nested subagent transcripts, which are most of them on a real machine', async () => {
    await box.writeTranscript('proj', 'sess', [{ cwd: '/w/proj' }]);
    await box.writeSubagentTranscript('proj', 'sess', 'agent-aaa', [{ cwd: '/w/proj' }]);

    const [entry] = await listProjectEntries(box.paths.projectsDir);
    expect(entry!.transcripts).toHaveLength(2);
    expect(entry!.transcripts.some((t) => t.includes('subagents'))).toBe(true);
  });

  it('skips an entry with no transcripts — a villager that can never change state is furniture', async () => {
    await box.writeTranscript('alive', 's1', [{ cwd: '/w/alive' }]);
    await mkdir(join(box.paths.projectsDir, 'empty'), { recursive: true });

    const entries = await listProjectEntries(box.paths.projectsDir);
    expect(entries.map((e) => e.project)).toEqual(['alive']);
  });

  it('sorts projects and their transcripts, so the same disk gives the same village', async () => {
    await box.writeTranscript('zeta', 's1', [{ cwd: '/w/z' }]);
    await box.writeTranscript('alpha', 's1', [{ cwd: '/w/a' }]);

    const entries = await listProjectEntries(box.paths.projectsDir);
    expect(entries.map((e) => e.project)).toEqual(['alpha', 'zeta']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/entries.test.ts`
Expected: FAIL — `Failed to resolve import "./entries.js"`.

- [ ] **Step 3: Write the module**

Create `packages/server/src/bridge/projects/entries.ts`:

```ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A worktree entry carries its parent's whole encoded path, then the marker,
 * then the worktree's own name. Non-greedy on the left so a worktree of a
 * worktree folds all the way back to the root project rather than to the
 * intermediate one.
 */
export const WORKTREE_PATTERN = /^(.+?)--claude-worktrees-.+$/;

/**
 * The project an entry belongs to. An orphan worktree — one whose parent was
 * never opened directly, so no parent entry exists — still folds into the
 * synthesized parent name: the parent project is real even if Claude never
 * sat in it (spec §2).
 */
export function foldEntryName(entry: string): string {
  return WORKTREE_PATTERN.exec(entry)?.[1] ?? entry;
}

export interface ProjectEntry {
  /** The folded entry name. Unique and stable; the creature id is built from it. */
  project: string;
  /** Absolute paths to every transcript across every folded entry, sorted. */
  transcripts: string[];
}

/** Directory listing that treats "missing" as "empty" — a fresh machine is not an error. */
async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Every `.jsonl` under `dir`, at any depth.
 *
 * Recursion is not optional: measured 2026-08-25, only 95 of 486 transcripts
 * sit flat in their entry. The other 391 are session subagent logs nested at
 * `<entry>/<sessionId>/subagents/*.jsonl` and deeper, and a flat readdir
 * silently finds a fifth of the work signal.
 */
async function collectTranscripts(dir: string, into: string[]): Promise<void> {
  for (const item of await listDir(dir)) {
    const full = join(dir, item.name);
    if (item.isDirectory()) await collectTranscripts(full, into);
    else if (item.name.endsWith('.jsonl')) into.push(full);
  }
}

/**
 * Read-only. One `ProjectEntry` per project, with every folded entry's
 * transcripts gathered under it. Projects with zero transcripts are dropped
 * before they ever become a creature (spec §2).
 */
export async function listProjectEntries(projectsDir: string): Promise<ProjectEntry[]> {
  const byProject = new Map<string, string[]>();

  for (const item of await listDir(projectsDir)) {
    if (!item.isDirectory()) continue;
    const project = foldEntryName(item.name);
    const transcripts = byProject.get(project) ?? [];
    await collectTranscripts(join(projectsDir, item.name), transcripts);
    byProject.set(project, transcripts);
  }

  return [...byProject.entries()]
    .filter(([, transcripts]) => transcripts.length > 0)
    .map(([project, transcripts]) => ({ project, transcripts: transcripts.sort() }))
    .sort((a, b) => a.project.localeCompare(b.project));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/entries.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Sanity-check against the real machine (read-only)**

Run:

```bash
npx tsx -e "import('./packages/server/src/bridge/projects/entries.ts').then(async m => { const e = await m.listProjectEntries(require('node:os').homedir() + '/.claude/projects'); console.log('projects', e.length, 'transcripts', e.reduce((n, x) => n + x.transcripts.length, 0)); })"
```

Expected on the reference machine: `projects 18 transcripts 486` — 18 not 19,
because one entry has no transcripts. The exact numbers drift as the machine
is used; what must hold is that the transcript count is in the **hundreds**.
If it prints ~95, the recursion is broken and only flat files were found.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/bridge/projects/entries.ts packages/server/src/bridge/projects/entries.test.ts
git commit -m "feat(server): fold worktree entries and walk transcripts recursively"
```

---

## Task 4: Reading one transcript

**Files:**
- Create: `packages/server/src/bridge/projects/transcript.ts`
- Create: `packages/server/src/bridge/projects/testing/fixtures/skill-use.jsonl`
- Create: `packages/server/src/bridge/projects/testing/fixtures/agent-spawn.jsonl`
- Create: `packages/server/src/bridge/projects/testing/fixtures/unresolvable.jsonl`
- Create: `packages/server/src/bridge/projects/testing/fixtures/malformed.jsonl`
- Create: `packages/server/src/bridge/projects/testing/fixtures/late-cwd.jsonl`
- Test: `packages/server/src/bridge/projects/transcript.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (deliberately standalone — this is the only module that knows Claude Code's line shape).
- Produces: `interface TranscriptFacts { lastActivityMs: number; cwd: string; helperMentions: string[] }`; `readTranscriptFacts(file: string, lastActivityMs: number): Promise<TranscriptFacts>`. `helperMentions` are **already in creature-id form** — `skill:<name>` or `agent:<name>` — deduped and sorted; they are candidates, not yet resolved.

**Why fixtures are pinned:** this parser keys on Claude Code's internal
transcript shape, which nothing promises to keep. When the format drifts, a
fixture-driven test fails loudly instead of the village quietly starving
(spec §3, §6). Every fixture below is a redacted excerpt of a real line.

- [ ] **Step 1: Write the fixtures**

Create `packages/server/src/bridge/projects/testing/fixtures/skill-use.jsonl`
(one JSON object per line, no trailing blank line inside the objects):

```
{"type":"assistant","cwd":"/home/dev/work/atlas","timestamp":"2026-08-20T10:00:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me plan this."},{"type":"tool_use","id":"tu_1","name":"Skill","input":{"skill":"brainstorming"}}]}}
{"type":"assistant","cwd":"/home/dev/work/atlas","timestamp":"2026-08-20T10:01:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_2","name":"Skill","input":{"skill":"writing-plans","args":"against the spec"}}]}}
{"type":"assistant","cwd":"/home/dev/work/atlas","timestamp":"2026-08-20T10:02:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_3","name":"Skill","input":{"skill":"brainstorming"}}]}}
```

Create `agent-spawn.jsonl`:

```
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_1","name":"Agent","input":{"description":"find the bug","prompt":"redacted","subagent_type":"code-reviewer"}}]}}
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_2","name":"Agent","input":{"description":"write tests","prompt":"redacted","subagent_type":"test-writer"}}]}}
```

Create `unresolvable.jsonl` — a plugin-prefixed skill and two built-in agent
types. None of these has a file on disk, so none of them may ever become a link:

```
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_1","name":"Skill","input":{"skill":"anthropic-skills:xlsx"}}]}}
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_2","name":"Agent","input":{"subagent_type":"general-purpose"}}]}}
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_3","name":"Agent","input":{"subagent_type":"Explore"}}]}}
```

Create `malformed.jsonl` — a truncated line from a crash, a line whose
`content` is a bare string rather than an array, and a good line after both:

```
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assist
{"type":"user","cwd":"/home/dev/work/atlas","message":{"role":"user","content":"just text, not blocks"}}
{"type":"assistant","cwd":"/home/dev/work/atlas","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_9","name":"Skill","input":{"skill":"systematic-debugging"}}]}}
```

Create `late-cwd.jsonl` — the ~20% of real files whose first line carries no
`cwd` (a summary header), so the scan has to read on:

```
{"type":"summary","summary":"Earlier conversation about the atlas rewrite","leafUuid":"abc"}
{"type":"user","cwd":"/home/dev/work/atlas","message":{"role":"user","content":"carry on"}}
```

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/bridge/projects/transcript.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTranscriptFacts } from './transcript.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'testing', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);

describe('readTranscriptFacts', () => {
  it('reads skill invocations as skill-kinded mentions, deduped and sorted', async () => {
    const facts = await readTranscriptFacts(fixture('skill-use.jsonl'), 1000);
    expect(facts.helperMentions).toEqual(['skill:brainstorming', 'skill:writing-plans']);
  });

  it('reads agent spawns from input.subagent_type, not from the tool name', async () => {
    const facts = await readTranscriptFacts(fixture('agent-spawn.jsonl'), 1000);
    expect(facts.helperMentions).toEqual(['agent:code-reviewer', 'agent:test-writer']);
  });

  it('still reports plugin-prefixed and built-in names — resolution is a later layer', async () => {
    const facts = await readTranscriptFacts(fixture('unresolvable.jsonl'), 1000);
    expect(facts.helperMentions).toEqual([
      'agent:Explore', 'agent:general-purpose', 'skill:anthropic-skills:xlsx',
    ]);
  });

  it('skips a malformed line and keeps reading the rest of the file', async () => {
    const facts = await readTranscriptFacts(fixture('malformed.jsonl'), 1000);
    expect(facts.helperMentions).toEqual(['skill:systematic-debugging']);
    expect(facts.cwd).toBe('/home/dev/work/atlas');
  });

  it('takes cwd from the first line that has one, even when line 1 does not', async () => {
    const facts = await readTranscriptFacts(fixture('late-cwd.jsonl'), 1000);
    expect(facts.cwd).toBe('/home/dev/work/atlas');
  });

  it('passes the activity stamp straight through — the parser never reads the clock', async () => {
    const facts = await readTranscriptFacts(fixture('skill-use.jsonl'), 1_724_000_000_000);
    expect(facts.lastActivityMs).toBe(1_724_000_000_000);
  });

  it('treats an unreadable file as no facts, not as an error', async () => {
    const facts = await readTranscriptFacts(fixture('does-not-exist.jsonl'), 42);
    expect(facts).toEqual({ lastActivityMs: 42, cwd: '', helperMentions: [] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/transcript.test.ts`
Expected: FAIL — `Failed to resolve import "./transcript.js"`.

- [ ] **Step 4: Write the parser**

Create `packages/server/src/bridge/projects/transcript.ts`:

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export interface TranscriptFacts {
  /** The file's mtime, passed in by the caller. Epoch millis. */
  lastActivityMs: number;
  /** The project's real working directory, or '' when the file never said. */
  cwd: string;
  /**
   * Candidate helper ids in `${kind}:${name}` form — the same shape a helper
   * creature's id has, so resolution downstream is a set lookup rather than a
   * second naming convention. Deduped and sorted. Unresolved at this layer:
   * a name with no file on disk is still a mention.
   */
  helperMentions: string[];
}

/**
 * Cheap pre-filter. A line that cannot contain either marker is never handed
 * to JSON.parse. Measured over the real 200 MB store this saves ~20% of a
 * cold scan (934 ms vs 1129 ms) — worth having, not worth contorting for.
 */
const MARKER_HINT = /"skill"|"subagent_type"/;

/** Pull both markers out of one parsed line. Anything unexpected is simply not a mention. */
function collectMentions(parsed: unknown, into: Set<string>): void {
  const content = (parsed as { message?: { content?: unknown } })?.message?.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if ((block as { type?: unknown })?.type !== 'tool_use') continue;
    const input = (block as { input?: unknown }).input;
    if (typeof input !== 'object' || input === null) continue;

    // Matched on the input field rather than the tool's name: the tool that
    // spawns an agent has been called both `Task` and `Agent`, and a rename
    // must not quietly starve the village of its work signal.
    const skill = (input as { skill?: unknown }).skill;
    const subagent = (input as { subagent_type?: unknown }).subagent_type;
    if (typeof skill === 'string' && skill !== '') into.add(`skill:${skill}`);
    if (typeof subagent === 'string' && subagent !== '') into.add(`agent:${subagent}`);
  }
}

/**
 * Stream one transcript and report what it says about the project.
 *
 * Read-only and allocation-light: the file is never held in memory whole (the
 * largest on the reference machine is 8.3 MB and there are 486 of them), and
 * a line is only parsed when it could carry a marker or when `cwd` is still
 * unknown. `cwd` is taken from the *first* line that has one rather than the
 * last: within a session it never changes, and scanning every line to confirm
 * that would cost the whole file. Which session's cwd wins across a project
 * is decided by mtime, one layer up.
 *
 * Every failure — a missing file, a permissions error, a stream that dies
 * midway — yields facts rather than throwing. A project whose transcript
 * cannot be read is a project with no news, not a crashed village.
 */
export async function readTranscriptFacts(
  file: string,
  lastActivityMs: number,
): Promise<TranscriptFacts> {
  const mentions = new Set<string>();
  let cwd = '';

  try {
    const lines = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (line === '') continue;
      const needsCwd = cwd === '';
      if (!needsCwd && !MARKER_HINT.test(line)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // A half-written line from a crash. The rest of the file is still good.
      }

      if (needsCwd) {
        const found = (parsed as { cwd?: unknown }).cwd;
        if (typeof found === 'string' && found !== '') cwd = found;
      }
      collectMentions(parsed, mentions);
    }
  } catch {
    // Unreadable, or the stream died partway. Keep whatever was gathered.
  }

  return { lastActivityMs, cwd, helperMentions: [...mentions].sort() };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/transcript.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/bridge/projects/transcript.ts packages/server/src/bridge/projects/transcript.test.ts packages/server/src/bridge/projects/testing
git commit -m "feat(server): read a transcript's work signal, with pinned fixtures"
```

---

## Task 5: The scan cache

**Files:**
- Create: `packages/server/src/bridge/projects/cache.ts`
- Test: `packages/server/src/bridge/projects/cache.test.ts`

**Interfaces:**
- Consumes: `TranscriptFacts` (Task 4), `VillagePaths.scanCachePath` (Task 2).
- Produces: `SCAN_CACHE_VERSION: 1`; `interface CachedTranscript { size: number; mtimeMs: number; facts: TranscriptFacts }`; `interface ScanCache { version: number; files: Record<string, CachedTranscript> }`; `emptyScanCache(): ScanCache`; `loadScanCache(path: string): Promise<ScanCache>`; `saveScanCache(path: string, cache: ScanCache): Promise<void>`; `cachedFacts(cache: ScanCache, file: string, size: number, mtimeMs: number): TranscriptFacts | null`; `rememberFacts(cache: ScanCache, file: string, size: number, mtimeMs: number, facts: TranscriptFacts): void`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/bridge/projects/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSandbox, type Sandbox } from '../../testing/sandbox.js';
import {
  SCAN_CACHE_VERSION, cachedFacts, emptyScanCache, loadScanCache, rememberFacts, saveScanCache,
} from './cache.js';
import type { TranscriptFacts } from './transcript.js';

const FACTS: TranscriptFacts = {
  lastActivityMs: 5000,
  cwd: '/home/dev/work/atlas',
  helperMentions: ['skill:brainstorming'],
};

describe('scan cache', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  it('is a hit when size and mtime both match', () => {
    const cache = emptyScanCache();
    rememberFacts(cache, '/a.jsonl', 100, 5000, FACTS);
    expect(cachedFacts(cache, '/a.jsonl', 100, 5000)).toEqual(FACTS);
  });

  it('is a miss when the file grew', () => {
    const cache = emptyScanCache();
    rememberFacts(cache, '/a.jsonl', 100, 5000, FACTS);
    expect(cachedFacts(cache, '/a.jsonl', 220, 5000)).toBeNull();
  });

  it('is a miss when the file was touched', () => {
    const cache = emptyScanCache();
    rememberFacts(cache, '/a.jsonl', 100, 5000, FACTS);
    expect(cachedFacts(cache, '/a.jsonl', 100, 6000)).toBeNull();
  });

  it('is a miss for a file it has never seen', () => {
    expect(cachedFacts(emptyScanCache(), '/new.jsonl', 1, 1)).toBeNull();
  });

  it('round-trips through disk', async () => {
    const cache = emptyScanCache();
    rememberFacts(cache, '/a.jsonl', 100, 5000, FACTS);
    await saveScanCache(box.paths.scanCachePath, cache);

    const loaded = await loadScanCache(box.paths.scanCachePath);
    expect(cachedFacts(loaded, '/a.jsonl', 100, 5000)).toEqual(FACTS);
  });

  it('starts empty when there is no cache file yet', async () => {
    const loaded = await loadScanCache(join(box.home, 'never-written.json'));
    expect(loaded).toEqual({ version: SCAN_CACHE_VERSION, files: {} });
  });

  it('discards a corrupt cache rather than failing the scan', async () => {
    await writeFile(box.paths.scanCachePath, '{ not json', 'utf8');
    expect(await loadScanCache(box.paths.scanCachePath)).toEqual({ version: SCAN_CACHE_VERSION, files: {} });
  });

  it('discards a cache from a different version — the facts shape may have changed', async () => {
    await writeFile(box.paths.scanCachePath, JSON.stringify({ version: 0, files: { '/a.jsonl': {} } }), 'utf8');
    expect(await loadScanCache(box.paths.scanCachePath)).toEqual({ version: SCAN_CACHE_VERSION, files: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/cache.test.ts`
Expected: FAIL — `Failed to resolve import "./cache.js"`.

- [ ] **Step 3: Write the cache**

Create `packages/server/src/bridge/projects/cache.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TranscriptFacts } from './transcript.js';

/** Bump when TranscriptFacts changes shape. A mismatch throws the whole cache away. */
export const SCAN_CACHE_VERSION = 1;

export interface CachedTranscript {
  size: number;
  mtimeMs: number;
  facts: TranscriptFacts;
}

export interface ScanCache {
  version: number;
  /** Keyed by absolute transcript path. */
  files: Record<string, CachedTranscript>;
}

export function emptyScanCache(): ScanCache {
  return { version: SCAN_CACHE_VERSION, files: {} };
}

/**
 * The stored facts for a file that has not changed, or null.
 *
 * Size *and* mtime, not either alone: an edit that happens to leave the byte
 * count identical still moves the mtime, and a filesystem with coarse mtime
 * granularity still moves the size. Together they are as good as this needs
 * to be — a missed change costs one stale reading, corrected five minutes later.
 */
export function cachedFacts(
  cache: ScanCache,
  file: string,
  size: number,
  mtimeMs: number,
): TranscriptFacts | null {
  const entry = cache.files[file];
  if (!entry || entry.size !== size || entry.mtimeMs !== mtimeMs) return null;
  return entry.facts;
}

export function rememberFacts(
  cache: ScanCache,
  file: string,
  size: number,
  mtimeMs: number,
  facts: TranscriptFacts,
): void {
  cache.files[file] = { size, mtimeMs, facts };
}

/**
 * Read the cache, or start fresh. A corrupt or foreign-version cache is
 * discarded silently: it is an optimisation, and the only cost of losing it
 * is one slower scan (~1s on the reference machine).
 */
export async function loadScanCache(path: string): Promise<ScanCache> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<ScanCache>;
    if (parsed?.version !== SCAN_CACHE_VERSION) return emptyScanCache();
    if (typeof parsed.files !== 'object' || parsed.files === null) return emptyScanCache();
    return { version: SCAN_CACHE_VERSION, files: parsed.files };
  } catch {
    return emptyScanCache();
  }
}

/** Best-effort. A cache that cannot be written costs a slower next scan, nothing more. */
export async function saveScanCache(path: string, cache: ScanCache): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(cache), 'utf8');
  } catch {
    // The game data dir is unwritable. The village still runs.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/cache.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/bridge/projects/cache.ts packages/server/src/bridge/projects/cache.test.ts
git commit -m "feat(server): a per-file transcript cache keyed on size and mtime"
```

---

## Task 6: Name resolution and the project scan

**Files:**
- Create: `packages/server/src/bridge/projects/resolve.ts`
- Create: `packages/server/src/bridge/projects/scan.ts`
- Test: `packages/server/src/bridge/projects/resolve.test.ts`
- Test: `packages/server/src/bridge/projects/scan.test.ts`

**Interfaces:**
- Consumes: `listProjectEntries` (Task 3), `readTranscriptFacts` / `TranscriptFacts` (Task 4), the whole cache module (Task 5), `VillagePaths` (Task 2).
- Produces:
  - `helperRoster(creatures: readonly { id: string }[]): ReadonlySet<string>`
  - `interface ResolvedMentions { helperIds: string[]; unresolved: number }`
  - `resolveMentions(mentions: Iterable<string>, roster: ReadonlySet<string>): ResolvedMentions`
  - `lastSegment(path: string): string`
  - `interface ProjectFacts { project: string; displayName: string; sourcePath: string; lastWorkedAt: number; helperIds: string[]; unresolvedHelpers: number }`
  - `interface ProjectScan { projects: ProjectFacts[]; cache: ScanCache }`
  - `scanProjects(paths: VillagePaths, roster: ReadonlySet<string>, cache: ScanCache): Promise<ProjectScan>`

- [ ] **Step 1: Write the failing resolve test**

Create `packages/server/src/bridge/projects/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { helperRoster, lastSegment, resolveMentions } from './resolve.js';

const ROSTER = helperRoster([
  { id: 'skill:brainstorming' },
  { id: 'skill:writing-plans' },
  { id: 'agent:code-reviewer' },
]);

describe('resolveMentions', () => {
  it('links a mention that matches a helper on disk', () => {
    expect(resolveMentions(['skill:brainstorming'], ROSTER))
      .toEqual({ helperIds: ['skill:brainstorming'], unresolved: 0 });
  });

  it('counts a plugin-prefixed skill as activity but links nothing', () => {
    expect(resolveMentions(['skill:anthropic-skills:xlsx'], ROSTER))
      .toEqual({ helperIds: [], unresolved: 1 });
  });

  it('counts built-in agent types as unresolved — they have no file', () => {
    expect(resolveMentions(['agent:general-purpose', 'agent:Explore', 'agent:Plan'], ROSTER))
      .toEqual({ helperIds: [], unresolved: 3 });
  });

  it('never lets a skill name resolve against an agent of the same name', () => {
    expect(resolveMentions(['agent:brainstorming'], ROSTER))
      .toEqual({ helperIds: [], unresolved: 1 });
  });

  it('sorts and dedupes the links, so the same project always reads the same', () => {
    const result = resolveMentions(
      ['skill:writing-plans', 'agent:code-reviewer', 'skill:brainstorming', 'skill:writing-plans'],
      ROSTER,
    );
    expect(result.helperIds).toEqual(['agent:code-reviewer', 'skill:brainstorming', 'skill:writing-plans']);
  });

  it('ignores project creatures when building the roster — a project is not a helper', () => {
    const roster = helperRoster([{ id: 'skill:a' }, { id: 'project:some-repo' }]);
    expect(resolveMentions(['project:some-repo'], roster).helperIds).toEqual([]);
  });
});

describe('lastSegment', () => {
  it('reads a POSIX path', () => {
    expect(lastSegment('/home/dev/work/atlas')).toBe('atlas');
  });

  it('reads a Windows path even when running on POSIX', () => {
    expect(lastSegment('C:\\Users\\dev\\Projects\\atlas')).toBe('atlas');
  });

  it('ignores a trailing separator', () => {
    expect(lastSegment('/home/dev/work/atlas/')).toBe('atlas');
  });

  it('gives back nothing for an empty path', () => {
    expect(lastSegment('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/resolve.test.ts`
Expected: FAIL — `Failed to resolve import "./resolve.js"`.

- [ ] **Step 3: Write the resolver**

Create `packages/server/src/bridge/projects/resolve.ts`:

```ts
/**
 * The ids of every helper the bridge actually loaded. A mention becomes a
 * link only against this set — the roster is the village's own truth about
 * what exists, so the rule is "the village links what it can see" rather
 * than a hardcoded list of built-in names to exclude (spec §3).
 */
export function helperRoster(creatures: readonly { id: string }[]): ReadonlySet<string> {
  return new Set(
    creatures.map((c) => c.id).filter((id) => id.startsWith('skill:') || id.startsWith('agent:')),
  );
}

export interface ResolvedMentions {
  /** Sorted, deduped helper creature ids. */
  helperIds: string[];
  /**
   * Mentions that matched nothing on disk — built-ins, plugin-prefixed names,
   * helpers the player has since deleted. Kept as a count so the number is
   * never silently lost; whether the UI shows it is a polish call (spec §3).
   */
  unresolved: number;
}

/**
 * Mentions arrive already kinded (`skill:x`, `agent:y`) from the transcript
 * parser, which is why this is a set lookup and not a name search. The kind
 * is part of the match on purpose: a skill and an agent may share a name, and
 * a skill mention must never light up the agent that happens to be called
 * the same thing.
 */
export function resolveMentions(
  mentions: Iterable<string>,
  roster: ReadonlySet<string>,
): ResolvedMentions {
  const helperIds = new Set<string>();
  const missed = new Set<string>();

  for (const mention of mentions) {
    if (roster.has(mention)) helperIds.add(mention);
    else missed.add(mention);
  }

  return { helperIds: [...helperIds].sort(), unresolved: missed.size };
}

/**
 * The last segment of a path, splitting on both separators.
 *
 * Not `node:path`'s basename: a transcript's `cwd` is whatever string the
 * machine that wrote it used, and on the reference machine that is
 * `C:\Users\...`. POSIX `basename` treats those backslashes as ordinary
 * characters and hands back the whole path as the project's display name.
 */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part !== '');
  return parts.at(-1) ?? '';
}
```

- [ ] **Step 4: Run the resolve test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/resolve.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing scan test**

Create `packages/server/src/bridge/projects/scan.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { utimes } from 'node:fs/promises';
import { makeSandbox, type Sandbox } from '../../testing/sandbox.js';
import { emptyScanCache } from './cache.js';
import { helperRoster } from './resolve.js';
import { scanProjects } from './scan.js';

const ROSTER = helperRoster([{ id: 'skill:brainstorming' }, { id: 'agent:code-reviewer' }]);

/** One assistant line that invokes a skill. */
const skillLine = (cwd: string, skill: string) => ({
  type: 'assistant',
  cwd,
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
});

/** One assistant line that spawns an agent. */
const agentLine = (cwd: string, subagent_type: string) => ({
  type: 'assistant',
  cwd,
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type } }] },
});

describe('scanProjects', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  it('finds nothing when there are no projects', async () => {
    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects).toEqual([]);
  });

  it('names a project after the basename of its cwd, not its encoded folder', async () => {
    await box.writeTranscript('C--Users-dev-work-atlas', 's1', [skillLine('/home/dev/work/atlas', 'brainstorming')]);

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects).toHaveLength(1);
    expect(projects[0]!.displayName).toBe('atlas');
    expect(projects[0]!.project).toBe('C--Users-dev-work-atlas');
    expect(projects[0]!.sourcePath).toBe('/home/dev/work/atlas');
  });

  it('falls back to the encoded entry name when no line ever gave a cwd', async () => {
    await box.writeTranscript('C--Users-dev-work-mystery', 's1', [
      { type: 'summary', summary: 'no cwd anywhere' },
    ]);

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects[0]!.displayName).toBe('C--Users-dev-work-mystery');
    expect(projects[0]!.sourcePath).toBe('');
  });

  it('links only the helpers that exist, and tallies the rest', async () => {
    await box.writeTranscript('proj', 's1', [
      skillLine('/w/proj', 'brainstorming'),
      agentLine('/w/proj', 'code-reviewer'),
      agentLine('/w/proj', 'general-purpose'),
      skillLine('/w/proj', 'anthropic-skills:xlsx'),
    ]);

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects[0]!.helperIds).toEqual(['agent:code-reviewer', 'skill:brainstorming']);
    expect(projects[0]!.unresolvedHelpers).toBe(2);
  });

  it('merges a worktree entry into its parent, links and all', async () => {
    await box.writeTranscript('proj', 's1', [skillLine('/w/proj', 'brainstorming')]);
    await box.writeTranscript('proj--claude-worktrees-feat-abc', 's2', [agentLine('/w/proj', 'code-reviewer')]);

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects).toHaveLength(1);
    expect(projects[0]!.helperIds).toEqual(['agent:code-reviewer', 'skill:brainstorming']);
  });

  it('takes lastWorkedAt from the newest transcript across the whole project', async () => {
    const older = await box.writeTranscript('proj', 'old', [skillLine('/w/proj', 'brainstorming')]);
    const newer = await box.writeTranscript('proj--claude-worktrees-x-abc', 'new', [skillLine('/w/proj', 'brainstorming')]);
    await utimes(older, new Date(1_000_000), new Date(1_000_000));
    await utimes(newer, new Date(9_000_000), new Date(9_000_000));

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects[0]!.lastWorkedAt).toBe(9_000_000);
  });

  it('takes cwd from the newest transcript when two sessions disagree', async () => {
    const older = await box.writeTranscript('proj', 'old', [skillLine('/w/old-path', 'brainstorming')]);
    const newer = await box.writeTranscript('proj', 'new', [skillLine('/w/new-path', 'brainstorming')]);
    await utimes(older, new Date(1_000_000), new Date(1_000_000));
    await utimes(newer, new Date(9_000_000), new Date(9_000_000));

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects[0]!.sourcePath).toBe('/w/new-path');
  });

  it('reuses cached facts for an unchanged file and re-reads a changed one', async () => {
    const file = await box.writeTranscript('proj', 's1', [skillLine('/w/proj', 'brainstorming')]);

    const first = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(first.cache.files[file]).toBeDefined();

    // Same cache, untouched file: the entry survives and the answer is identical.
    const second = await scanProjects(box.paths, ROSTER, first.cache);
    expect(second.projects[0]!.helperIds).toEqual(['skill:brainstorming']);

    // Rewrite it with a different helper: the change must be picked up.
    await box.writeTranscript('proj', 's1', [agentLine('/w/proj', 'code-reviewer')]);
    const third = await scanProjects(box.paths, ROSTER, second.cache);
    expect(third.projects[0]!.helperIds).toEqual(['agent:code-reviewer']);
  });

  it('forgets files that are gone, so the cache cannot grow without bound', async () => {
    const file = await box.writeTranscript('gone', 's1', [skillLine('/w/gone', 'brainstorming')]);
    const first = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(first.cache.files[file]).toBeDefined();

    const { rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await rm(join(box.paths.projectsDir, 'gone'), { recursive: true, force: true });

    const second = await scanProjects(box.paths, ROSTER, first.cache);
    expect(second.cache.files[file]).toBeUndefined();
    expect(second.projects).toEqual([]);
  });

  it('sorts projects by id so the village is the same on every boot', async () => {
    await box.writeTranscript('zeta', 's1', [skillLine('/w/z', 'brainstorming')]);
    await box.writeTranscript('alpha', 's1', [skillLine('/w/a', 'brainstorming')]);

    const { projects } = await scanProjects(box.paths, ROSTER, emptyScanCache());
    expect(projects.map((p) => p.project)).toEqual(['alpha', 'zeta']);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/scan.test.ts`
Expected: FAIL — `Failed to resolve import "./scan.js"`.

- [ ] **Step 7: Write the scan**

Create `packages/server/src/bridge/projects/scan.ts`:

```ts
import { stat } from 'node:fs/promises';
import type { VillagePaths } from '../../config/paths.js';
import { cachedFacts, emptyScanCache, rememberFacts, type ScanCache } from './cache.js';
import { listProjectEntries } from './entries.js';
import { lastSegment, resolveMentions } from './resolve.js';
import { readTranscriptFacts } from './transcript.js';

export interface ProjectFacts {
  /** The folded entry name — unique, stable, and what the creature id is built from. */
  project: string;
  /** What the player sees: the basename of the real path, or the entry name. */
  displayName: string;
  /** The project's real folder, or '' when unknown. Read, never written. */
  sourcePath: string;
  /** Newest transcript mtime across every folded session. 0 when unknown. */
  lastWorkedAt: number;
  helperIds: string[];
  unresolvedHelpers: number;
}

export interface ProjectScan {
  projects: ProjectFacts[];
  /**
   * A *fresh* cache holding only the files this scan actually saw. Built anew
   * rather than mutated so a deleted transcript's entry disappears with it —
   * a cache keyed by path that is only ever added to grows for the life of the
   * install.
   */
  cache: ScanCache;
}

/** Size and mtime, or null when the file vanished between listing and stat. */
async function statOf(file: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const info = await stat(file);
    return { size: info.size, mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * Read-only scan of `~/.claude/projects`, one `ProjectFacts` per project.
 *
 * Runs at boot and on the ordinary 5-minute tick. A cold scan of the
 * reference machine's 486 transcripts / 200 MB costs about a second; every
 * scan after it costs a `stat` per file, because unchanged files come back
 * from `previous`.
 */
export async function scanProjects(
  paths: VillagePaths,
  roster: ReadonlySet<string>,
  previous: ScanCache,
): Promise<ProjectScan> {
  const cache = emptyScanCache();
  const projects: ProjectFacts[] = [];

  for (const entry of await listProjectEntries(paths.projectsDir)) {
    const mentions = new Set<string>();
    let lastWorkedAt = 0;
    // The cwd from the newest transcript that had one — "the newest one wins"
    // (spec §2). Tracked with its own stamp rather than by scan order, because
    // the file list is sorted by path, not by time.
    let cwd = '';
    let cwdAt = -1;

    for (const file of entry.transcripts) {
      const info = await statOf(file);
      if (!info) continue;

      const facts =
        cachedFacts(previous, file, info.size, info.mtimeMs) ??
        (await readTranscriptFacts(file, info.mtimeMs));
      rememberFacts(cache, file, info.size, info.mtimeMs, facts);

      for (const mention of facts.helperMentions) mentions.add(mention);
      if (facts.lastActivityMs > lastWorkedAt) lastWorkedAt = facts.lastActivityMs;
      if (facts.cwd !== '' && facts.lastActivityMs > cwdAt) {
        cwd = facts.cwd;
        cwdAt = facts.lastActivityMs;
      }
    }

    const { helperIds, unresolved } = resolveMentions(mentions, roster);
    projects.push({
      project: entry.project,
      // The encoded entry name is ugly but true — decoding it is ambiguous,
      // because a dash in the folder name may have been a dash or a separator.
      displayName: lastSegment(cwd) || entry.project,
      sourcePath: cwd,
      lastWorkedAt,
      helperIds,
      unresolvedHelpers: unresolved,
    });
  }

  return { projects, cache };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/scan.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 9: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: 970 passed + 1 skipped, typecheck clean.

```bash
git add packages/server/src/bridge/projects/resolve.ts packages/server/src/bridge/projects/resolve.test.ts packages/server/src/bridge/projects/scan.ts packages/server/src/bridge/projects/scan.test.ts
git commit -m "feat(server): resolve helper mentions against the roster and scan every project"
```

---

## Task 7: Projects become creatures

**Files:**
- Create: `packages/server/src/bridge/projects/creature.ts`
- Modify: `packages/server/src/bridge/scan.ts`
- Test: `packages/server/src/bridge/projects/creature.test.ts`
- Test: `packages/server/src/bridge/scan.test.ts` (append)

**Interfaces:**
- Consumes: `ProjectFacts` / `scanProjects` (Task 6), `helperRoster` (Task 6), `ScanCache` / `emptyScanCache` (Task 5), the `project` kind and its optional fields (Task 1).
- Produces: `projectCreatureId(project: string): string` returning `project:<folded entry name>`; `creatureFromProject(facts: ProjectFacts, now: number): Creature`. `ScanResult` gains `cache: ScanCache`; `scanVillage(paths, now, previousCache?: ScanCache)` gains its third parameter, defaulting to `emptyScanCache()`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/bridge/projects/creature.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateAppearance } from '@village/core';
import { creatureFromProject, projectCreatureId } from './creature.js';
import type { ProjectFacts } from './scan.js';

const FACTS: ProjectFacts = {
  project: 'C--Users-dev-work-atlas',
  displayName: 'atlas',
  sourcePath: '/home/dev/work/atlas',
  lastWorkedAt: 1_724_000_000_000,
  helperIds: ['skill:brainstorming'],
  unresolvedHelpers: 2,
};

describe('creatureFromProject', () => {
  it('builds its id from the stable folded entry name', () => {
    expect(creatureFromProject(FACTS, 500).id).toBe('project:C--Users-dev-work-atlas');
    expect(projectCreatureId('C--Users-dev-work-atlas')).toBe('project:C--Users-dev-work-atlas');
  });

  it('shows the pretty name and points sourcePath at the real folder', () => {
    const creature = creatureFromProject(FACTS, 500);
    expect(creature.name).toBe('atlas');
    expect(creature.sourcePath).toBe('/home/dev/work/atlas');
  });

  it('carries the work signal and the link list', () => {
    const creature = creatureFromProject(FACTS, 500);
    expect(creature.lastWorkedAt).toBe(1_724_000_000_000);
    expect(creature.helperIds).toEqual(['skill:brainstorming']);
    expect(creature.unresolvedHelpers).toBe(2);
  });

  it('is a grounded adult, never winged — wings are the agent tell', () => {
    const creature = creatureFromProject(FACTS, 500);
    expect(creature.kind).toBe('project');
    expect(creature.stage).toBe('adult');
    expect(creature.appearance.winged).toBe(false);
  });

  it('seeds its look on the folded entry name, so moving the folder never restyles it', () => {
    const moved = { ...FACTS, displayName: 'atlas-renamed', sourcePath: '/elsewhere/atlas-renamed' };
    expect(creatureFromProject(moved, 500).appearance)
      .toEqual(generateAppearance({ kind: 'project', name: FACTS.project }));
  });

  it('never carries friendships — those stay a helper-only mechanic in v1', () => {
    expect(creatureFromProject(FACTS, 500).friendships).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/projects/creature.test.ts`
Expected: FAIL — `Failed to resolve import "./creature.js"`.

- [ ] **Step 3: Write the project creature builder**

Create `packages/server/src/bridge/projects/creature.ts`:

```ts
import { generateAppearance, type Creature } from '@village/core';
import { STARTING_STATS } from '../creature.js';
import type { ProjectFacts } from './scan.js';

export function projectCreatureId(project: string): string {
  return `project:${project}`;
}

/**
 * A project that already has sessions behind it is working software, so its
 * creature is born an adult — the same rule the helper bridge uses for a file
 * that already exists on disk.
 *
 * Two names, deliberately: the **id and the appearance** are keyed to the
 * folded entry name, which never changes while the folder exists, and the
 * **displayed name** comes from the real path. Move or rename the folder and
 * the villager keeps its face and its history; only its label follows.
 *
 * No health or mood is derived here. Those are pure functions of
 * `lastWorkedAt` evaluated at tick time in M6, so only the raw signal is
 * stored and tuning the decay curve never needs a migration (spec §1).
 */
export function creatureFromProject(facts: ProjectFacts, now: number): Creature {
  return {
    id: projectCreatureId(facts.project),
    kind: 'project',
    name: facts.displayName,
    nickname: '',
    appearance: generateAppearance({ kind: 'project', name: facts.project }),
    stats: { ...STARTING_STATS },
    stage: 'adult',
    personality: null,
    sourcePath: facts.sourcePath,
    friendships: {},
    lastSeenAt: now,
    lastWorkedAt: facts.lastWorkedAt,
    helperIds: facts.helperIds,
    unresolvedHelpers: facts.unresolvedHelpers,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/projects/creature.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing scan-integration test**

Append to `packages/server/src/bridge/scan.test.ts` (add the imports it needs
at the top of the file: `emptyScanCache` from `./projects/cache.js`, and
`skillFixture` / `agentFixture` if not already imported):

```ts
describe('scanVillage with projects', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  const skillLine = (cwd: string, skill: string) => ({
    type: 'assistant',
    cwd,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
  });

  it('returns projects alongside helpers, all in one sorted list', async () => {
    await box.writeSkill('brainstorming', skillFixture('brainstorming'));
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);

    const result = await scanVillage(box.paths, 1000, emptyScanCache());
    expect(result.creatures.map((c) => c.id)).toEqual([
      'project:C--w-atlas', 'skill:brainstorming',
    ]);
  });

  it('links a project to a helper only when that helper was scanned', async () => {
    await box.writeSkill('brainstorming', skillFixture('brainstorming'));
    await box.writeTranscript('C--w-atlas', 's1', [
      skillLine('/w/atlas', 'brainstorming'),
      skillLine('/w/atlas', 'never-installed'),
    ]);

    const result = await scanVillage(box.paths, 1000, emptyScanCache());
    const project = result.creatures.find((c) => c.kind === 'project')!;
    expect(project.helperIds).toEqual(['skill:brainstorming']);
    expect(project.unresolvedHelpers).toBe(1);
  });

  it('hands back a cache the next scan can reuse', async () => {
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);
    const first = await scanVillage(box.paths, 1000, emptyScanCache());
    expect(Object.keys(first.cache.files)).toHaveLength(1);

    const second = await scanVillage(box.paths, 2000, first.cache);
    expect(second.creatures.map((c) => c.id)).toEqual(['project:C--w-atlas']);
  });

  it('still works on a machine with no projects directory at all', async () => {
    await box.writeAgent('code-reviewer', agentFixture('code-reviewer'));
    const result = await scanVillage(box.paths, 1000);
    expect(result.creatures.map((c) => c.id)).toEqual(['agent:code-reviewer']);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/scan.test.ts`
Expected: FAIL — `scanVillage` takes two arguments and `result.cache` is undefined.

- [ ] **Step 7: Wire the project scan into `scanVillage`**

In `packages/server/src/bridge/scan.ts`, add to the imports:

```ts
import { emptyScanCache, type ScanCache } from './projects/cache.js';
import { creatureFromProject } from './projects/creature.js';
import { helperRoster } from './projects/resolve.js';
import { scanProjects } from './projects/scan.js';
```

Add the cache to `ScanResult`:

```ts
export interface ScanResult {
  creatures: Creature[];
  problems: ImportProblem[];
  /** Transcript facts to hand back to the next scan. See projects/cache.ts. */
  cache: ScanCache;
}
```

Then replace the body of `scanVillage` with:

```ts
/**
 * Read-only. Scans user scope first, then project scope, so a project copy wins
 * a name collision — that matches how Claude Code itself resolves them.
 *
 * Helpers are scanned before projects and not merely for tidiness: a mention
 * in a transcript becomes a *link* only against a helper the bridge has
 * actually loaded, so the roster has to exist before the transcripts are read
 * (spec §3).
 */
export async function scanVillage(
  paths: VillagePaths,
  now: number,
  previousCache: ScanCache = emptyScanCache(),
): Promise<ScanResult> {
  const found: ScanResult = { creatures: [], problems: [], cache: emptyScanCache() };

  await scanSkillsDir(paths.userSkillsDir, now, found);
  await scanAgentsDir(paths.userAgentsDir, now, found);
  if (paths.projectSkillsDir) await scanSkillsDir(paths.projectSkillsDir, now, found);
  if (paths.projectAgentsDir) await scanAgentsDir(paths.projectAgentsDir, now, found);

  const byId = new Map<string, Creature>();
  for (const creature of found.creatures) byId.set(creature.id, creature);

  const { projects, cache } = await scanProjects(paths, helperRoster([...byId.values()]), previousCache);
  for (const facts of projects) {
    const creature = creatureFromProject(facts, now);
    byId.set(creature.id, creature);
  }

  return {
    creatures: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    problems: found.problems,
    cache,
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/scan.test.ts`
Expected: PASS, including the four new cases.

- [ ] **Step 9: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: green. Some existing tests construct a `ScanResult` literal by hand
and will now fail typecheck for a missing `cache` — add `cache: emptyScanCache()`
to each. Do not make the field optional; a scan that forgets to hand its cache
back silently reparses 200 MB every five minutes.

```bash
git add packages/server/src/bridge/projects/creature.ts packages/server/src/bridge/projects/creature.test.ts packages/server/src/bridge/scan.ts packages/server/src/bridge/scan.test.ts
git commit -m "feat(server): projects move in as creatures beside their helpers"
```

---

## Task 8: Reconcile keeps a project's facts fresh without burying the event log

**Files:**
- Modify: `packages/server/src/bridge/reconcile.ts`
- Test: `packages/server/src/bridge/reconcile.test.ts` (append)

**Interfaces:**
- Consumes: `ScanResult` with its `cache` field (Task 7), project creatures (Task 7), the `retired` field (Task 1).
- Produces: no new exports. `reconcile()` keeps its signature `(state, scan, now) => ReconcileResult`; its behaviour for projects changes.

**The problem this task exists to solve:** `reconcile` currently keeps an
existing creature *verbatim* apart from `sourcePath`, which is exactly right
for a helper — editing a skill teaches its creature something, it does not
replace the creature. A project is different: `lastWorkedAt`, `helperIds` and
`unresolvedHelpers` are re-derived from disk on every scan and must land, or
the village freezes on whatever the first boot saw. But the same fields move
constantly, so refreshing them must **not** write an event — a `resynced` line
every five minutes for eighteen projects buries the log the notice board is
composed from.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/bridge/reconcile.test.ts`. Add whatever imports
are missing at the top (`emptyScanCache` from `./projects/cache.js`, and
`Creature` from `@village/core` if it is not already imported):

```ts
describe('reconcile with projects', () => {
  const project = (over: Partial<Creature> = {}): Creature => ({
    id: 'project:C--w-atlas',
    kind: 'project',
    name: 'atlas',
    nickname: '',
    appearance: generateAppearance({ kind: 'project', name: 'C--w-atlas' }),
    stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
    stage: 'adult',
    personality: null,
    sourcePath: '/w/atlas',
    friendships: {},
    lastSeenAt: 0,
    lastWorkedAt: 1000,
    helperIds: [],
    unresolvedHelpers: 0,
    ...over,
  });

  const scanOf = (...creatures: Creature[]) => ({ creatures, problems: [], cache: emptyScanCache() });

  it('keeps a project\'s bond, nickname and stats across a rescan', () => {
    const lived = project({ nickname: 'Atlas', stats: { mood: 12, energy: 34, bond: 56, xp: 78 } });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const result = reconcile(state, scanOf(project({ lastWorkedAt: 9999 })), 500);
    const after = result.state.creatures[lived.id]!;
    expect(after.nickname).toBe('Atlas');
    expect(after.stats).toEqual({ mood: 12, energy: 34, bond: 56, xp: 78 });
  });

  it('refreshes the work signal and the links, which are re-derived every scan', () => {
    const lived = project({ lastWorkedAt: 1000, helperIds: [], unresolvedHelpers: 0 });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const found = project({ lastWorkedAt: 9999, helperIds: ['skill:brainstorming'], unresolvedHelpers: 3 });
    const after = reconcile(state, scanOf(found), 500).state.creatures[lived.id]!;
    expect(after.lastWorkedAt).toBe(9999);
    expect(after.helperIds).toEqual(['skill:brainstorming']);
    expect(after.unresolvedHelpers).toBe(3);
  });

  it('writes no event when only the work signal moved — the log is not a heartbeat', () => {
    const lived = project({ lastWorkedAt: 1000 });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const result = reconcile(state, scanOf(project({ lastWorkedAt: 9999 })), 500);
    expect(result.events).toEqual([]);
  });

  it('still writes resynced when the project folder itself moved', () => {
    const lived = project({ sourcePath: '/w/atlas' });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const result = reconcile(state, scanOf(project({ sourcePath: '/elsewhere/atlas', name: 'atlas' })), 500);
    expect(result.events.map((e) => e.type)).toEqual(['resynced']);
  });

  it('follows a renamed folder in the label', () => {
    const lived = project({ name: 'atlas', sourcePath: '/w/atlas' });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const found = project({ name: 'atlas-renamed', sourcePath: '/w/atlas-renamed' });
    expect(reconcile(state, scanOf(found), 500).state.creatures[lived.id]!.name).toBe('atlas-renamed');
  });

  it('leaves a retired project retired — discovery must not re-adopt it', () => {
    const lived = project({ retired: true });
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const after = reconcile(state, scanOf(project()), 500).state.creatures[lived.id]!;
    expect(after.retired).toBe(true);
  });

  it('releases a project whose transcripts are gone, like any other creature', () => {
    const lived = project();
    const state = { ...emptyState(0), creatures: { [lived.id]: lived } };

    const result = reconcile(state, scanOf(), 500);
    expect(result.released.map((c) => c.id)).toEqual([lived.id]);
    expect(result.state.creatures[lived.id]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/bridge/reconcile.test.ts`
Expected: FAIL — `expected 1000 to be 9999` on the refresh case (reconcile
currently keeps the stored creature verbatim).

- [ ] **Step 3: Teach reconcile the difference between a helper and a project**

In `packages/server/src/bridge/reconcile.ts`, add this function above
`export function reconcile`:

```ts
/**
 * The stored creature with whatever the scan legitimately re-derives folded
 * in. The identity rule is unchanged and is the important one — stats, bond,
 * nickname, personality, friendships and appearance all survive a rescan.
 *
 * A helper's only re-derived field is its path. A project also re-derives its
 * label and its whole work signal, because those *are* what a scan reads off
 * disk: freeze them and the village stops noticing that anyone worked.
 */
function refreshed(existing: Creature, found: Creature): Creature {
  if (found.kind !== 'project') {
    return existing.sourcePath === found.sourcePath
      ? existing
      : { ...existing, sourcePath: found.sourcePath };
  }

  return {
    ...existing,
    name: found.name,
    sourcePath: found.sourcePath,
    lastWorkedAt: found.lastWorkedAt,
    helperIds: found.helperIds,
    unresolvedHelpers: found.unresolvedHelpers,
  };
}
```

Then replace the body of the `for (const found of scan.creatures)` loop with:

```ts
  for (const found of scan.creatures) {
    const existing = state.creatures[found.id];
    if (!existing) {
      creatures[found.id] = found;
      events.push({ at: now, type: 'moved-in', creatureId: found.id });
      continue;
    }

    creatures[found.id] = refreshed(existing, found);

    // Only a *moved* source is worth a line. A project's work signal changes
    // on almost every scan, and an event per project per five minutes would
    // bury the log the notice board is composed from under a heartbeat.
    if (existing.sourcePath !== found.sourcePath) {
      events.push({
        at: now,
        type: 'resynced',
        creatureId: found.id,
        detail: `Source moved to ${found.sourcePath}`,
      });
    }
  }
```

Note what `refreshed` does **not** copy: `retired` is absent from the spread's
overrides, so the stored value survives and a released project is never
re-adopted by discovery (spec §2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/bridge/reconcile.test.ts`
Expected: PASS, including every pre-existing helper case — the helper branch
of `refreshed` is the old behaviour, moved rather than changed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/bridge/reconcile.ts packages/server/src/bridge/reconcile.test.ts
git commit -m "feat(server): a project's work signal refreshes on every scan, quietly"
```

---

## Task 9: The village holds the cache, and never shadows a project

**Files:**
- Modify: `packages/server/src/village.ts`
- Test: `packages/server/src/village.test.ts` (append)

**Interfaces:**
- Consumes: `scanVillage(paths, now, previousCache)` and `ScanResult.cache` (Task 7), `loadScanCache` / `saveScanCache` (Task 5).
- Produces: no new exports. `createVillage` gains an in-memory scan cache, persisted to `paths.scanCachePath`.

**Two defects this closes.** `refresh()` currently mirrors *every* scanned
creature into the shadow directory with `copyFile(creature.sourcePath, …)`.
A project's `sourcePath` is a directory, so the copy throws `EISDIR` and is
swallowed — harmless, but it creates an empty shadow folder per project and
does that work again every five minutes. Worse, `archivePathFor` would file a
released project under the *agent* naming branch (`<name>.md`), because
`fileNameFor` only knows two kinds. Projects have no file to mirror; the fix
is to say so rather than to teach the archive a third shape.

And without a held cache, every refresh reparses all 200 MB — the cache module
from Task 5 does nothing until someone keeps it.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/village.test.ts`:

```ts
describe('village with projects', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  const skillLine = (cwd: string, skill: string) => ({
    type: 'assistant',
    cwd,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
  });

  it('brings projects into the village at boot', async () => {
    await box.writeSkill('brainstorming', skillFixture('brainstorming'));
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);

    const village = await createVillage({ paths: box.paths, now: () => 1000 });
    const project = village.getState().creatures['project:C--w-atlas'];
    expect(project?.name).toBe('atlas');
    expect(project?.helperIds).toEqual(['skill:brainstorming']);
    await village.close();
  });

  it('never mirrors a project into the shadow directory — there is no file to mirror', async () => {
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);

    const village = await createVillage({ paths: box.paths, now: () => 1000 });
    await village.close();

    const { readdir } = await import('node:fs/promises');
    const shadowed = await readdir(box.paths.shadowDir).catch(() => [] as string[]);
    expect(shadowed).not.toContain('project');
  });

  it('writes a scan cache the next boot can reuse', async () => {
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);

    const village = await createVillage({ paths: box.paths, now: () => 1000 });
    await village.refresh();
    await village.close();

    const { readFile } = await import('node:fs/promises');
    const cache = JSON.parse(await readFile(box.paths.scanCachePath, 'utf8'));
    expect(Object.keys(cache.files)).toHaveLength(1);
  });

  it('picks up new work on a later refresh', async () => {
    await box.writeSkill('brainstorming', skillFixture('brainstorming'));
    await box.writeSkill('writing-plans', skillFixture('writing-plans'));
    await box.writeTranscript('C--w-atlas', 's1', [skillLine('/w/atlas', 'brainstorming')]);

    const village = await createVillage({ paths: box.paths, now: () => 1000 });
    await box.writeTranscript('C--w-atlas', 's2', [skillLine('/w/atlas', 'writing-plans')]);
    await village.refresh();

    expect(village.getState().creatures['project:C--w-atlas']!.helperIds)
      .toEqual(['skill:brainstorming', 'skill:writing-plans']);
    await village.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: FAIL — no `scan-cache.json` is written, and the shadow directory
contains a `project` folder.

- [ ] **Step 3: Hold the cache and skip projects in the mirror**

In `packages/server/src/village.ts`, add to the imports:

```ts
import { loadScanCache, saveScanCache, type ScanCache } from './bridge/projects/cache.js';
```

Inside `createVillage`, immediately after `const loaded = await loadState(paths, now());`, add:

```ts
  /**
   * Transcript facts from the last scan, so a rescan stats each file instead
   * of reparsing it. Cold, this is ~1s over the reference machine's 200 MB;
   * warm it is a few hundred stat calls. Held in memory and mirrored to disk
   * so a restart starts warm too.
   */
  let scanCache: ScanCache = await loadScanCache(paths.scanCachePath);
```

Then replace the body of `const refresh = async () => { … }` with:

```ts
  const refresh = async () => {
    const at = now();
    const scan = await scanVillage(paths, at, scanCache);
    scanCache = scan.cache;

    // Every creature on disk is re-mirrored on every refresh, so the shadow copy
    // never goes stale — it always holds the file's latest content, not just what
    // it looked like when first imported. Mirroring straight from the scan covers
    // exactly the creatures reconcile is about to keep, since reconcile takes
    // each one's path from the scan and only ever adds or drops whole creatures.
    //
    // Projects are exempt: a project's sourcePath is a *folder* the game
    // promises never to touch, and there is no single file that is "the
    // project" to keep a last-known copy of.
    for (const creature of scan.creatures) {
      if (creature.kind === 'project') continue;
      await updateShadow(paths, creature);
    }

    // Fold the scan in and commit with nothing awaited in between. The scan and
    // the mirroring above take real time, and a chat, a persona card or a ledger
    // spend may well have committed while they ran — reconciling a copy of
    // `state` read before all that would revert every one of them, and then save
    // the result as the newest truth.
    const result = reconcile(state, scan, at);
    await commit(result.state, result.events);

    // Departed creatures' mirrors are promoted to the archive afterwards: the
    // mirror is still on disk, and this keeps the read-modify-write above
    // uninterrupted. reconcile() guarantees a creature id is either present
    // (mirrored above) or departed (archived here), never both, so the two loops
    // never touch the same file. A departed project had no mirror to promote.
    for (const creature of result.released) {
      if (creature.kind === 'project') continue;
      await archiveFromShadow(paths, creature.kind, creature.name);
    }

    // Written after the commit, and never allowed to fail the refresh: a cache
    // that did not save costs one slower scan, which is not worth losing a
    // village refresh over.
    await saveScanCache(paths.scanCachePath, scanCache);
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: PASS, including the four new cases.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: green.

```bash
git add packages/server/src/village.ts packages/server/src/village.test.ts
git commit -m "feat(server): the village keeps its scan cache and leaves project folders alone"
```

---

## Task 10: State v5

**Files:**
- Modify: `packages/server/src/state/schema.ts`
- Create: `packages/server/src/state/schema.test.ts`
- Test: `packages/server/src/state/store.test.ts` (append)

**Note on where migrations are tested today:** there is no `schema.test.ts` —
`migrateState` has only ever been exercised indirectly, through `loadState` in
`store.test.ts`. This task adds the direct test file. `store.test.ts` asserts
against the `STATE_VERSION` constant rather than literals almost everywhere,
so the bump is mostly free; the two exceptions are the hand-built saves at
`store.test.ts:157` (`version: 3`) and `:179` (`version: 4`), which are
deliberately pinned to their own version and must **stay** pinned — they are
testing that an old save upgrades, so changing them would delete the test.

**Interfaces:**
- Consumes: the `project` kind (Task 1).
- Produces: `STATE_VERSION = 5`; `migrateState` gains a v4 to v5 step.

**Why bump at all, when nothing is added?** Because the version number is what
stops an *older* server opening a *newer* save: `loadState` refuses anything
above `STATE_VERSION`. A v5 save can contain `kind: 'project'` creatures, which
a v4 server would hand to a renderer that has never heard of them. The
migration adds no fields — every field Task 1 added is optional — so the step
is a version stamp and nothing else, and that is exactly what it should be.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/state/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultLlmState } from '../llm/ledger.js';
import { emptyState, migrateState, type VillageState } from './schema.js';

describe('v4 to v5', () => {
  it('lifts a v4 save to v5 without disturbing its creatures', () => {
    const creature = { id: 'skill:a', kind: 'skill', name: 'a', stats: { mood: 55, energy: 55, bond: 5, xp: 0 } };
    const v4 = {
      version: 4,
      createdAt: 0,
      updatedAt: 0,
      creatures: { 'skill:a': creature },
      problems: [],
      llm: defaultLlmState(0),
      robot: { residentId: null },
    } as unknown as VillageState;

    const migrated = migrateState(v4, 1000);
    expect(migrated.version).toBe(5);
    expect(migrated.creatures['skill:a']).toEqual(creature);
    expect(migrated.robot).toEqual({ residentId: null });
  });

  it('carries a v1 save all the way up in one pass', () => {
    const v1 = {
      version: 1,
      createdAt: 0,
      updatedAt: 0,
      creatures: {},
      problems: [],
    } as unknown as VillageState;

    expect(migrateState(v1, 1000).version).toBe(5);
  });

  it('emptyState is written at the current version', () => {
    expect(emptyState(0).version).toBe(5);
  });
});
```

Append to `packages/server/src/state/store.test.ts`:

```ts
describe('project creatures on disk', () => {
  let box: Sandbox;
  beforeEach(async () => { box = await makeSandbox(); });
  afterEach(async () => { await box.cleanup(); });

  it('round-trips a project creature with its work signal intact', async () => {
    const state = emptyState(0);
    state.creatures['project:C--w-atlas'] = {
      id: 'project:C--w-atlas',
      kind: 'project',
      name: 'atlas',
      nickname: '',
      appearance: generateAppearance({ kind: 'project', name: 'C--w-atlas' }),
      stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
      stage: 'adult',
      personality: null,
      sourcePath: '/w/atlas',
      friendships: {},
      lastSeenAt: 0,
      lastWorkedAt: 1_724_000_000_000,
      helperIds: ['skill:brainstorming'],
      unresolvedHelpers: 2,
    };

    await saveState(box.paths, state);
    const loaded = await loadState(box.paths, 0);
    const project = loaded.state.creatures['project:C--w-atlas']!;
    expect(project.lastWorkedAt).toBe(1_724_000_000_000);
    expect(project.helperIds).toEqual(['skill:brainstorming']);
    expect(project.unresolvedHelpers).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/src/state/`
Expected: FAIL — `expected 4 to be 5`.

- [ ] **Step 3: Bump the version and add the step**

In `packages/server/src/state/schema.ts`, change:

```ts
export const STATE_VERSION = 4;
```

to:

```ts
export const STATE_VERSION = 5;
```

Update the `migrateState` doc comment's last sentence to read:

```ts
 * v3 -> v4 adds the robot house; v4 -> v5 is a version stamp only — the M5
 * project fields are all optional, so no creature has to be rewritten, but a
 * v5 save may contain `kind: 'project'` creatures that a v4 server cannot draw.
```

and add this line immediately after the v3 to v4 step:

```ts
  if (state.version === 4) state = { ...state, version: 5 };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/state/`
Expected: PASS.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: green. `store.test.ts` asserts against `STATE_VERSION` rather than
a literal in every case that should follow the bump, so nothing there needs
editing — and the two hand-built saves pinned at `version: 3` and `version: 4`
must be left exactly as they are.

```bash
git add packages/server/src/state/schema.ts packages/server/src/state/schema.test.ts packages/server/src/state/store.test.ts
git commit -m "feat(server): state v5 — a save may now hold project creatures"
```

- [ ] **Step 6: Verify against the live save (manual, read-only)**

Start the dev server and check the real village:

```bash
curl -s http://localhost:5173/api/state | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);const cs=Object.values(s.creatures);const p=cs.filter(c=>c.kind==='project');console.log('version',s.version,'creatures',cs.length,'projects',p.length);console.log('linked',p.filter(x=>x.helperIds.length).length,'total links',p.reduce((n,x)=>n+x.helperIds.length,0));})"
```

Expected on the reference machine: `version 5`, projects **18**, and a
non-zero number of links. If projects is 0, the scan found no entries — check
`projectsDir` resolves against the real home, not the sandbox.

---

## Task 11: The renderer accepts a project

**Files:**
- Modify: `packages/web/src/net/protocol.ts`
- Test: `packages/web/src/net/protocol.test.ts` (append)

**Interfaces:**
- Consumes: `CreatureKind` including `'project'` and the optional `helperIds` field (Task 1).
- Produces: no new exports. `isRenderable` accepts `kind: 'project'`; a creature whose `helperIds` is present but not an array of strings has the field dropped rather than being rejected whole.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/net/protocol.test.ts`:

```ts
describe('projects in the view', () => {
  const project = (over: Record<string, unknown> = {}) => ({
    id: 'project:C--w-atlas',
    kind: 'project',
    name: 'atlas',
    nickname: '',
    appearance: {
      body: 'round', crown: 'none', winged: false, restPosture: null,
      palette: { hue: '#8FBF6F', lite: '#C8E3B0', dark: '#4E6B3E' },
    },
    stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
    helperIds: ['skill:brainstorming'],
    ...over,
  });

  it('draws a project like any other villager', () => {
    expect(filterRenderable([project()]).map((c) => c.id)).toEqual(['project:C--w-atlas']);
  });

  it('carries helperIds through to the renderer — the links are what the layout needs', () => {
    const [drawn] = filterRenderable([project()]);
    expect(drawn!.helperIds).toEqual(['skill:brainstorming']);
  });

  it('drops a malformed helperIds rather than dropping the villager', () => {
    const [drawn] = filterRenderable([project({ helperIds: 'not-a-list' })]);
    expect(drawn).toBeDefined();
    expect(drawn!.helperIds).toBeUndefined();
  });

  it('still refuses a creature of an unknown kind', () => {
    expect(filterRenderable([project({ kind: 'gremlin' })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: FAIL — `expected [] to deep equal [ 'project:C--w-atlas' ]`.

- [ ] **Step 3: Widen the guard**

In `packages/web/src/net/protocol.ts`, inside `isRenderable`, replace:

```ts
    (c.kind === 'skill' || c.kind === 'agent') &&
```

with:

```ts
    (c.kind === 'skill' || c.kind === 'agent' || c.kind === 'project') &&
```

and add this function above `filterRenderable`:

```ts
/**
 * A project's links, if they survive inspection. Deliberately lenient about
 * the *field* and strict about the *village*: a malformed list costs a project
 * its retinue, not its existence, so one bad payload cannot empty Homes.
 */
function renderableHelperIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((id): id is string => typeof id === 'string');
  return ids.length === value.length ? ids : undefined;
}
```

Then change `filterRenderable` to normalise the field as it passes:

```ts
export function filterRenderable(values: unknown[]): Creature[] {
  return values
    .filter(isRenderable)
    .map((c) => {
      const helperIds = renderableHelperIds((c as { helperIds?: unknown }).helperIds);
      return helperIds ? { ...c, helperIds } : { ...c, helperIds: undefined };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: green — including `packages/web/src/boundaries.test.ts`, which must
still pass: `role.ts` is exported from `@village/core/visual` and imports no
Node builtin.

```bash
git add packages/web/src/net/protocol.ts packages/web/src/net/protocol.test.ts
git commit -m "feat(web): the view accepts project creatures and their links"
```

---

## Task 12: Plots, retinues and the commons

**Files:**
- Create: `packages/web/src/layout/instances.ts`
- Modify: `packages/web/src/layout/zones.ts`
- Test: `packages/web/src/layout/instances.test.ts`
- Test: `packages/web/src/layout/zones.test.ts` (append)

**Interfaces:**
- Consumes: `helperIdsOf` / `isProject` from `@village/core/visual` (Task 1), `Creature` as filtered by `filterRenderable` (Task 11).
- Produces:
  - `interface RenderInstance { key: string; creatureId: string; role: 'project' | 'helper'; projectId: string | null }`
  - `instanceKey(creatureId: string, projectId: string | null): string`
  - `creatureIdOf(key: string): string`
  - `planInstances(creatures: readonly Creature[], residentId?: string | null): RenderInstance[]`
  - from `zones.ts`: `interface Plot { lo: number; hi: number }`; `plotsFor(projects, retinue): Map<string, Plot>`; `placeVillage(instances: readonly RenderInstance[]): Map<string, Spot>`; `PROJECTS_HI`, `COMMONS_LO`; `placeCreatures` keeps its signature and behaviour.

**The idea in one paragraph.** A helper is one creature with one persona, one
stats block and one panel — but it is *drawn* once beside each project that
uses it (spec §4). So the renderer stops keying anything by creature id and
starts keying by an **instance key**: `helperId@projectId` for a retinue
member, and the plain creature id for a project or a commons helper. Homes is
then divided into **plots**, one per project, sized to its retinue and laid
out left to right; a project and its helpers are seated inside that plot by
the existing seating engine, which is what makes the tether structural rather
than a force applied after the fact. Helpers no project uses — measured
2026-08-25, that is **65 of 76** — wander a commons at the far end of Homes,
exactly as they do today.

- [ ] **Step 1: Write the failing instances test**

Create `packages/web/src/layout/instances.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Creature } from '@village/core/visual';
import { creatureIdOf, instanceKey, planInstances } from './instances.js';

const make = (id: string, kind: Creature['kind'], helperIds?: string[]) =>
  ({ id, kind, name: id, nickname: '', helperIds } as unknown as Creature);

const ATLAS = make('project:atlas', 'project', ['skill:brainstorming']);
const BRIDGE = make('project:bridge', 'project', ['skill:brainstorming', 'agent:reviewer']);
const BRAINSTORM = make('skill:brainstorming', 'skill');
const REVIEWER = make('agent:reviewer', 'agent');
const LONER = make('skill:loner', 'skill');

describe('planInstances', () => {
  it('draws every project once', () => {
    const plan = planInstances([ATLAS, BRAINSTORM]);
    expect(plan.filter((i) => i.role === 'project').map((i) => i.key)).toEqual(['project:atlas']);
  });

  it('draws a shared helper once beside each project that uses it', () => {
    const plan = planInstances([ATLAS, BRIDGE, BRAINSTORM, REVIEWER]);
    const drawn = plan.filter((i) => i.creatureId === 'skill:brainstorming').map((i) => i.key);
    expect(drawn).toEqual(['skill:brainstorming@project:atlas', 'skill:brainstorming@project:bridge']);
  });

  it('sends an unused helper to the commons, untethered', () => {
    const plan = planInstances([ATLAS, BRAINSTORM, LONER]);
    const loner = plan.find((i) => i.creatureId === 'skill:loner')!;
    expect(loner.key).toBe('skill:loner');
    expect(loner.projectId).toBeNull();
  });

  it('never also puts a linked helper in the commons — it lives beside its projects', () => {
    const plan = planInstances([ATLAS, BRAINSTORM]);
    expect(plan.map((i) => i.key)).not.toContain('skill:brainstorming');
  });

  it('ignores a link to a helper that is not in the village', () => {
    const ghostLink = make('project:ghost', 'project', ['skill:uninstalled']);
    const plan = planInstances([ghostLink]);
    expect(plan.map((i) => i.key)).toEqual(['project:ghost']);
  });

  it('gives the robot resident exactly one instance, so it stands only on the porch', () => {
    const plan = planInstances([ATLAS, BRIDGE, BRAINSTORM], 'skill:brainstorming');
    const drawn = plan.filter((i) => i.creatureId === 'skill:brainstorming');
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.key).toBe('skill:brainstorming');
    expect(drawn[0]!.projectId).toBeNull();
  });

  it('is sorted, so render order never flickers between frames', () => {
    const plan = planInstances([BRIDGE, ATLAS, REVIEWER, BRAINSTORM, LONER]);
    expect([...plan].map((i) => i.key)).toEqual([...plan].map((i) => i.key).sort());
  });

  it('round-trips a key back to the creature that owns it', () => {
    expect(creatureIdOf(instanceKey('skill:a', 'project:b'))).toBe('skill:a');
    expect(creatureIdOf(instanceKey('skill:a', null))).toBe('skill:a');
  });

  it('survives an empty village', () => {
    expect(planInstances([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/layout/instances.test.ts`
Expected: FAIL — `Failed to resolve import "./instances.js"`.

- [ ] **Step 3: Write the instance planner**

Create `packages/web/src/layout/instances.ts`:

```ts
import { helperIdsOf, isProject, type Creature } from '@village/core/visual';

/**
 * One drawn body. A creature is one villager with one persona, one stats
 * block and one panel — but a helper is *drawn* once beside every project
 * that uses it (spec §4), so everything the renderer keys by (actors,
 * placements, hover, generations) keys by this, not by creature id.
 */
export interface RenderInstance {
  /** Unique per drawn body. `helperId@projectId`, or the creature id. */
  key: string;
  creatureId: string;
  role: 'project' | 'helper';
  /** The project this instance stands beside; null for a project or a commons helper. */
  projectId: string | null;
}

/**
 * A creature id already contains a colon (`skill:brainstorming`), so the
 * separator has to be something else. `@` reads as "beside" and appears in no
 * creature id: ids come from a skill directory, an agent filename stem, or an
 * encoded project folder, and none of those may contain one.
 */
export const INSTANCE_SEPARATOR = '@';

export function instanceKey(creatureId: string, projectId: string | null): string {
  return projectId === null ? creatureId : `${creatureId}${INSTANCE_SEPARATOR}${projectId}`;
}

export function creatureIdOf(key: string): string {
  const at = key.indexOf(INSTANCE_SEPARATOR);
  return at === -1 ? key : key.slice(0, at);
}

/**
 * Turn the cast into the list of bodies to draw.
 *
 * `residentId` is the villager living in the physical robot, if any. It gets
 * exactly one instance and stands on the porch: a resident drawn beside three
 * projects as well as inside the robot house would make a glance at the house
 * a lie about who lives there.
 */
export function planInstances(
  creatures: readonly Creature[],
  residentId: string | null = null,
): RenderInstance[] {
  const present = new Set(creatures.map((c) => c.id));
  const instances: RenderInstance[] = [];
  const placed = new Set<string>();

  for (const creature of creatures) {
    if (!isProject(creature)) continue;
    instances.push({
      key: creature.id,
      creatureId: creature.id,
      role: 'project',
      projectId: null,
    });

    for (const helperId of helperIdsOf(creature)) {
      // A link to a helper the player has since deleted draws nothing. The
      // link itself is kept server-side; the renderer simply has no body for it.
      if (!present.has(helperId)) continue;
      if (helperId === residentId) continue;
      instances.push({
        key: instanceKey(helperId, creature.id),
        creatureId: helperId,
        role: 'helper',
        projectId: creature.id,
      });
      placed.add(helperId);
    }
  }

  // Everyone left: the commons. Measured 2026-08-25 that is 65 of 76 helpers,
  // so this is the common case and not a leftovers bin — nothing vanishes on
  // remap day, and a helper joins a project the first time a scan links it.
  for (const creature of creatures) {
    if (isProject(creature)) continue;
    if (placed.has(creature.id)) continue;
    instances.push({
      key: creature.id,
      creatureId: creature.id,
      role: 'helper',
      projectId: null,
    });
  }

  return instances.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/layout/instances.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Widen Homes**

The village just gained a whole population — 18 projects and their retinues on
top of 76 helpers. In `packages/web/src/layout/zones.ts`, replace the `ZONES`
array and `WORLD_W`:

```ts
export const ZONES: readonly Zone[] = Object.freeze([
  { id: 'hatchery', label: 'Hatchery', x: 0, w: 520 },
  { id: 'homes', label: 'Homes', x: 520, w: 5200 },
  { id: 'adoption', label: 'Adoption Center', x: 5720, w: 760 },
  { id: 'notice', label: 'Notice Board', x: 6480, w: 420 },
]);

export const WORLD_W = 6900;
```

The Homes scenery anchors (`HOMES_HOUSE_XS`, `HOMES_TREE_XS`) are offsets from
`HOMES.x`, so every prop stays exactly where it is and the new ground opens up
to their right. **Known follow-up, for the playtest not for this task:** the
commons therefore has no props of its own yet.

- [ ] **Step 6: Write the failing placement test**

Append to `packages/web/src/layout/zones.test.ts`:

```ts
describe('placeVillage', () => {
  const project = (id: string): RenderInstance => ({ key: id, creatureId: id, role: 'project', projectId: null });
  const retinueMember = (helper: string, projectId: string): RenderInstance =>
    ({ key: `${helper}@${projectId}`, creatureId: helper, role: 'helper', projectId });
  const commoner = (id: string): RenderInstance => ({ key: id, creatureId: id, role: 'helper', projectId: null });

  it('seats every instance exactly once', () => {
    const plan = [project('project:a'), retinueMember('skill:x', 'project:a'), commoner('skill:y')];
    const spots = placeVillage(plan);
    expect([...spots.keys()].sort()).toEqual(['project:a', 'skill:x@project:a', 'skill:y']);
  });

  it('stands a retinue member inside its own project\'s plot', () => {
    const plan = [
      project('project:a'), retinueMember('skill:x', 'project:a'),
      project('project:b'), retinueMember('skill:x', 'project:b'),
    ];
    const spots = placeVillage(plan);
    const plots = plotsFor([plan[0]!, plan[2]!], new Map([
      ['project:a', [plan[1]!]], ['project:b', [plan[3]!]],
    ]));

    const a = plots.get('project:a')!;
    expect(spots.get('skill:x@project:a')!.x).toBeGreaterThanOrEqual(a.lo);
    expect(spots.get('skill:x@project:a')!.x).toBeLessThanOrEqual(a.hi);
  });

  it('puts the commons at the far end, clear of every plot', () => {
    const spots = placeVillage([project('project:a'), commoner('skill:y')]);
    expect(spots.get('skill:y')!.x).toBeGreaterThanOrEqual(COMMONS_LO);
    expect(spots.get('project:a')!.x).toBeLessThanOrEqual(PROJECTS_HI);
  });

  it('is a pure function of the plan — the same village every reload', () => {
    const plan = [project('project:a'), retinueMember('skill:x', 'project:a'), commoner('skill:y')];
    expect([...placeVillage(plan)]).toEqual([...placeVillage([...plan].reverse())]);
  });

  it('gives a project with a big retinue more ground than a bare one', () => {
    const plan = [
      project('project:big'),
      retinueMember('skill:1', 'project:big'),
      retinueMember('skill:2', 'project:big'),
      retinueMember('skill:3', 'project:big'),
      project('project:small'),
    ];
    const retinue = new Map([['project:big', plan.slice(1, 4)]]);
    const plots = plotsFor([plan[0]!, plan[4]!], retinue);
    const big = plots.get('project:big')!;
    const small = plots.get('project:small')!;
    expect(big.hi - big.lo).toBeGreaterThan(small.hi - small.lo);
  });

  it('lays plots out without overlapping', () => {
    const projects = ['a', 'b', 'c'].map((n) => project(`project:${n}`));
    const plots = [...plotsFor(projects, new Map()).values()].sort((p, q) => p.lo - q.lo);
    for (let i = 1; i < plots.length; i++) {
      expect(plots[i]!.lo).toBeGreaterThanOrEqual(plots[i - 1]!.hi);
    }
  });

  it('survives an empty village and a village of nothing but commoners', () => {
    expect(placeVillage([]).size).toBe(0);
    expect(placeVillage([commoner('skill:y')]).size).toBe(1);
  });
});
```

Add `RenderInstance` to the file's imports from `./instances.js`, and
`placeVillage`, `plotsFor`, `COMMONS_LO`, `PROJECTS_HI` to its imports from
`./zones.js`.

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: FAIL — `placeVillage is not a function`.

- [ ] **Step 8: Generalise the seating engine to a range**

Everything in `zones.ts` that seats creatures currently hardcodes `HOMES_LO`
and `HOMES_HI`. Make the range a parameter — the logic does not change, only
where it reads its bounds from.

First, turn the `ROW_GROUND` constant into a function. Replace:

```ts
const ROW_GROUND: readonly RowGround[] = Array.from({ length: ROWS }, (_, row) => {
```

with:

```ts
/**
 * The seatable ground per depth row inside [lo, hi], with the scenery bands
 * cut out. Computed per call rather than once per module now that Homes is
 * seated in slices: one project's plot, then the next, then the commons.
 * Seven rows of interval arithmetic — cheap enough to do per placement.
 */
function rowGroundsFor(lo: number, hi: number): readonly RowGround[] {
  return Array.from({ length: ROWS }, (_, row) => {
```

and change that function body's `HOMES_LO` to `lo` and `HOMES_HI` to `hi`
throughout, then close it and add the guard and the default:

```ts
    if (cursor < hi) free.push({ left: cursor, right: hi });
    // A plot can land entirely inside a house's keep-out band. Rather than
    // hand `groundAt` an empty list to index into, treat a fully blocked row
    // as open: somebody standing on a roof is a bug, but so is a crash, and
    // the seating rungs below still push them off the prop where they can.
    if (free.length === 0) free.push({ left: lo, right: hi });
    return { bands, free, freeTotal: free.reduce((sum, seg) => sum + (seg.right - seg.left), 0) };
  });
}
```

Next, give `seatRow`, `seatRowPacked` and `nearestGroundRight` the range.
Add `lo: number, hi: number` as parameters to each, and inside them replace
every `HOMES_LO` with `lo` and every `HOMES_HI` with `hi`.

Finally, rename the body of `placeCreatures` to `placeInHomes` and give it the
range, keeping `placeCreatures` as the whole-Homes call it always was:

```ts
export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  return placeInHomes(ids, HOMES_LO, HOMES_HI);
}

/**
 * Deterministic placement inside a slice of Homes. This is the old
 * `placeCreatures` with its bounds lifted out: the row lottery, the
 * stratified draw, the three comfort rungs and the wander leash are all
 * unchanged — they now measure against [lo, hi] rather than against the whole
 * zone, so a project's retinue can be seated inside that project's plot and
 * be tethered *by construction* rather than by a force applied afterwards.
 */
export function placeInHomes(ids: readonly string[], lo: number, hi: number): Map<string, Spot> {
```

Inside `placeInHomes`, replace `const ground = ROW_GROUND[row]!;` with a
per-call lookup — compute the grounds once at the top of the function:

```ts
  const rowGrounds = rowGroundsFor(lo, hi);
```

and use `rowGrounds[row]!`. Replace the three seating calls with the ranged
versions, and the leash block's `HOMES_LO`/`HOMES_HI` with `lo`/`hi`:

```ts
    const xs =
      seatRow(ordered, ground, lo, hi, (a, other) => other.r + a.r) ??
      seatRow(ordered, ground, lo, hi, () => MIN_SEPARATION) ??
      seatRowPacked(ordered, ground, lo, hi);
```

- [ ] **Step 9: Add the neighbourhoods, the plots and `placeVillage`**

Still in `zones.ts`, add after `HOMES_HI`:

```ts
/**
 * Homes is two neighbourhoods. The projects and their retinues take the near
 * end; the commons — every helper no project uses, which on the reference
 * machine is 65 of 76 — takes the far end. The gap between them is wide
 * enough to read as a boundary rather than as a crowd thinning out.
 */
export const COMMONS_W = 1500;
const NEIGHBOURHOOD_GAP = 140;
export const COMMONS_LO = HOMES_HI - COMMONS_W;
export const PROJECTS_HI = COMMONS_LO - NEIGHBOURHOOD_GAP;
```

and add at the end of the file:

```ts
/** One project's stretch of Homes: it and its retinue are seated inside this. */
export interface Plot {
  lo: number;
  hi: number;
}

/** A bare project's share of the band, before scaling. */
const PLOT_MIN = 120;
/** Each drawn helper's additional share. */
const PLOT_PER_HELPER = 70;

/**
 * Divide the projects band into one plot per project, left to right in id
 * order, each sized to its retinue and then **scaled to fit the band exactly**.
 *
 * Scaling rather than a fixed width per project is what keeps this honest on
 * a machine unlike the reference one: eighteen projects and thirty drawn
 * helpers want more ground than Homes has, and sixty projects would want
 * three times that. A proportional split degrades into a crowd — which the
 * seating engine's comfort rungs already know how to draw — instead of
 * running off the end of the world.
 */
export function plotsFor(
  projects: readonly { creatureId: string }[],
  retinue: ReadonlyMap<string, readonly unknown[]>,
): Map<string, Plot> {
  const wants = projects.map((p) => ({
    id: p.creatureId,
    want: PLOT_MIN + PLOT_PER_HELPER * (retinue.get(p.creatureId)?.length ?? 0),
  }));
  const total = wants.reduce((sum, w) => sum + w.want, 0);
  const plots = new Map<string, Plot>();
  if (total === 0) return plots;

  const scale = (PROJECTS_HI - HOMES_LO) / total;
  let cursor = HOMES_LO;
  for (const want of wants) {
    const width = want.want * scale;
    plots.set(want.id, { lo: Math.round(cursor), hi: Math.round(cursor + width) });
    cursor += width;
  }
  return plots;
}

/**
 * Seat every drawn body in the village: each project with its retinue inside
 * its own plot, then everyone else in the commons. Pure and order-independent
 * — the plan is sorted by project id here rather than trusted from the
 * caller, so the same village draws the same way however the view arrived.
 */
export function placeVillage(plan: readonly RenderInstance[]): Map<string, Spot> {
  const projects = plan
    .filter((i) => i.role === 'project')
    .sort((a, b) => (a.creatureId < b.creatureId ? -1 : a.creatureId > b.creatureId ? 1 : 0));

  const retinue = new Map<string, RenderInstance[]>();
  const commons: RenderInstance[] = [];
  for (const instance of plan) {
    if (instance.role === 'project') continue;
    if (instance.projectId === null) { commons.push(instance); continue; }
    const members = retinue.get(instance.projectId) ?? [];
    members.push(instance);
    retinue.set(instance.projectId, members);
  }

  const spots = new Map<string, Spot>();
  const plots = plotsFor(projects, retinue);

  for (const project of projects) {
    const plot = plots.get(project.creatureId)!;
    const keys = [project.key, ...(retinue.get(project.creatureId) ?? []).map((i) => i.key)];
    for (const [key, spot] of placeInHomes(keys, plot.lo, plot.hi)) spots.set(key, spot);
  }

  for (const [key, spot] of placeInHomes(commons.map((i) => i.key), COMMONS_LO, HOMES_HI)) {
    spots.set(key, spot);
  }

  return spots;
}
```

Add the import at the top of `zones.ts`:

```ts
import type { RenderInstance } from './instances.js';
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/layout/`
Expected: PASS — the seven new `placeVillage` cases **and** every pre-existing
`placeCreatures` case, which is the point of keeping that entry point: the
seating engine's behaviour over the whole of Homes is unchanged. Note that
tests asserting exact world x values will move, because Homes is wider — if
one fails, check whether it pinned a coordinate or a property. A pinned
coordinate should be updated; a broken property is a real regression.

- [ ] **Step 11: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: green.

```bash
git add packages/web/src/layout/instances.ts packages/web/src/layout/instances.test.ts packages/web/src/layout/zones.ts packages/web/src/layout/zones.test.ts
git commit -m "feat(web): plots for the projects, a commons for everyone else"
```

---

## Task 13: The scene draws instances

**Files:**
- Modify: `packages/web/src/scene/village.ts`

**Interfaces:**
- Consumes: `planInstances`, `creatureIdOf`, `RenderInstance` (Task 12); `placeVillage` (Task 12); `VillageView.creatures` carrying projects (Task 11).
- Produces: no new exports. `VillageScene`'s public methods keep their
  signatures — `sayFor`, `greetFor`, `thinkFor`, `clearThoughtFor` still take a
  **creature id**, and `onCreatureClick` still receives a **creature**.

**Verification note, read before starting.** There is no `village.test.ts` —
this scene is KAPLAY-bound and has never had unit tests. Its correctness rests
on the pure layers under it (`instances.ts` and `zones.ts`, both fully tested
in Task 12) plus `npm run typecheck` and a look at the running village in
Step 6. Do not claim this task works without doing Step 6.

- [ ] **Step 1: Key the actor maps by instance**

In `packages/web/src/scene/village.ts`, add to the imports:

```ts
import { creatureIdOf, planInstances, type RenderInstance } from '../layout/instances.js';
```

and add `placeVillage` to the existing import from `../layout/zones.js`.

Then, at the `const actors = new Map<string, CreatureActor>();` block, replace
the surrounding declarations with:

```ts
  // Keyed by *instance key*, not creature id: a helper linked to three
  // projects is three drawn bodies with one persona (spec §4). `known` stays
  // keyed by creature id — there is still only one of each villager.
  const actors = new Map<string, CreatureActor>();
  const generations = new Map<string, number>();
  let known = new Map<string, Creature>();
  let prevStages: Map<string, string> | null = null;
  let placements = new Map<string, Spot>();
  /** The drawn bodies of the current view, by instance key. */
  let instances = new Map<string, RenderInstance>();
  /**
   * The instance the player last clicked, per creature. A reply belongs in
   * the bubble over the body they actually clicked; without this a linked
   * helper would answer through whichever of its bodies sorted first.
   */
  const lastClicked = new Map<string, string>();
  let lookAt: number | null = null;
```

- [ ] **Step 2: Rename the hover target and translate at the edges**

`hoveredId` now holds an instance key. Rename it and fix the two places that
treat it as a creature id.

Replace:

```ts
  let hoveredId: string | null = null;
```

with:

```ts
  // The *instance* under the cursor this frame, or null. Written by the update
  // loop and read by the click handler below — "the one I clicked" is exactly
  // "the one whose name I can see", so both answers come from one test.
  let hoveredKey: string | null = null;
```

Then inside `k.onUpdate`, replace `hoveredId = null;` with `hoveredKey = null;`
and `hoveredId = id;` with `hoveredKey = id;`. Replace the actor update line:

```ts
    for (const [key, actor] of actors) actor.update(t, lookAt, key === hoveredKey);
```

In the idle-chirp block, the `known.get(id)` lookup now needs translating —
replace `const c = known.get(id);` with:

```ts
        const c = known.get(creatureIdOf(id));
```

In the `mousedown` listener, replace `tracker.press(event.clientX, event.clientY, hoveredId);` with:

```ts
    tracker.press(event.clientX, event.clientY, hoveredKey);
```

In the drag-ghost block, replace `const dragged = known.get(drag.targetId);` with:

```ts
      const dragged = known.get(creatureIdOf(drag.targetId));
```

- [ ] **Step 3: Translate the click and the drop**

In the `mouseup` listener, replace the whole `if (gesture.type === 'click')`
and `if (gesture.type === 'drop')` blocks with:

```ts
    if (gesture.type === 'click') {
      // The tracker carries an instance key; everything outside this scene
      // speaks creature ids. Remember which body was clicked so the reply
      // comes back out of that same body's mouth.
      const creatureId = creatureIdOf(gesture.targetId);
      const creature = known.get(creatureId);
      if (creature) {
        lastClicked.set(creatureId, gesture.targetId);
        opts.onCreatureClick?.(creature);
      }
      return;
    }
    if (gesture.type === 'drop') {
      const rect = k.canvas.getBoundingClientRect();
      const worldX = event.clientX - rect.left + k.getCamPos().x - k.width() / 2;
      const worldY = event.clientY - rect.top + k.getCamPos().y - k.height() / 2;
      const creatureId = creatureIdOf(gesture.targetId);
      if (inRobotHouse(worldX, worldY)) {
        opts.onRobotDrop?.(creatureId);
      } else if (creatureId === residentId) {
        opts.onRobotEvict?.(creatureId);
      }
    }
```

- [ ] **Step 4: Rewrite `setView` to loop instances**

Replace the body of `setView` from the `counter.text` line down to the
`known = new Map(...)` line with:

```ts
      const projects = view.creatures.filter((c) => c.kind === 'project').length;
      counter.text = projects > 0
        ? `${projects} projects · ${view.creatures.length - projects} helpers`
        : `${view.creatures.length} villagers`;
      const llm = view.llm;
      meter.text = llm
        ? `voice ${bar(llm.interactiveRemaining, llm.interactiveCap)} ${fmt(llm.interactiveRemaining)}/${fmt(llm.interactiveCap)}`
        : '';

      residentId = view.robotResidentId;
      const plan = planInstances(view.creatures, residentId);
      const spots = placeVillage(plan);

      // The resident stands at the robot-house porch, not its hashed spot
      // (spec §4: a glance at the house says who the robot is). planInstances
      // has already guaranteed it has exactly one body to move.
      if (residentId && spots.has(residentId)) spots.set(residentId, { ...PORCH_SPOT });

      const resident = residentId ? view.creatures.find((c) => c.id === residentId) : undefined;
      robotHouse.setResidentLabel(resident ? displayName(resident) : null);
      const active = view.robotLastTurnAt !== null && Date.now() - view.robotLastTurnAt < 15_000;
      robotHouse.setPresence(resident ? (active ? 'talking' : 'lit') : 'dark');

      placements = spots;
      instances = new Map(plan.map((i) => [i.key, i]));
      const byId = new Map(view.creatures.map((c) => [c.id, c]));
      const seen = new Set<string>();

      for (const instance of plan) {
        const creature = byId.get(instance.creatureId);
        if (!creature) continue;
        seen.add(instance.key);
        const spot = spots.get(instance.key)!;
        const before = known.get(instance.creatureId);
        // Respawn only when the look changes; stats alone (which change on
        // every server tick) must not restart a creature's motion.
        const changed = before && JSON.stringify(before.appearance) !== JSON.stringify(creature.appearance);
        if (!actors.has(instance.key) || changed) {
          actors.get(instance.key)?.destroy();
          actors.delete(instance.key);
          const gen = (generations.get(instance.key) ?? 0) + 1;
          generations.set(instance.key, gen);
          void spawnCreature(k, creature, spot, { pixel: pixelFont, mono: monoFont })
            .then((actor) => {
              if (generations.get(instance.key) !== gen) { actor.destroy(); return; }
              actor.setSpot(placements.get(instance.key) ?? spot);
              actor.setCreature(known.get(instance.creatureId) ?? creature);
              actors.set(instance.key, actor);
            })
            .catch(() => {
              // A failed sprite load leaves nothing to add.
            });
        } else {
          const actor = actors.get(instance.key)!;
          actor.setSpot(spot);
          actor.setCreature(creature);
        }
      }

      for (const [key, actor] of actors) {
        if (!seen.has(key)) { actor.destroy(); actors.delete(key); }
      }

      // Sound still thinks in villagers, not bodies: a helper drawn beside
      // three projects must not chime three times when it grows up. One
      // snapshot per creature, positioned at whichever of its bodies sorts
      // first — sound only needs somewhere on screen to come from.
      const heard = new Set<string>();
      const snapshots: CreatureSnapshot[] = [];
      for (const instance of plan) {
        if (heard.has(instance.creatureId)) continue;
        const creature = byId.get(instance.creatureId);
        if (!creature) continue;
        heard.add(instance.creatureId);
        snapshots.push({
          id: creature.id,
          stage: stageOf(creature),
          x: spots.get(instance.key)!.x,
          voice: voiceParamsFor(creature),
        });
      }
      for (const ev of viewSoundEvents(prevStages, snapshots)) sound.event(ev);
      prevStages = new Map(view.creatures.map((c) => [c.id, stageOf(c)]));

      known = new Map(view.creatures.map((c) => [c.id, c]));
```

- [ ] **Step 5: Route the four per-creature methods to a body**

Replace the four methods at the end of the returned object with:

```ts
    sayFor(creatureId, text, source) {
      actorFor(creatureId)?.say(text, source);
    },
    greetFor(creatureId) {
      actorFor(creatureId)?.greet();
    },
    thinkFor(creatureId) {
      actorFor(creatureId)?.think();
    },
    clearThoughtFor(creatureId) {
      actorFor(creatureId)?.clearThought();
    },
```

and add this helper just above the `return {` of `startVillage`:

```ts
  /**
   * Which of a villager's bodies speaks. The one the player last clicked, if
   * it is still drawn — a reply belongs over the body they were looking at.
   * Otherwise the first, in the plan's own sorted order, so the choice is at
   * least stable. Null while its sprites are still loading, or after it has
   * left; the chat panel holds the line either way.
   */
  const actorFor = (creatureId: string): CreatureActor | undefined => {
    const clicked = lastClicked.get(creatureId);
    if (clicked && actors.has(clicked)) return actors.get(clicked);
    for (const [key, instance] of instances) {
      if (instance.creatureId === creatureId && actors.has(key)) return actors.get(key);
    }
    return undefined;
  };
```

- [ ] **Step 6: Typecheck, then look at it**

Run: `npm test && npm run typecheck`
Expected: green.

Then start the dev server and **look at the village**:

```bash
npm run dev
```

Check each of these by eye, at a full window:

1. **The projects are there.** The counter reads `18 projects · 76 helpers`
   (or whatever the machine has). Scroll Homes from its left edge.
2. **Retinues are beside their projects**, not scattered — a linked helper
   should read as standing *with* someone.
3. **A shared helper appears more than once.** `brainstorming` is linked to
   several projects on the reference machine; find two of its bodies.
4. **The commons is populated** at the far end of Homes, and reads as a
   neighbourhood rather than a queue.
5. **Clicking any body opens the panel**, and the reply bubble appears over
   *that* body — click a second body of the same helper and check the bubble
   moves with the click.
6. **Nobody stands on a roof or a tree**, and nobody overlaps badly.
7. **The robot resident is on the porch and nowhere else.**

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/scene/village.ts
git commit -m "feat(web): one creature, many bodies — the scene draws instances"
```

---

## Self-Review

**1. Spec coverage.** Every M5 requirement, and where it lands:

| Spec | Task |
|---|---|
| §1 `CreatureKind` gains `'project'`, role derived | 1 |
| §1 project id from the encoded dir name; display name from the real path | 6 (`lastSegment`), 7 (`projectCreatureId`) |
| §1 `lastWorkedAt`, `helperIds`, `sourcePath`, never written | 1, 6, 7, 9 |
| §1 health/mood derived at tick time, not persisted | Task 7 stores only the raw signal. **The derivation itself is M6** and is out of scope by design. |
| §1 `friendships` stays helper-only | 7 (project creatures carry `{}`) |
| §2 read-only source of truth | 3, 4 (read APIs only), 9 (no shadow for projects) |
| §2 worktree folding, incl. the orphan case | 3 |
| §2 display name from the newest `cwd` | 4, 6 |
| §2 zero-jsonl entries skipped | 3 |
| §2 released projects keep a `retired` flag, discovery does not resurrect | 1 (the field), 8 (the guard). **The release verb is M6.** |
| §3 scan at boot and every 5 minutes | 9 — `refresh()` already runs at boot and on the tick loop; no new scheduler. |
| §3 per-file cache keyed on size+mtime | 5, 9 |
| §3 the two markers, malformed lines skipped | 4 |
| §3 name resolution against the loaded roster; unresolved tally kept | 6, 7 |
| §3 pinned fixtures so format drift fails loudly | 4 |
| §4 Homes hosts the projects | 12 |
| §4 helpers drawn beside every project that uses them; one persona, one panel | 12, 13 |
| §4 the commons for unlinked helpers | 12 |
| §6 scanner units, sandbox with a fake `~/.claude/projects`, no test reads the real one | 3, 4, 5, 6, 7 — every test runs against `makeSandbox()`. |

**Two spec items deliberately not implemented, and why.** §4's *"a project's
drawn presence scales mildly with its helper count"* is the one M5 line this
plan leaves out: it needs the stage/scale machinery in `creature.ts`, it is
purely cosmetic, and it is much better judged with real projects on screen
than specified blind. Raise it as a playtest item after Task 13. §5 in its
entirety (the care loop, chat with the project, release/re-adopt) is M6.

**2. Placeholder scan.** No step says "add error handling", "similar to Task
N", or "write tests for the above". Every code step carries the code. The two
places that could read as hand-waving are called out explicitly instead:
Task 7 Step 9 ("some existing tests construct a `ScanResult` literal — add
`cache: emptyScanCache()`") and Task 12 Step 10 ("tests asserting exact world
x values will move, because Homes is wider"). Both are consequences the
implementer will meet and can act on without guessing.

**3. Type consistency.** Checked across tasks: `TranscriptFacts` (Task 4) is
what `CachedTranscript.facts` holds (5) and what `scanProjects` consumes (6).
`ProjectFacts` (6) is `creatureFromProject`'s input (7). `ScanResult.cache`
(7) is what `village.ts` holds (9). `RenderInstance` (12) is what
`placeVillage` and `plotsFor` take (12) and what `village.ts` maps (13).
`helperMentions` carries the `kind:name` form from Task 4 through to
`resolveMentions` in Task 6 — that is the one cross-task contract worth
re-checking if something does not link.

**4. Risks the executor should know.**
- **Task 12 is the big one.** Generalising the seating engine touches the most
  carefully-tuned file in the web package. `placeCreatures` is kept as a
  thin wrapper precisely so its existing tests keep guarding the old
  behaviour — if those go red, the refactor is wrong, not the tests.
- **Widening Homes moves world coordinates.** Anything that pinned an absolute
  x will move. That is expected; a pinned coordinate gets updated, a broken
  invariant does not.
- **Task 13 has no unit tests.** Step 6 is not optional.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-25-m5-projects-move-in.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Tasks 1–11 are server- and data-side and land cleanly in sequence. Tasks 12
and 13 are the ones that change what the village looks like, and both want the
user's eyes before the branch merges.
