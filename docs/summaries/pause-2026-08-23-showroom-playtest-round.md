# Session Handoff: Swarm Showroom S1 merged; playtest polish round in flight
**Date:** 2026-08-23 at 07:20
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web/.claude/worktrees/skill-village-monetization-1ca575
**Branch:** claude/skill-village-monetization-1ca575
**Uncommitted changes:** no
**Stale if:** branch moves past `123b3ec` · local main moves past `34e2cb0` · the spectator vite on :5176 or showroom API on :8263 stops (playtest URLs die) · `stash@{0}` on the MAIN checkout is dropped
**Transcript:** (current session)

## What Was Accomplished
- **Monetization track opened**: brainstormed Swarm-sells-its-builds (eggs incubate publicly → commons free forever → judge-picked, keeper-confirmed rares auction 1-of-1: buyer gets repo + live app + the creature). Decomposed S1 showroom → S2 feed extensions → S3 auction → S4 delivery.
- **S1 spec** (`docs/superpowers/specs/2026-08-23-swarm-showroom-design.md`, commit `6939b88`) and **13-task plan** (`docs/superpowers/plans/2026-08-23-s1-swarm-showroom.md`, `184d1c9`).
- **Design assets**: clickable mockup canvas (Swarm Showroom artifact) and the user's Claude Design trailer vendored runnable at `reference/swarm-village-trailer/` (`2280372`) — named visual source of truth in spec §5.
- **S1 executed via subagent-driven development**: 13/13 tasks, per-task reviews, one BLOCKED diagnosis (worktree resolved `@village/core` through the MAIN checkout's node_modules → fixed with worktree `npm install`), final whole-branch review (fable) + one fix wave (`80d5f1c`: WS keepalive ping + nginx timeouts, chip plurals, 1s countdown tick, empty-status clear). 604 tests at merge time.
- **Merged to main** as `73c0a4d` (merged-result verified 607/607 then; suite now 674/674 after other sessions' sound-engine + robot merges fast-forwarded into this branch at `34e2cb0`).
- **Playtest round (user's eyes, in progress)** — two findings fixed, committed on this branch, NOT yet merged to main:
  - `bad1be1` villagers no longer seat inside houses/trees: new pure `packages/web/src/spectator/barriers.ts` (segmentRange + placeAvoiding, 9 tests), `hashId` exported from `layout/zones.ts`, scene uses `COMMONS_BARRIERS`.
  - `123b3ec` blink lid oversized to U*2.4 in `packages/web/src/scene/creature.ts` — baked eye-white peeked past an exact-size lid under breath squash (affects game + spectator).
- Live verification: spectator page boots clean at localhost:5176/spectator.html against the real feed (6 villagers · 1 egg), zero console errors.

## Decisions Made
- Rare = keeper config entry (`~/.swarm-showroom/showroom.config.json`, SIGHUP reload); S1 infers egg = no repo link, live hatch = repo appears between polls.
- DNA continuity: residents seeded `swarm:<slug>` via core `swarmAppearance` — S4 reproduces the exact creature; never change the seed.
- Persistence is a recovery aid, not a transaction log: poll persist failures log + never skip notify; on-disk event-log gap under disk failure accepted.
- Orphaned feed entries stay in the village (mergeRoster), announced once; keeper `hidden` is the only delisting.
- Final review triage: WS keepalive/nginx timeouts + plurals + countdown fixed pre-merge; deferred minors listed in the merged plan's final-review report (link scheme check, reconnect backoff, fetch timeout, ambient life judgment → playtest gate).
- Barrier fix design: split commons into clear segments around scenery footprints, hash-weighted assignment, reuse placeInRange per segment; fallback to whole range if barriers swallow it (overlap beats missing).

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/superpowers/specs/2026-08-23-swarm-showroom-design.md | create | S1 spec (binding authority) |
| docs/superpowers/plans/2026-08-23-s1-swarm-showroom.md | create | 13-task TDD plan |
| reference/swarm-village-trailer/* | create | runnable Claude Design trailer, visual bible |
| packages/core/src/swarm.ts (+test) | create | swarm:<slug> DNA namespace |
| packages/server/src/bridge/swarm.ts (+test) | create | feed fetch + tolerant parse (shared with M5 nursery) |
| packages/server/src/showroom/{config,state,persist,runtime,app,main}.ts (+tests) | create | showroom server |
| packages/web/spectator.html, vite.spectator.config.ts, src/spectator/{main,client,scene,panel,protocol,copy,egg,barriers}.ts (+tests) | create | spectator app |
| packages/web/src/layout/zones.ts | modify | placeInRange extraction; hashId export |
| packages/web/src/net/protocol.ts | modify | filterRenderable extraction |
| packages/web/src/scene/creature.ts | modify | blink lid oversize (U*2.4) |
| docs/showroom-deploy.md | create | droplet deploy notes (nginx incl. WS timeouts) |
| .claude/launch.json (untracked) | modify | showroom-api :8263, spectator :5176 (--strictPort), swarm-trailer :8264 |

## Git State
```
(clean)
```

## Checklist
- [x] S1 spec + plan written, committed, user-approved
- [x] S1 executed (13 tasks, SDD) + final review + fix wave
- [x] S1 merged to main (`73c0a4d`), merged result verified green
- [x] Playtest fix: scenery barriers (`bad1be1`)
- [x] Playtest fix: blink lid white-pixel sliver (`123b3ec`)
- [ ] User playtest continues at localhost:5176/spectator.html — more findings expected (in progress)
- [ ] Merge the playtest round (`bad1be1`+`123b3ec`+any new) to main when the user calls it good
- [ ] Push local main to origin (user's call — it also carries other sessions' merges)
- [ ] Drop `stash@{0}` on the MAIN checkout (byte-identical pre-merge debris) once confirmed unneeded
- [ ] Deploy showroom to the droplet per docs/showroom-deploy.md (village.fenley.ai) + smoke test
- [ ] Ambient life judgment (clouds/smoke/butterfly not in scene — user decides at the gate; trailer has the constants)
- [ ] S2 brainstorm: swarm feed extensions (lay-time eggs, judge tier, completed_at)
- [ ] (carried) Execute the palette plan — other session, Tasks 1–14 of 2026-08-23-time-of-day-palettes.md
- [ ] (carried) Palette arc final playtest sweep
- [ ] (carried) M5 implementation plan (writing-plans against the remap spec)
- [ ] (carried) LICENSE decision (user's call; MIT suggested)
- [ ] (carried) Optional: Pages landing refresh
- [ ] (carried) Playtest leftovers from M4 final review (bubble occlusion, meter granularity, trackpad tap + double-click)
- [ ] (carried) Backlog: project breeding (parked)

## Self-Critique
- **Least confident:** (1) canvas visuals — I never actually SAW the rendered village (Browser pane stayed hidden; all verification was DOM/console/tests), so barrier spans vs. drawn pixels and the lid fix are test-proven but not eyeballed; (2) the WS keepalive `socket.ping()` in app.ts is unexercised by any test; (3) the spectator scene against the freshly merged sound engine + robot changes — suite is green but no browser session has run the GAME and spectator side by side since the fast-forward; (4) barrier spans are hand-derived from scenery constants — a prop moved in buildScenery silently un-syncs COMMONS_BARRIERS.
- **Biggest thing being missed:** other sessions are landing on local main concurrently (sound engine, robot, palettes queued) — every merge in this repo now races; the S1 merge already absorbed one surprise commit mid-flight.
- **If it breaks in 3 months:** the swarm feed's real shape drifts from the S1 inference (egg = no repo link) before S2 lands — hatches stop firing and nobody notices because the showroom still renders; or the palette arc reshapes THEME/scene and the spectator's static day palette + scenery constants quietly diverge from the game's look.
- **Did NOT do:** deploy to the droplet (docs only); playtest-gate signoff; ambient life; panel live countdown (S3); deferred minors from the final review (link scheme check, reconnect backoff, fetch AbortSignal timeout); did not push main; did not clean the worktree/branch (session lives in it); did not verify `.ping()` behind real nginx.
- **How to check:** visuals → open localhost:5176/spectator.html with the pane visible and screenshot; keepalive → deploy behind nginx without the timeout lines and watch ws frames for >60s, then with them; feed drift → `curl -s https://swarm.fenley.ai/api/projects | head` vs spec §3 table; barrier sync → compare COMMONS_BARRIERS spans against buildScenery calls in scene.ts (props at 610/900/1160/1420); stash → `git -C <main> stash show -p stash@{0}` before dropping.

## Remaining Work
1. Keep the playtest loop: user reports → fix one at a time on this branch → commit → HMR shows at :5176.
2. When the user calls the round good: `git checkout main && git merge claude/skill-village-monetization-1ca575` from the MAIN checkout (fast-forward expected unless other sessions moved main — re-run the suite on the merged result either way).
3. Deploy per docs/showroom-deploy.md; smoke `curl https://village.fenley.ai/api/health`.
4. Then S2 brainstorm (superpowers:brainstorming; spec §10 lists the seam).

## Open Questions
- Ambient life: add clouds/chimney smoke/butterfly from the trailer, or keep the meadow stiller than the trailer?
- Push local main to origin now or after the palette arc merges too?
- Rare drop №1: which slug, what auctionOpensAt (needs the keeper config on the droplet)?

## Coordinate Closet
- `123b3ec` (blink lid fix, branch HEAD)
- `bad1be1` (barriers fix)
- `34e2cb0` (main @ handoff time = sound-engine merge)
- `73c0a4d` (S1 merge into main)
- `80d5f1c` (final fix wave) · `582324b` (deploy docs) · `d0816f8` (spectator app) · `2280372` (trailer vendored) · `184d1c9` (plan) · `6939b88` (spec)
- `8fe0f18` (robot resident, other session) · `66b0754` / `23272f0` (sound polish, other session)
- `b18890f` (Task-5 fix: npm install + dedupe) · `40262a0` (core swarm.ts)
- http://localhost:5176/spectator.html (playtest URL; vite --strictPort 5176 serving THIS worktree)
- http://127.0.0.1:8263 (showroom API; `npm run dev:showroom`)
- http://localhost:8264/Swarm%20Village%20Animation.dc.html (vendored trailer via http-server)
- `C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web` (MAIN checkout; holds `stash@{0}` = "pre-S1-merge: stray showroom debris"; README.md dirty = other session's)
- `~/.swarm-showroom/showroom.config.json` (keeper config: feedUrl/rares/trivia/hidden; SIGHUP reload)
- https://claude.ai/code/artifact/37c63481-71db-431d-a014-a3ebdccc2cf7 (Swarm Showroom mockup canvas)
- `384a90cc-afb8-4009-b96f-536c64906224` (Claude Design projectId, trailer)
- https://swarm.fenley.ai/api/projects (live feed) · village.fenley.ai (deploy target)
- `COMMONS_BARRIERS` spans: 598–662 / 888–1006 / 1148–1212 / 1408–1526 (props at 610, 900, 1160, 1420)
- `swarm:<slug>` (DNA seed namespace — never change)

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.
Present the rebuilt checklist + Remaining Work and ask whether to continue or do
something else.
