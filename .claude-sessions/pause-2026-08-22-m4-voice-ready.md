# Session Handoff: M3 shipped + playtested, M4 Voice plan ready to execute
**Date:** 2026-08-22 at 14:02
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no
**Stale if:** main moves past `c6f0dbc` · `docs/superpowers/plans/2026-08-22-m4-voice.md` changes · a `.superpowers/sdd/2026-08-22-m4-voice/` ledger exists (M4 execution already started — resume THAT, do not re-dispatch) · the GitHub repo `trmnmc/skill-village-web` gains commits not in local main
**Transcript:** (current session)

## What Was Accomplished
- **M3 (web village) executed end to end** via subagent-driven development: 12 tasks, per-task reviews, a 5-dimension final review (48 findings, 13 adversarially verified), one fix wave + one targeted round. Merged as `ab86ad2`. Execution record with all 13 controller rulings: `docs/superpowers/records/2026-08-22-m3-execution-record.md`.
- **First human playtest** (the user; nobody had ever seen it render — this environment's browser doesn't composite). Three real bugs found and fixed in `7ec4a49`: camera centred on the horizon (village read as floating — fixed via `HORIZON_MARGIN` 24→120 + reframed camera + trailer-style ground), 70 always-on nameplates (now hover-only cream sign, IBM Plex Mono, one line until nicknames exist, hovered villager pops to front), broken text on Windows display scaling (KAPLAY `pixelDensity` + `TEXT_SS = 2` supersampling — KAPLAY rasterizes its glyph atlas at logical size). User verdict: "reads well 7/10".
- **Published**: public repo https://github.com/trmnmc/skill-village-web (topics set, README added `02ebc0a`) + GitHub Pages landing page https://trmnmc.github.io/skill-village-web/ (gh-pages branch; cast SVGs generated from neutral names, NOT the user's real skill inventory — deliberate privacy call).
- **M4 Voice plan written, self-reviewed, committed** (`964eab4` + `c6f0dbc`): `docs/superpowers/plans/2026-08-22-m4-voice.md` — 12 TDD tasks, 58 steps. Built on a live probe of the real `claude` CLI (v2.1.239). Self-review fixed 3 bugs in the plan's own tests (hang-exits-clean, probe-records-spend, serialize-via-hang-proves-nothing).

