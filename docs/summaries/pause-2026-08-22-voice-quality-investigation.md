# Session Handoff: M4 live, voice quality/latency investigation is next
**Date:** 2026-08-22 at 22:25
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no
**Stale if:** main moves past `aad39e2` · `packages/server/src/main.ts` no longer passes `timeoutMs: 30_000` to createLlmService · the `claude` CLI version differs from 2.1.239 (`claude --version`) · `docs/superpowers/specs/2026-08-22-roadmap-reconciliation-design.md` changes
**Transcript:** (current session)

## What Was Accomplished
- **Roadmap reconciled with the projects-village remap**, spec'd and pushed (`6b9f839`): projects become the villagers (a genie whose skills/agents are winged helper "powers", drawn beside every project using them); all four zones + six builder verbs got dual-role meanings; you chat with the PROJECT after the remap; session logs are the canonical work signal, hooks demoted to optional M8; order = M4 voice → M5 projects move in → M6 care → M7 builders → M8 live wire + hard mode. Supersedes §14 of the original spec (pointer added there). Project breeding parked on backlog.
- **M4 Voice executed end to end** via subagent-driven development: 12 tasks, per-task reviews, 2 pre-flight plan-defect rulings, 12 controller rulings total, final whole-branch review (fable) + one fix wave. Merged `5f9c0f5` (--no-ff), pushed. Execution record with every ruling: `docs/superpowers/records/2026-08-22-m4-execution-record.md`. 518 tests + typecheck green at merge.
- **Real-terminal smoke test done (first ever real-CLI run)**: user logged the standalone CLI in; probe returned READY; village found its voice; real chat worked with `source:"llm"`.
- **Playtest fix wave 1** (`1fd6135`): thought bubble over the villager + animated typing entry in the panel while a reply is in flight; persona PREFETCH on panel open (`POST /api/creatures/:id/persona`, single-flighted with chat; `village.ensurePersona` exposed). 524/524 tests.
- **Wireframes saved as reference** (`855e663`, `aad39e2`): the user's Claude Design wireframe set (10 takes, 6 screens) committed to `reference/wireframes/game-ui/` with README mapping screens→milestones. Chat layout DECIDED: 1e (docked input bar). Fetched via DesignSync from project `be9ebf64-88ce-472c-acaa-aa798901243f`.
- **Playtest round 2 verdicts (the open problem)**: personalities "mid"; responses "take forever"; dialogue "doesn't make sense" — example: player asks "hello how can u assist me", design-review answers "Hierarchy is broken. Let's fix it. (canned)".

