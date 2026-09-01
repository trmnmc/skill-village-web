# Session Handoff: The M5 verdict came in — stacking, presence, and clouds all fixed and pushed the same day
**Date:** 2026-08-31 at 22:26
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no — everything committed and pushed through `fc94a94`
**Stale if:** `main` moves past `fc94a94` · `http://127.0.0.1:8263/api/health` stops reporting 97 creatures (the isolated server dies with its session's processes — restart form in the Coordinate Closet) · `docs/summaries/CHECKLIST.md` changes (a newer session's state wins) · the isolated data dir vanishes from the old session's TEMP scratchpad (path in the closet — the OS may clean it)
**Transcript:** (current session)

## What Was Accomplished

1. **Resumed the 2026-08-28 handoff and verified all four of its stale-conditions** — everything
   held. Committed the uncommitted isolation wiring from that session (`a9c4e69`:
   `VILLAGE_DATA_DIR` + port env overrides in `packages/server/src/main.ts` /
   `packages/web/vite.config.ts`), after confirming no other session had landed its own version.
2. **The user gave the M5 visual verdict** (blocked for three sessions): presence scale
   "arbitrary" · auras "stack into noise frequently" · distribution uneven · storm clouds
   "uneven stacked and overlapped rectangles". All-instances-speak and the porch-alone read went
   unjudged.
3. **Thread A — layout stacking, fixed** (`a1b5bd3`, test-first). Two root causes: the aura fan
   in `packages/web/src/layout/instances.ts` seated spacing-blind (band-edge snapping and the
   tether clamp stacked instances onto one spot), and depth rows in
   `packages/web/src/layout/zones.ts` seated independently (120px bodies, 46px rows, same x =
   standing on heads). Fans now seat through `findNearest` at `CROWD_GAP` with a degradation
   ladder (full gap → half → half on doubled tether → blind); rows seat back-to-front with
   `STACK_GAP` ghost occupants from the row behind. Measured on the real 118-body render list:
   **37 near-stacks → 1**, worst same-row gap 15px, zero coincidences. The arrival-ripple test
   contract was rewritten: ripples travel only toward the viewer, bounded, deterministic.
