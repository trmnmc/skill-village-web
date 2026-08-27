# Session Handoff: Pocket God minigame — brainstorm mid-flight, approach A awaiting the nod
**Date:** 2026-08-26 at (evening)
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no
**Stale if:** `main` moves past `f3d3946` · `packages/web/src/input/drag.ts` or `packages/web/src/net/client.ts` or `packages/server/src/state/schema.ts` changes (every design claim below is pinned to their current shapes) · the two-repo reconciliation (OneDrive vs `C:\Users\truman\Projects\skill-village-web`) lands and moves canonical work elsewhere
**Transcript:** (current session)

## What Was Accomplished

Pure brainstorming session (superpowers:brainstorming, **architectural path**) for a Pocket God-style mischief minigame. No code was written. The session ran in a worktree that was deleted mid-session; the design survives because the origin repo at `f3d3946` has the same modules the design leans on (verified: `packages/web/src/input/drag.ts`, `packages/web/src/net/client.ts`, `STAT_FLOOR` in `packages/server/src/state/schema.ts`).

The brainstorm reached the end of the approaches step. Approach A was recommended and presented; **the user has not yet approved it** — that answer is the very next thing this work needs.

## Decisions Made

All four were the user's explicit choices, one question at a time:

1. **Consequence level: option 2 — light consequence.** Mischief costs a little energy/mood, wakes sleepers grumpy, never destructive. The server's existing `STAT_FLOOR` clamp (`packages/server/src/state/schema.ts:50`) makes "never destructive" nearly free. Option 3 (comic death + respawn) is a possible future "wow factor" — design so a death-reaction bolts on as one more reaction state, not a new system.
2. **Build order: toss (1) → lightning (2) → dunk/hazards (3).** All three eventually, phased; each phase lands on the previous one's rails. Dunk needs new scenery (pond), so it goes last.
3. **Mode: god-mode toggle** (gear menu or lightning-bolt button). In god mode, drags become tosses and clicks become lightning (phase 2). Normal mode keeps today's behavior exactly — protects the existing drag-to-robot-house / evict flow (`packages/web/src/scene/village.ts`, gesture block ~line 516–543). Velocity-based disambiguation was rejected.
4. **Sync: local spectacle, server-recorded cost.** Ragdoll/arc/reactions play only in the actor's browser; the only server write is a small energy deduction (fire-and-forget, in the style of `setRobotResident` in `packages/web/src/net/client.ts:63`). Fully-synced spectacle noted as a future upgrade alongside phase 3.

