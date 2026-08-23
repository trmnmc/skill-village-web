# Projects-Village Remap — Design (M5 + M6)

**Date:** started 2026-08-22 (brainstorm), finalized 2026-08-23
**Status:** draft for user review
**Inputs:** the remap brainstorm (approach A approved,
`docs/summaries/pause-2026-08-22-projects-village-remap.md`) and the roadmap
reconciliation (`2026-08-22-roadmap-reconciliation-design.md`), whose §7
handed this spec four open problems. Three user decisions taken 2026-08-23:
the village sees only Claude sessions (no git supplement), unused helpers
keep wandering a commons in Homes, and friendship stays a helper-only
mechanic — projects don't participate in v1.
**Scope:** M5 (the projects move in) fully; M6 (care) to the depth the work
signal dictates. M7 builder verbs and M8 hard mode stay with the
reconciliation. Breeding stays parked.

## 1. Data model (packages/core)

- `CreatureKind` gains `'project'`. Skills and agents keep their kinds; the
  role layer is derived, never stored: `role(kind)` = `'project'` for
  projects, `'helper'` otherwise.
- Project creature id: `project:<encoded-dir-name>` — the folder name under
  `~/.claude/projects` is already unique and stable. Display name comes from
  the real path (see §2), not from decoding the folder name (dashes are
  ambiguous there).
- New fields on project creatures:
  - `lastWorkedAt: number` — newest transcript mtime across the project's
    sessions (worktrees folded in).
  - `helperIds: string[]` — resolved helper links (§3), sorted, deduped.
  - `sourcePath` holds the project's real folder (from transcript `cwd`),
    `''` if unknown. The game **never writes** to it in M5/M6.
- Health/mood for projects are **derived from `lastWorkedAt` at tick time**
  (§5), not persisted — only the raw signal is stored, so tuning the decay
  curve never needs a state migration.
- `friendships` remains helper-only. Project entries never gain edges; the
  renderer never draws them for projects.

## 2. Discovery and the file bridge (packages/server/src/bridge)

- Source of truth: the entry names under `~/.claude/projects` (read-only —
  the standing safety rule extends to the scanner: **no file under
  `~/.claude` is ever written, moved, or locked**).
- **Worktree folding:** an entry matching `/^(.+)--claude-worktrees-.+$/`
  folds into parent `$1`. Verified on disk 2026-08-23: 24 entries, 10 are
  worktrees, every one has a live parent entry. An orphan worktree (parent
  never opened directly) still folds into the synthesized parent name — the
  parent is real even if Claude never sat in it.
- **Display name:** any transcript line carries `"cwd"` with the project's
  real path; the newest one wins, and its basename is the display name.
  Fallback when no line yields a cwd: the encoded entry name, ugly but true.
- Entries with **zero `.jsonl` files are skipped** — no sessions means no
  work signal, and a villager that can never change state is furniture.
- Projects the player releases (M6) keep their creature in state with a
  `retired` flag; discovery does not resurrect them, the Adoption Center
  lists them, re-adopt clears the flag. The folder is never touched.

## 3. The work signal — transcript scanning

Measured 2026-08-23 on the reference machine: 314 transcripts, ~20 MB total.
A full streaming scan is trivial today, so the design is simple and the
cache is insurance, not a prerequisite:

- **Scan = boot + every 5 minutes** (aligned to the existing tick loop). No
  hooks, no watchers on `~/.claude` — the M8 live wire adds immediacy later.
- **Per-file cache** in `~/.skill-village/scan-cache.json`: keyed by file
  path, storing `{ size, mtimeMs, facts }`. A file is reparsed only when
  size or mtime changed. Facts per file:
  - `lastActivityMs` — the file's mtime (`~/.claude` is not under OneDrive
    on the reference machine, so mtimes are trustworthy; line timestamps are
    the fallback if a platform proves otherwise).
  - `cwd` — the last seen `"cwd"` value.
  - `helperMentions` — deduped names from the two transcript markers,
    parsed line-by-line with JSON.parse, malformed lines skipped:
    - skill use: a `Skill` tool call's `input.skill`
    - agent spawn: any `subagent_type` value
