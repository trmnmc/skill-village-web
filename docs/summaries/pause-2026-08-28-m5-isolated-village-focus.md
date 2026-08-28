# Session Handoff: M5 shipped, two sessions collided over one save, this session got its own village — and the user wants FOCUS
**Date:** 2026-08-28 at 18:01
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** yes — `packages/server/src/main.ts` + `packages/web/vite.config.ts` (the isolation env vars, typecheck-green, NOT committed)
**Stale if:** `main` moves past `87025f0` · the isolated server on `http://127.0.0.1:8263/api/health` stops reporting 97 creatures (it dies with this session's processes — just restart it, see Instructions) · `~/.skill-village/state.json` stops being version 5 · another session commits its own `VILLAGE_DATA_DIR` wiring (then diff mine against theirs instead of committing blind)
**Transcript:** (current session)

## READ THIS FIRST — the user's own words: "idk what is going on we need to focus"

The confusion is real and diagnosable. **Two Claude sessions were working in this ONE checkout at
the same time.** This session built and merged M5 (projects as villagers). A second session built
pinning/drag work, merged it, and bumped `STATE_VERSION` to 5 — while both sessions' dev servers
shared `~/.skill-village/state.json`. The v4/v5 servers took turns rejecting each other's save and
starting "fresh villages", which twice looked like data loss (it wasn't — backups existed each
time). Several hours went to diagnosing collisions instead of building. **The fix that ended it:
this session's village now runs on its own data dir + ports.** The focus going forward: ONE session
runs ONE server; before diagnosing anything "weird", first ask whether another session is running.

## What Was Accomplished

1. **M5 — the projects move in — is DONE and on `main`** (merged two sessions ago, then the other
   session merged pinning on top: `385ea87`). 22 real projects from `~/.claude/projects` live in the
   village as genie villagers with helper auras; work-signal scanning, decay curve, render
   instances, presence scaling all shipped test-first from the plan
   (`docs/superpowers/plans/2026-08-26-m5-projects-move-in.md`).
2. **The save-collision was root-caused**: not corruption, not a rogue worktree — the other session
   legitimately bumped `STATE_VERSION = 5` (pinning) while this session's older server still ran v4.
   An older server that reads a newer save starts a fresh village over it. The user's real progress
   (52 personas, 52 nicknames, 17 bonds) was restored from backup each time it got wiped.
3. **This session's village is ISOLATED and running**: `VILLAGE_DATA_DIR` + `VILLAGE_PORT=8263` +
   `VILLAGE_WEB_PORT=5175` (uncommitted env wiring in `main.ts` / `vite.config.ts`), data dir seeded
   from the clean v4 backup, migrated cleanly to v5 on boot. Live at **http://localhost:5175** — 97
   creatures (75 helpers + 22 projects), 52 personas, 17 bonds. The shared `~/.skill-village` is
   untouched and belongs to the other session (its server is currently down).
4. **Design ruling recorded** (owner's call): a project living in the robot house stands at the
   porch ALONE — aura dropped, not relocated ("it focuses on the project and lets it shine").
   Pinned in `packages/web/src/layout/instances.ts` comments (`ab55075`) and in the
   `playtest-lessons` memory. Do not "fix" it.
5. Detached-process lesson learned twice: `cmd /c set VAR=val && …` swallows a trailing space into
   the value (server silently used a nonexistent data dir → fresh village). Quoted
   `set "VAR=val"&&` is the working form.

## Decisions Made

- **Isolate rather than fight**: the user chose "isolate this session with its own save file" over
  restoring/racing the shared save. Env-var overrides, not code forks.
- **Never start this branch's server against a save whose version it doesn't know** — that is the
  entire wipe mechanism.
- **Don't commit the isolation wiring yet** — `main` was moving under us mid-merge; diff against
  the other session's work first.
- Aura-at-the-porch: dropped on purpose (see #4 above).
- Standing rule kept: push every commit immediately (all M5 commits are pushed; only the env
  wiring is uncommitted).

## Files Created or Modified (this session, still relevant)

| File | Action | Why |
|------|--------|-----|
| `packages/server/src/main.ts` | modified, UNCOMMITTED | `VILLAGE_DATA_DIR` override → isolated save |
| `packages/web/vite.config.ts` | modified, UNCOMMITTED | web port + proxy follow `VILLAGE_PORT`/`VILLAGE_WEB_PORT` |
| `packages/web/src/layout/instances.ts` | comment (`ab55075`, pushed) | porch-alone is design, not compromise |
| memory `playtest-lessons.md` | appended | the porch ruling, so no session "fixes" it |
| scratchpad `village-data-isolated/` | created | this session's live village data (v5, 97 creatures) |
| scratchpad `m5-smoke-backup/` | kept | clean v4 save: 75 creatures, 52 personas, 17 bonds |
| scratchpad `v5-state-from-other-session/`, `wiped-fresh-state/` | parked | forensic copies from the collision |
| `docs/superpowers/plans/2026-08-26-m5-projects-move-in.md` | earlier, pushed | the executed M5 plan |

## Git State
```
 M packages/server/src/main.ts
 M packages/web/vite.config.ts
```

## Checklist
<!-- snapshot of the TodoWrite list — resume rebuilds TodoWrite from these boxes -->
- [x] M5 implemented, merged, pushed (projects as villagers, auras, presence, work signal)
- [x] Save-collision root-caused (v4/v5 across two sessions); personas restored from backup
- [x] This session's village isolated (own data dir, 8263/5175) and verified live
- [ ] **Commit the isolation wiring** (`main.ts` + `vite.config.ts`) — after checking the other session hasn't landed its own version; then push
- [ ] **User's M5 visual verdict** — http://localhost:5175 — presence scale, aura crowding, commons density, all-instances-speak, plus the carried-over night-storm/HUD verdict
- [ ] **Session hygiene decision (the "focus" ask)**: one checkout + two sessions caused all of today's chaos — decide: one session at a time, or worktrees with isolated saves per session
- [ ] State-file lock or version handshake so an older server can never wipe a newer save (idea from this session; the isolation only protects THIS session)
- [ ] Branch salvage: `C:\Users\truman\Projects\skill-village-web` still holds 24 sole-copy branches
- [ ] Droplet: still pre-M5 (deploy M5 + reseed decision — reseed publishes real folder paths, wipes visitor state); voice login decision; LICENSE; M6 plan
- [ ] Housekeeping (carried): droplet reboot pending, memory tight; 8 merged remote branches deletable; Chunks server restart

## Self-Critique
- **Least confident:**
  1. The isolated village dies whenever this session's processes are reaped — three restarts today; "detached" survived the pane but not session teardown.
  2. I told the user "corruption, likely two servers racing" before finding the real cause (v4/v5 version skew). Corrected in-session, but the wrong explanation is in the transcript.
  3. Whether the other session has its OWN uncommitted `VILLAGE_DATA_DIR`-style wiring that will conflict with mine on commit.
  4. The v5 migration of the restored v4 save ran under the other session's schema code I never read — counts verified (97/52/17), field-level correctness not.
- **Biggest thing being missed:** nothing forces one-session-one-server; the collision machinery is all still in place the moment two sessions run `npm run dev` again. The isolation saved THIS session only.
- **If it breaks in 3 months:** someone runs the checkout's server against the shared save after another version bump and "loses" the village again — or the scratchpad (temp dir!) holding `village-data-isolated/` gets cleaned by the OS and this session's village state silently vanishes.
- **Did NOT do:** commit the env wiring; any UI look at the village (user never confirmed seeing it render); state-lock design; M6 plan; branch salvage; droplet anything.
- **How to check:** server alive → `curl http://127.0.0.1:8263/api/health` (expect 97). Save intact → `node -e` count on `village-data-isolated/state.json` (v5/97/52 personas/17 bonds). Other session's wiring → `git status` + `git log --oneline -3` before committing mine. Migration correctness → open a persona'd creature's panel at :5175 and check its card text survived.

## Remaining Work

1. **Commit or reconcile the isolation wiring** — diff `main.ts`/`vite.config.ts` against `main` first (`git diff`), then commit + push if the other session hasn't landed equivalent wiring.
2. **Get the user's eyes on http://localhost:5175** (restart first if down — see Instructions) — this is the M5 + sky verdict, blocked on them alone for three sessions now.
3. **Propose the focus fix**: either "one session per checkout, ever" as a rule, or per-session `VILLAGE_DATA_DIR` defaults + a state-version handshake. Small design, big calm.
4. Move `village-data-isolated/` somewhere durable (it lives in a TEMP scratchpad) if this isolated village should outlive the week.
5. Then the standing backlog: M6 plan, branch salvage, droplet M5 deploy + voice + LICENSE.

## Open Questions

- Does the rendered village pass your eye? (Presence scale, auras, commons, night storm, HUD chip — all still unjudged.)
- One-session-at-a-time, or invest in real multi-session isolation?
- Is the isolated village the "real" one now, or is `~/.skill-village` (the other session's) canonical once the dust settles? Two saves now exist with different histories.
- Commit the isolation wiring as-is, or coordinate with the other session first?

## Coordinate Closet
<!-- Exact ids/paths/SHAs/PR-refs/key=value pairs scraped VERBATIM from this session. Newest-first, deduped. -->
- `87025f0` (main HEAD) · `385ea87` (other session's pinning merge, bumped STATE_VERSION→5) · `ab55075` (porch-alone comment) · `f3d3946` (M5 plan commit)
- isolated village: `VILLAGE_DATA_DIR=C:\Users\truman\AppData\Local\Temp\claude\C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web\eddfbaa3-e4a1-4cab-b27d-1acb57df9d76\scratchpad\village-data-isolated` · `VILLAGE_PORT=8263` · `VILLAGE_WEB_PORT=5175` · http://localhost:5175 · health `http://127.0.0.1:8263/api/health` → `{"ok":true,"creatures":97}`
- restart form (PowerShell, quoted-set is load-bearing): `cmd /c set "VILLAGE_DATA_DIR=<iso>"&& set "VILLAGE_PORT=8263"&& set "VILLAGE_WEB_PORT=5175"&& npm run dev` from repo root, detached; log `%TEMP%\skill-village-isolated.log`
- backups (all under scratchpad `C:\Users\truman\AppData\Local\Temp\claude\C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web\eddfbaa3-e4a1-4cab-b27d-1acb57df9d76\scratchpad\`): `m5-smoke-backup/` (v4, 75c, 52 personas, 17 bonds — the golden copy) · `v5-state-from-other-session/` · `wiped-fresh-state/`
- shared save `~/.skill-village/state.json` = v5, 75 creatures, 0 projects, 52 personas (other session's; do not touch)
- counts: isolated live = 97 creatures / 22 projects / 52 personas / 17 bond>10 · `STATE_VERSION = 5` on main
- other checkout (branch salvage, untouched): `C:\Users\truman\Projects\skill-village-web` (HEAD `81f0d24`, 24 branches)
- droplet: `68.183.99.200` · village.fenley.ai (pre-M5, bundle `index-CC7JZXjz.js`, 75 creatures) · `~/.ssh/village_deploy`
- M5 plan: `docs/superpowers/plans/2026-08-26-m5-projects-move-in.md`

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.

Environment facts: the isolated village dies with this session's processes — restart
it with the quoted-set command in the Coordinate Closet and verify 8263 reports 97.
**Two sessions may be sharing this checkout** — before diagnosing anything strange,
run `git log --oneline -3` and check whether `main` moved, and check port 8262 for
the other session's server. The user asked for FOCUS: keep to ONE thread (the
checklist order above), state which thread you're on, and don't start servers
against `~/.skill-village`. Standing rule: push every commit immediately.
Present the rebuilt checklist + Remaining Work and ask whether to continue or do
something else.
