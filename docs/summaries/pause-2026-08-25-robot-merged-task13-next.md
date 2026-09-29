# Session Handoff: Robot embodiment R1+R2 merged — Task 13 (hardware) is next
**Date:** 2026-08-25 at 05:45
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web/.claude/worktrees/m5stackchan-personality-houses-59eeeb
**Branch:** robot-embodiment
**Uncommitted changes:** no (this handoff + CHECKLIST.md mirror are the only new files)
**Stale if:** origin/main moves past `1cddcc7` · `docs/robot/SETUP.md` exists (Task 13 started elsewhere — resume THAT work, don't redo) · `packages/server/src/robot/fixtures/` contains `*.json` (fixtures captured; run the replay test) · preview server `843e6932-24fb-418e-8ad9-d19e22a49275` (port 65347) no longer running (playtest-stack section stale)
**Transcript:** (current session)

## What Was Accomplished
- **Brainstormed the M5StackChan robot into the village** (user bought the ESP32-S3 kit): the robot IS a house — drag a creature onto the robot-house in the web village and the physical robot becomes them (voice, personality card, canned fallbacks). Spec: `docs/superpowers/specs/2026-08-23-robot-embodiment-design.md`. Architecture: XiaoZhi-protocol brain-swap — open firmware → self-hosted voice gateway (xiaozhi-esp32-server, Docker, local ASR) → OpenAI-compatible shim inside skill-village-server → existing claude chat pipeline. Privacy locked: user's voice audio never leaves the PC; only reply text goes to OpenAI TTS (user's choice; Piper local fallback); never xiaozhi.me.
- **Plan written and executed via subagent-driven development**: `docs/superpowers/plans/2026-08-23-r1-r2-robot-embodiment.md` — 14 tasks; 13 software tasks done (Task 13 = hardware, deliberately pending). Two task-review fix rounds (state-validation version floors; scenery-clearance layout test), two workspace-escape incidents (haiku implementers committed strays `8fe0f18`, `a9fd542` onto parent main; both redone properly; haiku retired from committing), final whole-branch review (fable): **ready to merge**, its 3-fix wave applied.
- **Survived a 102-commit main drift**: rebase commit `79bca20` renumbered the state bump to `STATE_VERSION = 4` (main's remap had taken 3) with chained v1→v2→v3→v4 migration, moved the robot store-gate to `>= 4`, repainted robotHouse + drag ghost onto main's new token system (`sceneryColor`/`tokenTag` — THEME was retired), and gave the porch `wander: 0`.
- **Merged to main as `842ca08` and pushed** (origin/main contains it).
- **Playtest stack stood up safely**: sandboxed home (copies of skills/agents; throwaway save) so the real `~/.skill-village` v3 save was never touched; stack runs from this worktree at http://localhost:65347 (vite) + 127.0.0.1:8262 (server, 19 villagers, silent-movie mode expected). Live-boot sanity passed: `/api/robot` round-trip and `/v1/chat/completions` empty-house line verified over real HTTP.

## Decisions Made
- Robot track is R1–R3, parallel to the M-roadmap; depends only on M4. R3 (greetings, idle lines, per-creature voices, mood→face) deliberately unplanned until R1's fixtures answer the push-channel and TTS-parameter questions.
- Voice: OpenAI TTS (reply text only leaves the PC) + Piper offline fallback; ASR local (SenseVoice class); per-creature voices in R3.
- Never-mute: `EMPTY_HOUSE_LINE` / `MOVED_AWAY_LINE` / canned-pool fallback — every shim 200 speaks. One ledger (M4 interactive budget), one life (robot chat = chat-panel chat for care/events). Kind-agnostic embodiment.
- VILLAGE_HOST env opts the server onto the LAN for the Docker gateway (`||` so empty stays loopback) — the unauthenticated-API exposure is parked to Task 13's SETUP.md (firewall note + optional api_key check on `/v1/*`).
- Stray commits on main were left in place (revert-then-remerge trap; concurrent live sessions) — merge presumably deduped them by content (not verified, see Self-Critique).
- Full rulings ledger (11 rulings): `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/progress.md` (note: its SHAs are pre-rebase).

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/superpowers/specs/2026-08-23-robot-embodiment-design.md | created | the approved R-track design |
| docs/superpowers/plans/2026-08-23-r1-r2-robot-embodiment.md | created | 14-task plan (Task 13 pending) |
| packages/core/src/personality/prompt.ts | modified | spokenSystemPrompt + shared personaLines |
| packages/server/src/state/{schema,store}.ts | modified | robot block, STATE_VERSION 4, chained migration, floor validation |
| packages/server/src/village.ts | modified | setRobotResident, spoken chat style, activity stamp |
| packages/server/src/robot/{openai.ts,fixtures.test.ts} | created | OpenAI wire format; skip-capable fixture replay |
| packages/server/src/api/app.ts | modified | /v1 shim routes, /api/robot, robotLastTurnAt stamp |
| packages/server/src/main.ts | modified | VILLAGE_HOST binding |
| packages/web/src/net/{protocol,client}.ts | modified | robot view fields; setRobotResident helper |
| packages/web/src/layout/robot.ts, input/drag.ts, scene/robotHouse.ts | created | plot/hit-test, gesture tracker, the house |
| packages/web/src/scene/village.ts, main.ts | modified | drag-and-drop integration, porch, presence, wiring |
| .claude/launch.json (worktree, git-ignored) | created | "robot-playtest" preview entry (autoPort) |
| scratchpad robot-playtest.cmd + robot-home/ | created | sandboxed-home launcher + copied skills/agents |

## Git State
```
(clean)
```

## Checklist
<!-- snapshot — resume rebuilds TodoWrite from these boxes -->
- [x] R1+R2 software executed via SDD (14 tasks, reviews, fix waves, final review clean)
- [x] Rebase over main drift: STATE_VERSION 4 chain, token repaint, wander porch (`79bca20`)
- [x] Merged to main (`842ca08`) and pushed
- [ ] Web playtest verdict from the user (stack RUNNING at http://localhost:65347 — drag villager onto robot-house, swap, evict, click-chat/pan still work)
- [ ] Task 13 hardware bring-up, user present: Docker gateway (xiaozhi-esp32-server, local ASR, OpenAI TTS + key) → flash XiaoZhi-compatible firmware pointed at PC → first conversation → commit fixtures → SETUP.md + PLAYTEST.md (incl. VILLAGE_HOST firewall, /v1 api_key check, save-migration note) → exit tests (privacy traffic check, latency baseline, mid-conversation swap)
- [ ] After fixtures land: fixture replay auto-un-skips — run `npx vitest run packages/server/src/robot`, adjust parseChatRequest only if a real fixture fails
- [ ] R3 plan (greeting on swap, idle canned lines, per-creature voices, mood→face) once push-channel/TTS facts are known
- [ ] Delete SDD workspace `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/` after Task 13
- [ ] Carry-overs: LICENSE decision (still undecided); optional Pages landing refresh

## Self-Critique
- **Least confident:** (a) nobody's verdict on the robot-house VISUALS exists yet — and the rebase repainted it onto the token system, so it may read differently than designed; (b) the rebase+merge (`79bca20`, `842ca08`) happened outside this session's recorded loop — I verified the version chain and store gates by inspection, but not the full test suite on merged main from here; (c) whether the merge truly deduped the stray commits' file content (`8fe0f18`, `a9fd542`) or left divergent copies; (d) the gateway's real request dialect is still an assumption until Task 13's fixtures.
- **Biggest thing being missed:** main moves ~50 commits/day across several live sessions — Task 13's repo work (SETUP.md, fixtures commit) should happen on a FRESH branch off current main, not in this aging worktree.
- **If it breaks in 3 months:** xiaozhi-esp32-server's config schema drifts from whatever SETUP.md we write (verify against their shipped template at install); OpenAI TTS API/pricing changes; the playtest launcher hardcodes a session-scoped scratchpad path that will be gone.
- **Did NOT do:** any of Task 13; R3 planning; SDD workspace cleanup; stray-dedup verification; visual verification of the house myself (this environment can't composite KAPLAY).
- **How to check:** (a) user's eyes at http://localhost:65347; (b) `git -C <parent> log --oneline -3 main` then `npx vitest run` on a fresh main checkout; (c) `git -C <parent> show 8fe0f18 -- packages/web/src/net/protocol.ts | git patch-id` vs merged file, or simply diff main's files against branch versions (should be identical); (d) run the gateway once with `SKILL_VILLAGE_ROBOT_FIXTURES` set and read what lands.

## Remaining Work
1. **Get the user's web playtest verdict** — stack is live (see Coordinate Closet); if the pane won't composite, use a real browser at http://localhost:65347. Fix visual findings before Task 13.
2. **Task 13 bring-up** per plan `docs/superpowers/plans/2026-08-23-r1-r2-robot-embodiment.md` (Task 13 section) — human-in-the-loop; do repo work on a fresh branch off current main.
3. Then Task 14 step 2 (replay captured fixtures), then plan R3.

## Open Questions
- Playtest verdict: does the robot-house read as *him*? Porch spacing vs the tree (deferred minor)? Drag feel?
- Task 13 scheduling: when is the user at the desk with robot + Docker + OpenAI key?
- LICENSE (carried since M4): MIT or keep all-rights-reserved?

## Coordinate Closet
<!-- Verbatim ids/paths from this session, newest-first, deduped. -->
- `842ca08` (merge of robot-embodiment into main) · `cc8041b` · `1cddcc7` (origin/main tip) · `79bca20` (rebase catch-up, branch HEAD) · `18b5f4b` `942219e` `ea4ca07` `85b2d99` `1ead055` `2f5ddf6` `c97a13e` (post-rebase task commits)
- pre-rebase SHAs (in SDD ledger): `30696e2` `ff7e0ad` `1fdbe28` `8f55784` `df86b1c` `e69a36c` `e13f59f` `53b13c0` `78c15e9` `f24de06` `f8ec828` `14aa1af` `b306b72` `c73f723` `baea7ea` `51c512b` `0b22841` · base `65b8296`
- strays on main: `8fe0f18` (task-8 escape) · `a9fd542` (task-10 escape)
- `843e6932-24fb-418e-8ad9-d19e22a49275` (playtest serverId) · port `65347` (vite) · `8262` (server) · 19 villagers · sessionId `local_845865db-799d-4571-bf7e-4dd0de3a1484`
- `C:\Users\truman\AppData\Local\Temp\claude\C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web--claude-worktrees-m5stackchan-personality-houses-59eeeb\0e7b88a8-20f6-4a00-a91c-5a5f0a38dad1\scratchpad\robot-playtest.cmd` (+ `robot-home\` sandbox beside it)
- `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/progress.md` (rulings ledger, pre-rebase SHAs)
- `STATE_VERSION = 4` · migration chain v1→v2→v3→v4 · store gates: llm `>=2`, robot `>=4`
- env: `VILLAGE_HOST` (empty→loopback via `||`) · `VILLAGE_PORT` · `SKILL_VILLAGE_ROBOT_FIXTURES`
- endpoints: `POST /v1/chat/completions` · `GET /v1/models` (`skill-village-resident`) · `GET /api/robot` · `PUT /api/robot/resident` `{creatureId}` · state frames carry `robotLastTurnAt`
- gateway refs: github.com/xinnan-tech/xiaozhi-esp32-server · github.com/78/xiaozhi-esp32 · github.com/m5stack/StackChan · github.com/BrettKinny/dotty-stackchan (reference only, MIT, unstable)
- presence: dark/lit/talking, talking window 15_000 ms · `EMPTY_HOUSE_LINE` starts "Nobody lives in me yet."
- memory files touched: `privacy-local-audio.md` · `subagent-worktree-escapes.md`

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
something else. Task 13 is human-in-the-loop hardware work — never dispatch it
to a lone subagent; the user must be at the desk.