**Recommended approach (presented, NOT yet approved):**
- **A. Dedicated `packages/web/src/god/` module + tiny hand-rolled ballistic flight sim.** Module owns: mode store (toggle), gesture interpretation while active, one file per power (`toss.ts` now; `lightning.ts`, `dunk.ts` later). Motion system gains one new authority state — "flung" — ~30 lines of ballistic math (velocity from last pointer samples, gravity, a bounce or two, then hand back to behaviour with a dazed reaction). Unit-testable headless like the rest of `motion/`. village.ts grows only a thin god-mode gesture intercept.
- Rejected: **B** (KAPLAY `body()`/`area()` physics — fights motion/behaviour's position authority, untestable headless, past KAPLAY-surprise lessons) and **C** (inline in village.ts — file already too big, three phases would balloon it).
- Server side, same under any approach: `POST /api/mischief` (`{creatureId, kind}`), floor-clamped energy/mood dip, grumpy wake — mirroring the `/api/robot/resident` endpoint shape in `packages/server/src/api/app.ts`.

## Files Created or Modified

| File | Action | Why |
|------|--------|-----|
| docs/summaries/pause-2026-08-26-pocket-god-brainstorm.md | created | this handoff |
| docs/summaries/CHECKLIST.md | updated | added the Pocket God brainstorm line; everything else preserved (file is shared across sessions) |

No source files touched.

## Git State
```
(clean)
```

## Checklist
<!-- snapshot of this session's state — prior CHECKLIST.md items live in docs/summaries/CHECKLIST.md and were NOT dropped -->
- [x] Classify request (architectural) and explore context (drag.ts, village.ts gestures, net/client.ts, server schema/app.ts)
- [x] Clarifying questions: consequence level → light (2, maybe 3 later)
- [x] Clarifying questions: powers + order → toss, then lightning, then dunk
- [x] Clarifying questions: gesture model → god-mode toggle
- [x] Clarifying questions: sync → local spectacle, server-recorded cost
- [x] Propose approaches A/B/C with recommendation (A)
- [ ] Get user approval on approach A (in progress — question is on the table)
- [ ] Present design in sections (architecture, god/ module units, flung state, /api/mischief, error handling, testing), approval per section
- [ ] Write design doc to `docs/superpowers/specs/2026-08-26-pocket-god-minigame-design.md` (date-adjust if it slips) and commit
- [ ] Spec self-review (placeholders, consistency, scope, ambiguity)
- [ ] User reviews written spec
- [ ] Invoke writing-plans skill (the ONLY next skill — brainstorming's terminal state)

## Self-Critique
- **Least confident:** (1) Every file I read this session was the **deleted worktree's copy**, on a branch whose history (`c33355a`, `842ca08`) differs from origin main (`f3d3946`). I spot-verified the load-bearing files exist here with the right shapes, but line numbers and surrounding code may differ. (2) "~30 lines of ballistic math" and "motion gains one authority state" are estimates made without reading `motion/behaviour.ts` in full — the flung-state seam might be messier. (3) I don't know how the sim tick treats energy server-side (grep found no `energy` in `sim/tick.ts`), so where the `/api/mischief` mutation should live in the server is unconfirmed.
- **Biggest thing being missed:** the two-diverged-repos situation. If the user reconciles onto `C:\Users\truman\Projects\skill-village-web` (the recommended move per memory), this design should be re-grounded there before any implementation.
- **If it breaks in 3 months:** the god-mode gesture intercept and the robot-house drop logic drift apart — someone changes the village.ts gesture block without knowing god mode wraps it. The design mitigates by making god mode a thin intercept, but the spec must name that seam explicitly.
- **Did NOT do:** no design sections presented; no spec written; no reading of `motion/behaviour.ts`, `sound/` director, or `spectator/`; did not check whether the gear menu (`ui/weather-menu.ts`) has room for a god-mode toggle; assumed a `POST` endpoint pattern is welcome in `api/app.ts` without reading its auth/validation conventions.
- **How to check:** (1) `git log --oneline -3 -- packages/web/src/input/drag.ts packages/web/src/scene/village.ts` and re-read both in THIS repo before writing the spec. (2) Read `packages/web/src/motion/behaviour.ts` and `motion.ts` — confirm there's a single authority enum/state the "flung" state can join. (3) `grep -rn "stats" packages/server/src/sim packages/server/src/state --include=*.ts` to find where stat mutations happen today. (4) Ask the user about repo reconciliation before implementation starts.

## Remaining Work

1. **Get the approach-A yes/no** — the pending question. If yes, continue the architectural path in order:
2. Present the design in sections (scaled; approval after each): god/ module boundaries · flung motion state · god-mode toggle placement (gear menu vs bolt button — small open sub-question) · `POST /api/mischief` server change · testing story (headless unit tests for ballistics + gesture routing, playtest via pixel-playtester for feel).
3. Write + commit the spec to `docs/superpowers/specs/`, self-review, user review.
4. Invoke **writing-plans** — no other implementation skill.
5. Before implementation: resolve which repo is canonical (OneDrive vs `C:\Users\truman\Projects`) and work there.

## Open Questions

- **Approve approach A?** (the live question)
- Toggle placement: gear-menu entry vs a standalone lightning-bolt HUD button — not yet asked; belongs in the design-sections step.
- Exact energy/mood costs per mischief kind — design-sections detail.
- Which repo is canonical for implementation (ties to the reconciliation decision already pending in CHECKLIST.md).

## Coordinate Closet
- `docs/superpowers/specs/2026-08-26-pocket-god-minigame-design.md` (planned spec path)
- `packages/server/src/state/schema.ts:50` (STAT_FLOOR clamp)
- `packages/web/src/net/client.ts:63` (setRobotResident — fire-and-forget write pattern)
- `packages/web/src/scene/village.ts:516` (gesture block: mousedown/mousemove/mouseup, worktree line numbers — re-verify here)
- `packages/web/src/input/drag.ts` (DragTracker: click vs drop, slop 6 client px)
- `packages/server/src/api/app.ts` (endpoint table; robot resident PUT pattern)
- `f3d3946` (origin main HEAD at handoff)
- `c33355a` (worktree main HEAD the session started on — deleted worktree `skill-creatures-sound-engine-53779b`)
- `C:\Users\truman\Projects\skill-village-web` (the other diverged repo, HEAD `81f0d24`)
- `POST /api/mischief` (planned endpoint, `{creatureId, kind}`)
- STARTING_STATS `{ mood: 70, energy: 70, bond: 10, xp: 0 }` (`packages/server/src/bridge/creature.ts:7`)

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
something else. The immediate next step is re-asking the user: **approve approach A
(dedicated god/ module + hand-rolled flight sim) — yes or no?** Then continue the
brainstorming skill's architectural path from step 5 (design sections). Do not
write code before the spec and plan exist.
