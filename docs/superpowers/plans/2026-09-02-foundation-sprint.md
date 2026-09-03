# Foundation Sprint — Reviewed Plan (non-robot week)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task on a FRESH branch off current main. Every task below is build-actionable; expand steps with superpowers:writing-plans only where a task says so. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical, durable village save that no server can wipe; a kept save tool (export, import, merge, diff, snapshot, prune); a one-command deploy with a receipt and a rollback; the public site on M5; a license; the branch salvage finished. Then the Peddler lands, then M6.

**Provenance:** `/plan-ceo-review` on 2026-09-02, SCOPE EXPANSION. The user answered every scope question personally (D1–D8, E1–E7, findings 1–30, TODO 1–4). The decision record with the vision and the full rationale is at `~/.gstack/projects/trmnmc-skill-village-web/ceo-plans/2026-09-02-foundation-sprint-interactive.md`. This file is the single build authority.

**Tech stack:** TypeScript workspaces (Node 24 here, Node 20+ required), Fastify, vitest, tsx. No new npm dependency in this sprint. Deploy uses node built-ins plus the system `ssh` and `scp`.

## Global constraints

- **Never destroy.** No code path in this sprint may overwrite, delete, or migrate a save without first writing a hash-named copy under `archive/snapshots/`. The old "never throws, start fresh" store contract is replaced by this one.
- **Exit codes mean one thing everywhere.** 2 = this world is newer than this build (never retried by systemd). 3 = could not write the safety copy (may clear on retry). sysexits codes for CLI usage and I/O errors. `main.ts` maps by error class, never by message.
- **Pure decisions, thin I/O.** `classifySave`, the per-field mergers, `scrubPaths`, `isScratchProject`, config validation and command assembly are pure and table-tested. `loadState`, the CLI and the deploy transport are the only I/O edges.
- **Zero new inbound surface.** `/api/state`, the WebSocket `full` message and `/api/health` gain one read-only `world` object. Nothing else changes on the wire.
- **Every ssh/scp call is an argv array; no shell strings.** Config validated by strict patterns. All privileged remote steps run as one `sudo bash -s` script (one password prompt, no sudoers change).
- **The public seed carries no paths.** `scrubPaths` blanks every `creature.sourcePath` and every `problems[].path`.
- **Kind-agnostic, one ledger, one life, never write `~/.claude`:** unchanged standing rules.
- Tests from repo root: `npx vitest run <file>`; typecheck `npm run typecheck`. Commit after every green cycle; push immediately (standing rule). Human/money/eyes steps are marked **[HUMAN]**.

## Sprint sequence (finding 28A, OV-D)

0. **Done 2026-09-02 (review session):** both saves archived read-only under `~/.skill-village/archive/snapshots/pre-sprint-2026-09-02/{isolated,shared}` (hashes verified against the sources); the unpushed `main` commit pushed. The sprint's inputs cannot be lost to a TEMP cleanup.
1. Land T1–T8 on the branch (green suite, typecheck clean), merge to main.
2. **[HUMAN-assisted]** T9: merge and prune the two saves into `~/.skill-village`, archive both originals, retire the TEMP directory, start the dev server for the M5 re-judge.
3. **[HUMAN]** T10: first `deploy:village` run, `--dry-run` reviewed, then `--yes`.
4. T11 branch ledger, T12 close-out.

## What exists (reused, not rebuilt)

`readStateFile` validation and the `migrateState` chain (`state/store.ts`, `state/schema.ts`); `saveState` temp+rename; `prunedPins` (`village.ts`); `readInstance` + `isVillageServing` (`instance.ts`); tolerant `readEvents` (`state/events.ts`); the segment normalizer inside `trimWorktreeCheckout` (`bridge/projects.ts:62`); the `withMode()` wrapper and `/api/health` (`api/app.ts:86`); `protocol.ts` optional-field tolerance; the gear menu's note slot (`web/ui/weather-menu.ts`); the `packages/<pkg>/scripts/*.ts` + tsx idiom (`packages/core/scripts/contact-sheet.ts`); every fact in `docs/village-deploy.md` (scp permissions trap, snapshot mode, Caddy roots are symlink-safe); `deploy/skill-village.service`; `makeSandbox` (`server/src/testing/sandbox.ts`); `VILLAGE_DATA_DIR`; `archive/`; the `VillageEventType` union.