## Decisions Made
- The wireframes are layout guidance, not art; build-time styling uses the game theme. Chat = 1e docked bar (recorded in the wireframes README).
- M4 ruling highlights that bear on the new investigation: chat timeout tightened to 30s in main.ts (final-review fix wave — now the PRIME SUSPECT for canned fallbacks); probe/chat both burn interactive budget; canned fallback applies care and returns 200 by design.
- Diagnosis hypotheses recorded for next session (NOT yet verified — see Remaining Work): (1) "(canned)" on a nonsense reply = the LLM call FAILED and a random idle line was substituted — canned lines are mood chatter, so a direct question gets a non-sequitur; find the failure, don't blame the model. (2) Every `claude -p` call carries the Claude Code system preamble — the probe's own usage showed ~12k cache_creation + ~22k cache_read input tokens for a one-word reply — explaining latency (30s timeout too tight), cost (~34k in/call vs 500k/day cap ≈ 14 chats), and diluted voice (persona card is a footnote under the CLI's own instructions). (3) Persona prefetch + chat can contend for the concurrency-2 queue.

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/superpowers/specs/2026-08-22-roadmap-reconciliation-design.md | created | the reconciled cast/zones/verbs/milestones |
| docs/superpowers/records/2026-08-22-m4-execution-record.md | created | all M4 rulings, durable |
| packages/server/src/llm/* (cli, ledger, service, persona, e2e + testing/fake) | created | M4 voice backend |
| packages/server/src/village.ts, api/app.ts, state/* | modified | chat verb, persona prefetch route, state v2, commit write-queue |
| packages/web/src/chat/* , scene/creature.ts, scene/village.ts, motion, protocol, main.ts, index.html | modified/created | panel, bubbles, meter, banner, thinking UI |
| reference/wireframes/game-ui/* | created | wireframe set + README (chat=1e decided) |
| docs/summaries/CHECKLIST.md | updated | durable checklist mirror |

## Git State
```
(clean)
```

## Checklist
<!-- snapshot — resume rebuilds TodoWrite from these boxes -->
- [x] Roadmap reconciliation spec written, committed, pushed
- [x] M4 executed, reviewed, merged (`5f9c0f5`), pushed; execution record committed
- [x] Real-terminal smoke test (probe READY, chat source:"llm")
- [x] Thinking indicators + persona prefetch shipped (`1fd6135`)
- [x] Wireframes saved to reference/ + chat layout decided (1e)
- [ ] **Investigate voice quality/latency/fallback** (see Remaining Work — the example transcript and three hypotheses)
- [ ] Re-playtest chat after fixes (personalities, latency, no unexplained "(canned)")
- [ ] Remap spec (sibling session, branch `claude/skills-projects-agents-mechanics-36973e`): write `2026-08-22-projects-village-remap-design.md` from the reconciliation's §7
- [ ] LICENSE decision (user's call; MIT suggested if reuse/PRs wanted)
- [ ] Optional: refresh Pages landing page (nickname signs, chat screenshot)
- [ ] Backlog: breeding two projects into a spinoff (parked)
- [ ] Playtest leftovers from M4 final review (banner/HUD overlap, bubble occlusion, meter granularity, trackpad tap + double-click check)

## Self-Critique
- **Least confident:** (a) the 30s-timeout-causes-canned theory — inferred, never observed with logging; the failure reason is swallowed (`why:'failed'` carries no detail to any log). (b) The ~34k preamble figure comes from ONE probe's usage block; chat calls may cache differently. (c) Whether the `claude` CLI has flags/settings to slim or replace its system preamble in -p mode (never researched — the M4 contract probe only covered output shape). (d) Whether "mid" personalities are a prompt-quality problem (core's personalityCardPrompt) vs a model-routing problem (haiku) vs the preamble dilution.
- **Biggest thing being missed:** the game currently has NO observability for LLM failures — no log line says why a call fell back. Any investigation starts blind until that exists.
- **If it breaks in 3 months:** the CLI's prompt/flags/auth behaviour drifts again (contract pinned at 2.1.239; already had to handle nested-session "Not logged in" and the login dance this session).
- **Did NOT do:** any fix for the three complaints (only diagnosed); no failure-reason logging; no research into `claude -p` prompt-slimming flags or an SDK/API alternative transport; no prompt iteration on the personality card; did not verify the user's exact failure was a timeout (could also be budget: check the ledger!); did not check whether the user's playtest bubbles hugged text (round-2 feedback was about dialogue only).
- **How to check:** (a) add one server log line on every `runCli` failure (reason + detail + duration) and on `why:'failed'` in chat, then reproduce; (b) run a real chat call from a plain terminal and read its `usage` block; (c) `claude --help` / docs for -p flags (system prompt, tools, settings); (d) `curl http://localhost:8262/api/llm` after the user's session — if `remaining.interactive` is ~0, the canned replies were BUDGET, not timeout; (e) grep `~/.skill-village/state.json` for the design-review creature's cannedLines to confirm the example line came from its pool.

## Remaining Work
1. **Voice investigation** (next session's arc): FIRST add failure observability (log reason/detail/duration for every failed CLI call in `packages/server/src/llm/service.ts` / `cli.ts`), then reproduce the user's canned fallback and identify the cause: 30s timeout in `packages/server/src/main.ts` vs budget exhaustion vs queue contention with the persona prefetch. Check the ledger state before assuming timeout.
2. **Latency/cost**: measure a real chat call's usage; research slimming the `claude -p` preamble (flags/settings) or alternative transports; revisit timeout value & cap defaults with real numbers (34k in/call ≈ 14 chats/day on the 500k cap — the cap or the transport must change).
3. **Personality quality**: iterate `personalityCardPrompt` in `packages/core/src/personality/prompt.ts` (and consider serious-model routing for card generation as a tunable) once calls are observable and fast enough to iterate against.
4. Then the rest of the checklist (remap spec in sibling session, LICENSE, Pages refresh).

## Open Questions
- LICENSE (user ambivalent; matters for reuse/PRs).
- After fixes: raise the interactive cap, or slim the per-call cost — which lever does the user prefer?
- Canned-reply UX: when a call fails, should the panel style it differently (e.g. "lost in thought…") instead of answering a question with an idle quip + "(canned)" tag?

## Coordinate Closet
<!-- Verbatim ids/paths from this session, newest-first, deduped. -->
- `aad39e2` (HEAD: wireframes chat=1e) · `855e663` (wireframes saved) · `1fd6135` (thinking UI + prefetch) · `379a750` · `5f9c0f5` (M4 merge) · `8895a44` (execution record) · `57ff8e7` (final fix wave) · `6b9f839` (roadmap reconciliation)
- `be9ebf64-88ce-472c-acaa-aa798901243f` (Claude Design projectId, "Game UI wireframing")
- `reference/wireframes/game-ui/` (wireframes + README; chat layout 1e decided)
- `docs/superpowers/records/2026-08-22-m4-execution-record.md` · `docs/superpowers/specs/2026-08-22-roadmap-reconciliation-design.md` · `docs/superpowers/plans/2026-08-22-m4-voice.md`
- `packages/server/src/main.ts` (timeoutMs: 30_000 — prime suspect) · `packages/server/src/llm/service.ts` (queue, why:'failed' swallows detail) · `packages/server/src/llm/cli.ts` (one spawn door) · `packages/core/src/personality/prompt.ts` (card prompt)
- `POST /api/creatures/:id/persona` (prefetch) · `GET /api/llm` (ledger check) · ports server `8262`, vite `5173` · state `~/.skill-village/state.json`
- probe usage evidence: `cache_creation_input_tokens: 11926`, `cache_read_input_tokens: 22173`, `input_tokens: 9`, `output_tokens: 280` (one-word READY reply, claude 2.1.239, haiku)
- example failure transcript: player "hello how can u assist me" → design-review "Hierarchy is broken. Let's fix it. (canned)"
- caps `500_000`/`100_000` · queue concurrency 2 · chat timeout `30_000`ms · claude CLI `2.1.239` · 524 tests green at HEAD
- sibling remap session branch: `claude/skills-projects-agents-mechanics-36973e` (worktree, 20ed8f5)

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
something else. The next arc is the voice investigation: add failure
observability FIRST (the game currently swallows every LLM failure reason), then
test the three hypotheses in Decisions Made against evidence before fixing
anything.