- **Name resolution (the §7 problem):** a mention becomes a helper *link*
  only if it matches a helper creature the bridge already loaded (by name
  for skills, by name for agents). Everything else still counts as project
  activity but links nothing. Evidence-grounded examples:

  | Transcript name | Resolves? | Why |
  |---|---|---|
  | `brainstorming` | yes | file exists in `~/.claude/skills` |
  | `anthropic-skills:xlsx` | no | plugin-prefixed, no file on disk |
  | `claude-api`, `update-config` | no | built-in skills, no file |
  | `general-purpose`, `Explore`, `Plan` | no | built-in agent types |

  The unresolved tally is kept per project (a "powers beyond the village"
  count) so the number is never silently lost; whether the UI shows it is a
  polish call.
- **Format fragility, owned:** the parser keys on Claude Code's internal
  transcript shape. Fixture transcripts are pinned in the test suite (§6);
  when the format drifts, a fixture-driven test fails loudly instead of the
  village quietly starving.

## 4. Village layout & motion

- **Homes** hosts the projects. A project's drawn presence scales mildly
  with its helper count (the genie framing) — reusing the existing
  stage/scale machinery, no new renderer concepts.
- **Helpers appear beside every project that uses them** (reconciliation
  §1): one creature, many *render instances*. The creature keeps one
  persona, one stats block, one panel; instances are a render-level list
  `(helperId, projectId)` derived from `helperIds`. Each instance wanders
  within a tether radius of its project's anchor using the existing wander
  behavior; winged tell unchanged. Clicking any instance opens the same
  helper panel.
- **The commons:** helpers with no links (most of the 70 today — the
  transcripts mention only a handful) wander an untethered commons region
  of Homes, exactly like today's behavior. Nothing vanishes on remap day;
  attachment happens the first time a scan links them.
- Zones and their dual-role meanings are exactly the reconciliation §2
  table; nothing new here.

## 5. Care loop (M6)

- **Only real work heals.** Health and mood derive from `now -
  lastWorkedAt` on a decay curve (tunable constants, not state):
  fresh within a day = thriving; within a week = content; then drooping,
  with the sign saying why — "last worked 12 days ago", plus which linked
  helpers it misses. Petting and chat build **bond only**; care can never
  substitute for work (hybrid model from the brainstorm, decision 3).
- **Chat with the project** (reconciliation §4): the persona card is
  generated from CLAUDE.md + README (read-only) plus the freshest session
  cwd facts, over the same slim CLI transport and budget ledger the voice
  arc shipped. Helpers drop to flavor lines from their existing M4 pools.
- **Release / re-adopt:** status flip only, Adoption Center listing,
  decay and nagging stop. The folder is never touched (safety line,
  reconciliation §3).
- Hard mode (decay to abandoned/hibernating) stays in M8 behind its toggle;
  this spec only guarantees the decay curve is a pure function of
  `lastWorkedAt` so the toggle changes constants, not architecture.

## 6. Testing strategy

- **Pinned fixtures:** real (redacted) transcript excerpts in
  `packages/server/src/bridge/testing/fixtures/*.jsonl` covering: a skill
  invocation, an agent spawn, a plugin-prefixed skill, a built-in agent
  type, a malformed line, and a `cwd` line.
- **Scanner units:** worktree folding (incl. the orphan case), name
  resolution against a fake helper roster, cache hit/miss on size/mtime,
  zero-jsonl skip, malformed-line tolerance.
- **Sandbox:** the existing sandbox pattern grows a fake
  `~/.claude/projects` tree; no test ever reads the real one.
- **Safety assertion:** the scanner module imports nothing that can write
  (`fs` read APIs only) — enforced by review, stated here so the reviewer
  looks.

## 7. Non-goals (v1 of the remap)

- No git/mtime supplement to the work signal — "the village sees what
  Claude sees" is the framing, revisit only if hand-worked projects
  drooping proves painful.
- No project friendships, no project breeding, no hard mode, no hooks.
- No writes to any real project folder from M5/M6 features (hatch/train
  arrive with M7 and carry their own approval gates).