## Implementation tasks

Effort is human-team / CC (Claude Code). P1 blocks the sprint; P2 lands the same branch or right after.

- [ ] **T1 (P1, human ~1d / CC ~25m)** — state — **Migration safety.**
  - `packages/server/src/config/paths.ts`: add `snapshotDir = <dataDir>/archive/snapshots`.
  - `packages/server/src/instance.ts`: `acquireDataLock(paths)` / `releaseDataLock` — an exclusive lock file in the data dir (`wx` create, pid + process start time, stale when the pid is dead or that pid's process started later); `main.ts` takes it before `createVillage` and releases it on shutdown; the CLI (T3) takes it for the whole of every write (OV-G).
  - `packages/server/src/state/store.ts`: `readStateFile` returns the parsed blob plus a verdict (`ok | missing | invalid | newer`) so the CLI can diff and import a newer save; only `loadState` turns `newer` into a refusal (OV-G); add `NewerSaveError` and `SnapshotFailedError` (each with `exitCode`); pure `classifySave(main, backup)` returning a discriminated union {first-run, loaded, migrate, recovered-from-backup, fresh-with-evidence, refuse-newer}; `loadState` becomes the I/O switch; `writeSnapshot(paths, label, bytes)` names files `state-v{old}-{sha256[:8]}.json` / `state-invalid-{sha256[:8]}.json` (idempotent); main OR backup newer → throw `NewerSaveError`, nothing written; older → snapshot then migrate, failure → `SnapshotFailedError`; unreadable main → evidence copy first, failure → `SnapshotFailedError`; record `lastSavedAt` on each successful `saveState`. Rewrite the store's doc comment to "never destroys".
  - `packages/server/src/state/events.ts`: add `save-migrated` (detail: from→to, snapshot name) and `save-merged` (detail: counts per side); `loadState`'s migrate branch appends `save-migrated`.
  - `packages/server/src/main.ts`: catch by class → exit 2 / 3 with one sentence naming both versions or the path and the fix; boot banner `world: <dataDir> (v<N>, <count> villagers, live|snapshot, saved HH:MM)`.
  - Tests (`store.test.ts`): rewrite the two "newer version" cases; table-driven `classifySave`; snapshot idempotence; snapshot write failure → exit 3; evidence copy; **byte-identity invariants** for main-newer, backup-newer, corrupt-main (hash before/after, directory listing diff).
  - Surfaced by: E1; findings 3A, 4A, 7A, 18A, 21A, 24A, 26A. Verify: `npx vitest run packages/server/src/state` green; `npm run typecheck`.

- [ ] **T2 (P1, human ~1d / CC ~30m)** — state — **Pure merge and scrub.**
  - `packages/server/src/state/merge.ts`: `mergeCreatures` (union by id; **per field**: `bond` max, `xp` max if present, `mood`/`energy` from the side with the newer `lastSeenAt`, card kept if either side has one, `retired` from the newer side and stated in the fixture; never whole-record, OV-A), `mergePins` (union; a contested pin goes to the side with the newer `layout-pinned` event for that creature, falling back to the newer save; orphans pruned via `prunedPins`), `mergeLedger` (same day → per-field max; else newer day), `mergeEvents` (union deduped on at/type/creatureId/detail, sorted), `mergeMeta` (`createdAt` min, `updatedAt` max, `robot.residentId` from the newer save if that creature survives else null, `problems` union by path), composed by `mergeState(a, b)`; both sides run through `migrateState` first. `mergeEventLogs(a, b)` over event arrays. `scrubPaths(state)`: blanks every `sourcePath` and `problems[].path` AND rewrites every project id from `project:<encoded absolute path>` to `project:<display-name slug>-<sha256(old id)[:8]>`, applied consistently to creature keys, `layout.pins` keys and `robot.residentId` (OV-C; appearance is unaffected because DNA keys on kind + name; helper ids untouched). **Hard order: prune before scrub**, because `isScratchProject` reads the `sourcePath` that scrub blanks. `diffStates(a, b)` summary. **Whole-save freshness is never used; a wiped side must never win.**
  - Tests: two diverged fixture saves incl. the wipe case; **property tests** (idempotent `merge(a,a)=a`, union-commutative, wipe-cannot-win) over a seeded handwritten generator; scrub asserts zero path-like strings remain.
  - Surfaced by: E2; findings 1A, 9A, 15A, 18A, 23A. Verify: `npx vitest run packages/server/src/state/merge.test.ts`.

- [ ] **T3 (P1, human ~1d / CC ~35m)** — cli — **`village-save`.**
  - `packages/server/scripts/village-save.ts`: `export [--scrub-paths] --out`, `import <dir|file> --into`, `merge <dirA> <dirB> --out`, `diff <a> <b>`, `snapshot <dir>`, `prune --scratch <dir>`; operates on data directories (state + events + `shadow/` ∪ + `archive/` ∪; drops `state.backup.json`, `scan-cache.json`, `server.pid`); `merge`/`import` append `save-merged`. Safety contract: output must not exist unless `--force` (and `import --force` snapshots what it replaces); temp + rename writes; every write holds the data-dir lock from T1 for its whole duration and refuses (exit 75) when the lock is held by a live process (OV-G; the old pid-file probe is not enough: a booting server has no pid file yet); exit 2 for newer-than-build, 3 for a failed safety copy, 64/65/66/73/74 otherwise; same dir as A and B or out inside an input → exit 64.
  - `package.json`: `village:export`, `village:import`, `village:merge`, `village:diff`, `village:snapshot`, `village:prune`.
  - Tests (sandbox): one per safety rule; hostile-QA run of every command against a live fake server → exit 75, no file touched.
  - Surfaced by: E2; findings 6A, 16A, 17A. Verify: `npx vitest run packages/server/scripts`.

- [ ] **T4 (P1, human ~2h / CC ~15m)** — discovery — **Scratch-workspace filter.**
  - `packages/server/src/bridge/projects.ts`: export `isScratchProject(cwd, roots)` reusing the segment normalizer (case-insensitive on win32); defaults `<home>/AppData/Roaming/Claude/scratch-workspaces` (verified: the hatched scratch villager's id encodes exactly this path) and `<home>/AppData/Local/Temp/claude` (Claude Code scratchpads), plus the macOS equivalents; `VILLAGE_SCRATCH_ROOTS` (split on `path.delimiter`) extends the defaults; relative or malformed root → one warning line, ignored; apply after cwd election. Note in the doc comment that `reconcileProjects` never releases a vanished project, so existing junk is removed by `village-save prune --scratch` (T3).
  - Tests: fixture tree with a scratch project; env extension; malformed root warning.
  - Surfaced by: E5; finding 16A. Verify: `npx vitest run packages/server/src/bridge/projects.test.ts`.

- [ ] **T5 (P1, human ~0.5d / CC ~20m)** — world badge —
  - `packages/server/src/api/app.ts`: `withMode()` adds `world: { version, dataDirName, snapshot, lastSavedAt }`, so `/api/state` and the WebSocket frame (`type: 'state'`, lines 232 and 235) carry it; the `/api/health` handler (line 86, its own object, not `withMode`) adds the same `world` object (OV-F).
  - `packages/web/src/net/protocol.ts`: `VillageView` gains an optional `world`, and `toView` (an explicit allowlist, line 88) copies it through; absent stays undefined.
  - `packages/web/src/ui/weather-menu.ts`: `render()` rebuilds the popover with `innerHTML` (line 250), so the World line is a `<div id="weather-menu-world">` appended **after** that assignment with its text set via `textContent`, never interpolated into the HTML string; last in the popover, IBM Plex Mono, dimmed, unboxed, omitted when `world` is absent; wording `World: skill-village · v5 · live · saved 2 min ago` (`snapshot` replaces `live`; saved clause omitted until the first save); re-renders on every `state` frame.
  - Tests: menu model with a hostile name and with a missing field; protocol optional field; health payload shape.
  - Surfaced by: E4; findings 11A, 14A, 26A, 30A. Verify: web + server suites green; the user judges the line live at the re-judge.

- [ ] **T6 (P1, human ~4d / CC ~4h; re-priced at OV-B)** — deploy — **`deploy:village`.** Expand with superpowers:writing-plans before building.
  - `deploy/deploy-village.ts` (tsx): config from `VILLAGE_DEPLOY_HOST` / `VILLAGE_DEPLOY_USER` validated by strict patterns (host `^[A-Za-z0-9.-]+$`, user `^[a-z_][a-z0-9_-]*$`, sha `^[0-9a-f]{7,40}$`); pure command assembly; argv-array transport (`spawn` without shell). Privileged remote steps: the generated script is `scp`'d to `/tmp/deploy-<sha>.sh`, then run as `ssh -t <host> sudo bash /tmp/deploy-<sha>.sh` so sudo can prompt on the tty (OV-F; stdin-fed `bash -s` cannot prompt). One prompt per deploy, no sudoers change.
  - **Two modes.** Default = code only: build, release, switch, restart, smoke; the public state is never touched (OV-E). `--seed` adds the pre-seed copy, the scrubbed export, and the atomic install, and prints "this overwrites visitor state on the public village" before `--yes`. The M5 deploy (T10) runs `--seed` once; the Peddler and M6 releases run code-only. Both step lists are golden-tested.
  - Step list `{ name, run, undo }` with a runner and an undo stack: precheck (clean tree, **HEAD contained in `origin/<branch>`, else refuse with "push first"** (OV-F 9), typecheck + tests green) → build web → upload to `/var/www/village-game.releases/<sha>` + `chmod -R a+rX` (the runbook's scp-permissions trap, OV-F 2) → remote: clone/pull into `/srv/skill-village/releases/<sha>` + `npm ci` (old release still serving) → verify droplet release commit == local commit → **install updated unit + `daemon-reload`** → stop → [seed mode: copy `state.json` → `state.pre-seed-<ISO>.json` → scp scrubbed export to /tmp → `install` atomically] → switch `current` symlinks (server checkout and `/var/www/village-game`; the **first** run moves the existing real `/var/www/village-game` directory aside as `village-game.releases/legacy` before creating the symlink; Caddy follows symlinks, no reload) → start → smoke (`/api/health` ok + version + snapshot, `/` 200, a `project` creature present, 30 s wait) → receipt. Failure after stop unwinds to the old state and says so. Smoke FAIL keeps the release up and prints the rollback command. `--dry-run` prints the steps and assembled commands; `--yes` required for a real run; `--rollback` reuses the runner over the last receipt (symlinks back, pre-seed restored if that run seeded, restart, smoke). Lock file `~/.skill-village/deploys/.lock` (pid + process start time; stale when the pid is dead or that pid's process started later); SIGINT/SIGTERM trap pops the undo stack. Receipt JSON (time, mode, local and droplet commits, creature count before/after, version, smoke results, rollback command) printed, written to `~/.skill-village/deploys/<ISO>.json`, one line to the droplet journal. Keep the last 3 releases.
  - `deploy/skill-village.service`: `WorkingDirectory=/srv/skill-village/current`, `RestartPreventExitStatus=2`, and `StartLimitIntervalSec=60` + `StartLimitBurst=5` in `[Unit]` so a persistent exit 3 stops looping after five tries (OV-F 4).
  - `package.json`: `deploy:village`.
  - Tests: config validation + assembly units; **golden remote script** for a fixed sha (`deploy/__golden__/`); **runner chaos test** (failure and SIGINT injected at every step index unwind exactly k−1 undos).
  - Surfaced by: E3; findings 2A, 3A, 5A, 8A, 10A, 12A, 13A, 19A, 22A, 27A. Verify: `npx vitest run deploy`; `npm run deploy:village -- --dry-run` prints the plan without touching the droplet.

- [ ] **T7 (P1, human ~2h / CC ~20m)** — docs — `docs/village-deploy.md` rewrite: script-first; six-row table (what you see / what it means / what to do) for exit 2, exit 3, aborted before stop, failed after stop, smoke FAIL, lock held; rollback section; **migration rehearsal procedure** (export a copy, run the new build on it under `VILLAGE_DATA_DIR`, verify the snapshot file and the `save-migrated` event, diff, adopt) cited by the Peddler plan; unit-file notes; Appendix A manual path. `README.md` license line. Surfaced by: findings 25A, 29A; D8.

- [ ] **T8 (P1, human ~10m / CC ~2m)** — license — `LICENSE`: MIT, `Copyright (c) 2026 Truman Fenley`, plus a `NOTICE` (or a LICENSE trailer) stating that `firmware/`, when the robot-v1 branch merges, is third-party MIT code (Copyright YukiHiko, see `firmware/UPSTREAM-LICENSE`) and is not covered by the root notice (OV-F 7). Surfaced by: D8, finding 20.

- [ ] **T9 (P1) [HUMAN-assisted] (human ~1h / CC ~15m)** — merge the saves — Stop every village server. Archive both originals by hash outside TEMP (`~/.skill-village/archive/snapshots/`). `npm run village:merge -- <isolated dir> ~/.skill-village --out <new dir>`; `npm run village:prune -- --scratch <new dir>`; `npm run village:diff -- <new dir> ~/.skill-village` and against the isolated dir; the user reads the diff; adopt: `npm run village:import -- <new dir> --into ~/.skill-village` (snapshots the replaced state); retire the TEMP dir (leave a README pointer); start the dev server (`npm run dev`, backgrounded) on `~/.skill-village` and hand the user http://localhost:5173 for the M5 re-judge. Expected: 97 creatures (98 minus the scratch villager), 31 pins (26 + 6 − 1 overlap), World line visible. Surfaced by: D6; findings 16A, 28A.

- [ ] **T10 (P1) [HUMAN] (human ~1h / CC ~20m)** — first deploy — `npm run deploy:village -- --dry-run` (user reads the step list and the remote script), then `-- --yes` with the user at the keyboard for the sudo prompt. Post-deploy checklist: `/api/health` ok, version 5, snapshot true, creature count 97, `/` 200; project villagers visible at village.fenley.ai; World line shows `snapshot`; `/v1` still rate-limited; journal shows no restart loop; receipt written. Surfaced by: D7; E3; finding 28A; Section 9.

- [ ] **T11 (P2, human ~2h / CC ~30m)** — git — Branch ledger over **all 15 remote heads** (OV-F 8): a table in `docs/summaries/BRANCHES.md` with one keep / land / delete verdict each. Known verdicts: `main`, `gh-pages`, `robot-v1` (four live worktrees track it), `m4-5-peddler` (next plan) = keep; the four doc-only salvage branches (`claude/art-direction-minigame-c0e07b`, `claude/m5-continuation-626bed`, `claude/spectator-on-main-seating`, `claude/skills-projects-agents-mechanics-36973e`) = land their docs on main, then delete; the merged `claude/creature-drag-visual-5168e5` and `claude/skill-village-monetization-1ca575` = delete; the remaining review/session branches get a verdict after a `rev-list --count main..<branch>` check. Surfaced by: E6.

- [ ] **T12 (P2, human ~30m / CC ~10m)** — docs — Close-out: `docs/summaries/CHECKLIST.md` foundation section; `TODOS.md` completed items; note the receipts location. Surfaced by: required outputs.

## NOT in scope (considered, deferred)

- E7 droplet ops (needs the droplet's numbers; TODOS.md).
- Peddler landing: the next plan (rebase 19 commits, gallery → STATE_VERSION 6, rehearse per T7's procedure, re-read the spec against projects-as-villagers).
- M6 Care design: after the Peddler; `/office-hours` first; known gap: `ensurePersona` reads a project folder as a file.
- Pocket God: approved spec, after M6 unless pulled forward.
- Robot track: parallel sessions; the reconciliation delta and the pre-flash findings live there.
- Snapshot pruning (growth is one file per migration); Swarm Showroom (separate app); second-machine sync (export/import ship, sync does not; TODOS.md); `/v1` shim retirement (robot cleanup); save encryption or cloud backup; a notice-board consumer for `/api/events` (TODOS.md, for M6).

## Dream state delta

One world, never lost by a wrong server: done. Carry it in one file: done (bundle later). Ship with one command and a receipt: done. `state/` reads as load, classify, snapshot, migrate, merge, scrub, diff: done if T7's docs land. Not yet: rewind, second-machine sync, the Peddler, M6, a public notice board.

## Failure modes registry (Section 2 and required outputs; 0 critical gaps)

```
  CODEPATH         | FAILURE MODE                 | RESCUED | TEST            | USER SEES              | LOGGED
  -----------------|------------------------------|---------|-----------------|------------------------|-------
  loadState        | newer main / newer backup    | Y       | bytes invariant | one sentence, exit 2   | Y
  loadState        | snapshot write fails         | Y       | sandbox         | one sentence, exit 3   | Y
  loadState        | corrupt main                 | Y       | evidence copy   | startup note           | Y
  village-save     | overwrite / live server /    | Y       | per rule        | refused line           | Y
                   | half-written output          |         |                 |                        |
  mergeState       | wipe side wins               | Y       | property        | none possible          | -
  deploy           | failure before stop          | Y       | runner          | aborted at <step>      | receipt
  deploy           | failure after stop           | Y       | runner          | old state restarted    | receipt
  deploy           | npm ci fails                 | Y       | runner          | aborted, live intact   | Y
  deploy           | smoke fails                  | Y       | runner          | FAIL + rollback cmd    | receipt
  deploy           | Ctrl-C / double run          | Y       | runner          | unwind / lock held     | Y
  droplet unit     | exit 2 restart loop          | Y       | golden script   | journal, stays down    | Y
  World line       | absent field / hostile name  | Y       | jsdom           | omitted / plain text   | -
  scratch rule     | malformed root               | Y       | unit            | one warning            | Y
```

The full error-and-rescue map, the architecture, boot state machine, deploy sequence, data-flow shadow paths, error flow, rollback flowchart and user-flow diagrams are in the review conversation of 2026-09-02 and summarized in the CEO decision record.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 7 proposals, 6 accepted, 1 deferred; 30 findings + 7 outside-voice tensions, all decided; 0 critical gaps |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES ROUTED (Claude subagent — Codex not installed) | 18 findings; 7 presented as tensions, all decided; 9 mechanics corrections folded into T4–T11 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | required before the build starts (last night's eng review covered the robot plan, not this one) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not warranted: UI scope is one text line (Section 11) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **CODEX:** outside voice ran as a fresh-context Claude subagent that read the live repo; its factual claims were verified before presentation (unpushed main, project ids embedding the home path, `toView` allowlist, innerHTML popover rebuild, stdin-fed sudo, firmware third-party license: right; `lastSeenAt` semantics and "checklist lies": wrong).
- **CROSS-MODEL:** both reviewers converged on the wipe path, the deploy ordering and the receipt; the outside voice added the project-id leak, the code-only deploy default and the sudo tty problem; it argued for landing the Peddler first and cutting E2/E3, which the user declined (OV-B) while accepting the re-priced E3.
- **VERDICT:** CEO CLEARED — eng review required before implementation.

NO UNRESOLVED DECISIONS