## Decisions Made
- **CLI contract probed, not remembered**: `is_error: true` can arrive with `subtype: "success"`; a `claude` spawned from inside a Claude Code session reports "Not logged in" → the server booted from this dev environment ALWAYS lands in silent-movie mode. To test chat for real: `npm run dev` from a plain terminal.
- **All tests use a fake CLI** (`fake-claude.mjs`, behaviours: ok/slow/card/card-broken-once/unauthenticated/garbage/hang/exit-2) via injected command vectors — CI spends no tokens.
- Budget counts input+output tokens; caps 500_000 interactive / 100_000 autonomous (off by default); queue concurrency 2; chat → `--model haiku`, serious → no model flag.
- Canned pool (~20 lines) written in the same model call as the personality card; `Creature.cannedLines?: string[]` optional so old states stay valid; `STATE_VERSION` 1→2 with in-place migration.
- Chat panel is **DOM, not KAPLAY** (input/IME/scrollback belong to the DOM); speech bubble in-scene with easeOutBack 0.38s/0.28s (spec §4.2).
- Playtest lesson now standing policy: "arithmetically verified" ≠ "visually correct"; bubble/sign boxes must hug their text.
- LICENSE: deliberately absent; user asked "does it mean anything" — answered (defaults to all-rights-reserved; matters only for reuse/PRs/npm). **User has not decided.**

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/superpowers/plans/2026-08-22-m4-voice.md | created | The M4 plan — next session executes this |
| packages/web/src/layout/zones.ts + test | modified | HORIZON_MARGIN 120 + back-row-field test |
| packages/web/src/scene/village.ts | modified | camera reframe, hover picker, pixelDensity, ground strip, TEXT_SS |
| packages/web/src/scene/creature.ts | modified | hover sign plate, pop-to-front, TEXT_SS, single-line-until-nickname |
| packages/web/src/theme.ts | modified | TEXT_SS = 2 exported |
| README.md | created | repo front page |
| .gitignore | modified | + .claude/ |
| docs/superpowers/records/*.md | created (earlier) | M3 execution record + final-review findings |

## Git State
```
(clean)
```

## Checklist
<!-- snapshot — resume rebuilds TodoWrite from these boxes -->
- [x] M3 executed, reviewed, merged, pushed
- [x] Playtest fixes (ground/signs/text) shipped
- [x] Public repo + Pages landing page live
- [x] M4 plan written, self-reviewed, pushed (`c6f0dbc`)
- [ ] Execute M4 plan via subagent-driven development (12 tasks; branch `m4-voice` off main)
- [ ] After M4 Task 8: real-terminal smoke test (`npm run dev` from a PLAIN terminal, not inside Claude Code — chat must return `source: "llm"`)
- [ ] Playtest M4 with the user (voice quality, bubble sizes — boxes must hug text)
- [ ] LICENSE decision (user's call; MIT suggested if reuse/PRs wanted)
- [ ] Optional: refresh Pages landing page after M4 (nickname signs, chat screenshot)

## Self-Critique
- **Least confident:** (a) M4 Task 11's KAPLAY specifics — bubble `width` mutability and the `main.ts` panel/scene wiring order — plan flags both for verification against installed types; (b) Task 3's store test names `loadOrCreateState`, hedged "use the file's actual export name"; (c) real chat voice quality is unverifiable until someone runs from a plain terminal; (d) `main.ts` factory wiring (`llmFactory` hooks) is described, not fully coded, in Task 6/8 — the seam most likely to need implementer judgment.
- **Biggest thing being missed:** nobody with a logged-in CLI has ever run any of this — every LLM behaviour so far exists only against fakes and one probe that returned "Not logged in".
- **If it breaks in 3 months:** the `claude` CLI's JSON output shape or flags drift (contract probed at v2.1.239 and pinned in the plan header) — or KAPLAY is upgraded and the pinned API workarounds (`setCamPos`, anchor-after-scale, glyph atlas) silently change meaning.
- **Did NOT do:** execute any M4 task; update the Pages site after the visual pass (cast SVGs unaffected, hero webp is the trailer — fine but pre-nickname); coordinate with the separate terminal-project session (`agent-skills-tamagotchi` folder — independent by design); write a LICENSE.
- **How to check:** (a) `node_modules/kaplay/dist/doc.d.ts` for TextComp width mutability; (b) `grep -n "export" packages/server/src/state/store.ts`; (c) plain-terminal `npm run dev` → POST /api/creatures/<id>/chat → expect `source:"llm"`; (d) implement Task 6 Step 3 as written and let its tests judge; CLI drift: `claude --version` + rerun the probe in the plan's "CLI contract" section.

## Remaining Work
1. **Execute the M4 plan**: `docs/superpowers/plans/2026-08-22-m4-voice.md` with superpowers:subagent-driven-development (branch `m4-voice`, workspace ledger under `.superpowers/sdd/2026-08-22-m4-voice/`). The plan is self-contained; spec at `docs/superpowers/specs/2026-08-21-skill-village-web-design.md`.
2. Real-terminal smoke test after Task 8 (see checklist).
3. Push after merge; then M5 (adoption) planning.

## Open Questions
- LICENSE: add MIT, or leave all-rights-reserved? (User was ambivalent; matters when someone wants to reuse/PR.)
- After M4, refresh the landing page with real nickname/chat visuals?

## Coordinate Closet
- `c6f0dbc` (HEAD, M4 plan final) · `964eab4` (M4 plan) · `7ec4a49` (playtest pass) · `1d542c6` · `02ebc0a` (README) · `ab86ad2` (M3 merge) · `99ddea5` (M3 records) · `9a6bb2d` (M2 merge) · `4ddcc19` (M3 base)
- `docs/superpowers/plans/2026-08-22-m4-voice.md` · `docs/superpowers/plans/2026-08-21-m3-web-village.md` · `docs/superpowers/specs/2026-08-21-skill-village-web-design.md` · `docs/superpowers/records/2026-08-22-m3-execution-record.md`
- https://github.com/trmnmc/skill-village-web · https://trmnmc.github.io/skill-village-web/ (gh-pages branch) · gh account `trmnmc`
- ports: server `8262`, vite `5173` · state dir `~/.skill-village` · env override `SKILL_VILLAGE_CLAUDE`
- constants: `TEXT_SS=2` · `U=6` · `HORIZON_MARGIN=120` · `GROUND_Y=620` · caps `500_000`/`100_000` · `STATE_VERSION` 1→2 (M4) · claude CLI `2.1.239` · 450 tests green pre-M4
- fake CLI behaviours: `ok` `slow` `card` `card-broken-once` `unauthenticated` `garbage` `hang` `exit-2` (planned: `packages/server/src/llm/testing/fake-claude.mjs`)
- sibling project (separate session, do not touch): `C:/Users/truman/OneDrive/Documents/Claude-Projects/agent-skills-tamagotchi`

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