4. **Thread B — presence legibility, fixed** (`b571d88`, test-first). `presenceScale` now reads
   the work signal (a project's mood IS the `workStats` decay curve), not helper count — the
   crowd already shows the count; one channel, one meaning. Three stepped bands: mood ≥80 → 1.3
   (worked today), ≥55 → 1.15 (this week), else 1.0 (dormant). Stepped so sliding moods cannot
   respawn actors all day. Core grew a browser-safe `./sim/work` export path (root export drags
   `node:crypto`). The held-genie path in `packages/web/src/scene/village.ts` uses the same rule.
5. **Thread C — clouds, fixed** (`1046ccc`, test-first). The billow animation seeded per RECT,
   so the ten rects of one authored cumulus dome swelled and swayed out of sync — that shredding
   IS the "stacked overlapped rectangles" verdict. One seed/swell/sway per cluster now, scaled
   around the slab's base: sealed steps stay sealed mid-swell. Also fixed a drift test that
   indexed "the near layer" inside the first far cluster and passed only on the removed noise.
6. All work verified: typecheck clean, **1112 tests pass**, live look at 5175 (day layout, night
   storm via the weather menu). Memory `playtest-lessons` gained three new taste rules;
   `docs/summaries/CHECKLIST.md` updated (`2f00d1b`, `fc94a94`).

## Decisions Made

- **Edit in the main checkout, not the worktree** — the live dev server serves the main
  checkout's working tree with HMR; one server, one village, instant feedback. All commits went
  straight to `main` and were pushed immediately (standing rule).
- **Bodies never coincide** beats "crowd pressed close" purism: the crowd-gap floor (30px, may
  halve, never drop) and the spill-past-tether rung both trade a little authored tightness for
  zero stacking. The owner's verdict drove this; the old intent comments were rewritten.
- **Ripples travel toward the viewer only**: cross-row de-stacking couples rows front-of-behind,
  loosening the old "only same-row neighbours move" contract deliberately. Rows behind never
  move; nobody changes row.
- **Size = work signal, crowd = helper count** — one visual channel per meaning. Bands quantized
  at 80/55 (5 under the curve's own anchors, where a mood never lingers).
- **A cohesive mass animates as one body** — billow seeds per cluster, never per rect.
- The 1 residual near-stack (densest stretch, ladder exhaustion) is accepted as life, not noise.

## Files Created or Modified

| File | Action | Why |
|------|--------|-----|
| `packages/server/src/main.ts` | committed (`a9c4e69`) | VILLAGE_DATA_DIR isolation (prior session's work) |
| `packages/web/vite.config.ts` | committed (`a9c4e69`) | ports follow VILLAGE_PORT/VILLAGE_WEB_PORT |
| `packages/web/src/layout/instances.ts` | modified (`a1b5bd3`, `b571d88`) | crowd-gap fan ladder; presence = work signal |
| `packages/web/src/layout/zones.ts` | modified (`a1b5bd3`) | STACK_GAP ghosts, back-to-front row seating, findNearest exported |
| `packages/web/src/layout/*.test.ts` | extended | coherence/anti-stack/presence-band contracts |
| `packages/web/src/scene/village.ts` | modified (`b571d88`) | held genie presence from mood |
| `packages/web/src/scene/placement.test.ts` | fixture + stats | render list now reads mood |
| `packages/web/src/scene/weather-layer.ts` | modified (`1046ccc`) | one-body cluster billow |
| `packages/web/src/scene/weather-layer.test.ts` | extended (`1046ccc`) | coherence pin; near-layer index fix |
| `packages/core/package.json` | modified (`b571d88`) | browser-safe `./sim/work` export |
| `docs/summaries/CHECKLIST.md` | updated (`fc94a94`) | verdict + fixes recorded |
| memory `playtest-lessons.md` | appended | three new eye rules (coincide/channel/one-body) |
| scratchpad `measure-layout.mts` | created (session temp) | real-data layout gap measurement |

## Git State
```
(clean — main at fc94a94, pushed)
```

## Checklist
<!-- snapshot of the TodoWrite list — resume rebuilds TodoWrite from these boxes -->
- [x] Isolation wiring committed + pushed (`a9c4e69`)
- [x] M5 visual verdict given (2026-08-30/31)
- [x] Thread A: aura + cross-row stacking fixed, measured 37→1 (`a1b5bd3`)
- [x] Thread B: presence follows the work signal in three bands (`b571d88`)
- [x] Thread C: clouds billow as one body (`1046ccc`)
- [ ] **User re-judges the three fixes** — http://localhost:5175 (storm: gear → night → Pick → storm) — plus still-unjudged: porch-alone read, all-instances-speak, HUD chip
- [ ] **Session hygiene, remaining half**: env wiring shipped, but nothing yet *forces* one-session-one-server — state-version handshake/lock so an older server can never wipe a newer save; and decide which save is canonical (`~/.skill-village` vs the isolated dir)
- [ ] **Move `village-data-isolated/` somewhere durable** — it lives in the OLD session's TEMP scratchpad; the OS can clean it and the live village silently dies
- [ ] Branch salvage: `C:\Users\truman\Projects\skill-village-web` still holds 24 sole-copy branches
- [ ] Droplet: still pre-M5 (deploy M5 + reseed decision — reseed publishes real folder paths, wipes visitor state); voice login decision; LICENSE; M6 plan
- [ ] Housekeeping (carried): droplet reboot pending, memory tight; 8 merged remote branches deletable; Chunks server restart

## Self-Critique
- **Least confident:**
  1. Presence legibility at village zoom: 1.15 vs 1.0 is subtle; only the 1.3 band clearly pops.
     The user may want a stronger channel (posture, glow) on top.
  2. The dense 2850–3350 stretch still holds ~25 bodies per 300px (genie crowds by design +
     strata chance). De-stacked it reads as crowds to *my* eye; the user's eye hasn't ruled.
  3. The storm was watched for ~10s. Long-run drift, the wrap seam with the new ±30 ref-px left
     overhang from base-anchored scaling, and lightning-over-coherent-clouds were not eyeballed
     (tests cover the seam arithmetic).
  4. Band-boundary respawn churn: moods cross 80/55 once per decay (monotonic), so churn should
     be impossible, but I reasoned it, never observed a live crossing.
  5. My browser pane left its weather menu on night+storm+noon overrides (client-local storage);
     if the user's own browser shares that storage the village looks storm-locked — I believe it
     is per-browser, unverified.
- **Biggest thing being missed:** the collision machinery from 08-28 is still armed — nothing
  stops two sessions running two servers against one save; only this session's data dir is safe,
  and that data dir is in a TEMP folder.
- **If it breaks in 3 months:** the OS cleans the old session's scratchpad and the live village
  state vanishes (the standing backup `m5-smoke-backup/` sits in the SAME temp tree); or someone
  authors a cloud cluster whose slab is not rect 0 and the base-anchored billow scales around
  the wrong origin (puffRects guarantees slab-first today; nothing enforces it for hand-authored
  clusters).
- **Did NOT do:** the state-version handshake; the durable data-dir move; droplet anything; M6
  plan; branch salvage; any porch/speak/HUD judgment.
- **How to check:** layout → `npx tsx <scratchpad>/measure-layout.mts <isolated>/state.json`
  (expect near-stacks ≤1, worst same-row gap ≥15, no pairs <15). Presence → open
  http://localhost:5175, the skill-village-web genie (x≈3127, front row) should be visibly
  larger; `node -e` over state.json lists project moods. Clouds → gear → night → Pick → storm,
  watch 30s+: domes must hold shape. Server → `curl http://127.0.0.1:8263/api/health` → 97.
  Data-dir risk → `ls` the isolated path in the closet.

## Remaining Work

1. **Get the re-judge** — the three fixes plus porch-alone and all-instances-speak, at
   http://localhost:5175. Everything else visual waits on this.
2. **State-version handshake** (the un-built half of the hygiene fix): server refuses to boot
   against a save with a NEWER version instead of starting fresh over it —
   `packages/server/src/state/schema.ts` owns versioning. Small change, ends the wipe class.
3. **Move the isolated village data** out of TEMP (e.g. `~/.skill-village-dev/` or a repo-adjacent
   dir), restart the server with the new `VILLAGE_DATA_DIR`, and update the restart form.
4. **Decide the canonical save** — the isolated dir (97 creatures, has M5 projects) vs the shared
   `~/.skill-village` (75 creatures, the other session's). Merge or bless one.
5. Then the standing backlog: droplet M5 deploy + reseed decision, voice login, LICENSE, M6 plan,
   branch salvage, housekeeping.

## Open Questions

- Do the three fixes pass your eye now? (Aura crowds, cross-row offsets, big-genie presence,
  storm domes.)
- Is 1.15 vs 1.0 presence legible enough, or does "worked this week" need a second channel?
- Which save is the real village going forward — isolated (97) or shared (75)?
- One-session-at-a-time as a rule, or rely on per-session data dirs + the handshake once built?

## Coordinate Closet
<!-- Exact ids/paths/SHAs/PR-refs/key=value pairs scraped VERBATIM from this session. Newest-first, deduped. -->
- `fc94a94` (main HEAD, checklist) · `1046ccc` (cloud one-body billow) · `b571d88` (presence=work signal) · `a1b5bd3` (layout crowd+ghosts) · `2f00d1b` (checklist tick) · `a9c4e69` (isolation wiring commit)
- layout constants: `CROWD_GAP=30` `STACK_GAP=24` `TETHER=96` (spill = 2x) · presence bands: mood ≥80→1.3, ≥55→1.15, else 1.0 (`presenceScale`, packages/web/src/layout/instances.ts)
- measurement: `npx tsx C:\Users\truman\AppData\Local\Temp\claude\C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web--claude-worktrees-isolated-village-handoff-bfe10a\c9d6b1e7-4448-40e1-913a-03b586ccbf19\scratchpad\measure-layout.mts <state.json>` → 118 entries, near-stacks 1, per-300px peak 3000:25
- isolated village: `VILLAGE_DATA_DIR=C:\Users\truman\AppData\Local\Temp\claude\C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web\eddfbaa3-e4a1-4cab-b27d-1acb57df9d76\scratchpad\village-data-isolated` · `VILLAGE_PORT=8263` · `VILLAGE_WEB_PORT=5175` · http://localhost:5175 · health `http://127.0.0.1:8263/api/health` → `{"ok":true,"creatures":97}`
- restart form (quoted-set is load-bearing): `cmd /c set "VILLAGE_DATA_DIR=<iso>"&& set "VILLAGE_PORT=8263"&& set "VILLAGE_WEB_PORT=5175"&& npm run dev` from repo root, detached; log `%TEMP%\skill-village-isolated.log`
- big genies (cached moods): skill-village-web x=3127 y=758 · Claude-Connect x=3228 y=528 · robot-personality x=1498 y=574 · AI x=910 y=574 · storm summon: gear → night → Pick → storm
- backups (same TEMP scratchpad as the data dir): `m5-smoke-backup/` (v4 golden, 75c/52 personas/17 bonds) · `v5-state-from-other-session/` · `wiped-fresh-state/`
- shared save `~/.skill-village/state.json` = v5, other session's, untouched
- other checkout (branch salvage): `C:\Users\truman\Projects\skill-village-web` (HEAD `81f0d24`, 24 branches) · droplet `68.183.99.200` · village.fenley.ai (pre-M5, bundle `index-CC7JZXjz.js`) · `~/.ssh/village_deploy`
- this session's worktree (no longer needed): `C:\Users\truman\OneDrive\Documents\Claude-Projects\skill-village-web\.claude\worktrees\isolated-village-handoff-bfe10a` (branch `claude/isolated-village-handoff-bfe10a`, 6 behind main)

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.

Environment facts: the isolated village dies with its session's processes — if 8263
is down, restart with the quoted-set form in the Coordinate Closet and verify 97.
Work happens in the MAIN checkout (the dev server serves its working tree with HMR);
commit to `main` and push immediately. Before diagnosing anything strange, check
whether another session is running (port 8262, fresh commits on `main`). Keep to
ONE thread at a time — the user asked for FOCUS. The first thread is theirs, not
yours: the re-judge at http://localhost:5175.
Present the rebuilt checklist + Remaining Work and ask whether to continue or do
something else.
