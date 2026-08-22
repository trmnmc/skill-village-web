# The Peddler — Hidden Art-Direction Minigame Design Spec

**Date:** 2026-08-22
**Status:** Approved design, pending implementation plan
**Milestone slot:** after M4 (Voice), before M5 (Adoption) — referred to below as **M4.5**.
**Parent spec:** `2026-08-21-skill-village-web-design.md` — all of its constraints hold unless restated here.

## 1. Overview

A daily minigame disguised as village life. Some mornings a **peddler** — a visitor creature never seen among the villagers — stands at the village edge with a case of five **dream-sketches**: framed pixel portraits of villagers who don't exist, drawn by Claude in the game's own style. The peddler asks one thing: *throw out the ugliest*. Sketches that survive three separate judgings are quietly kept.

The secret, stated nowhere in the game: every cull is a preference verdict. Culled sketches steer generation away from ugly; kept sketches enter the **design stock** that M5's Adoption Center and M6's Hatchery will dress new creatures from. The player is the art director; the fiction never admits it. The payoff is unscripted: one day a new villager arrives wearing a face the player refused to throw out.

### Decisions log (from brainstorming)

| Decision | Choice |
|---|---|
| What survivors are for | Generic pipeline; **creature designs are the only v1 consumer** (decor/gallery art may reuse it later) |
| Who generates candidates | **Claude authors the art** via M4's `LLMService` — this milestone depends on M4 |
| How culls steer generation | **Both, layered**: exemplars + recent rejects in every prompt, plus a distilled style guide |
| What is hidden | **Both**: the task is unannounced *and* its purpose is never stated |
| How mandatory | **Daily ritual**: at most one visit per day; the peddler leaves at day's end; a missed day costs nothing but progress |
| Story vehicle | **The Dream Peddler** (a Gallery Wall variant was considered and rejected as boring) |

## 2. Player experience

- **Arrival.** On days the village can afford art (§7), the peddler stands at the village edge. No announcement, no marker, no badge — the player just notices a stranger. The peddler is not care-able and not chatty; it has exactly one canned line, delivered through the existing speech-bubble machinery when the case opens.
- **The case.** Clicking the peddler opens an overlay: five framed sketches, each a static composited portrait (no blink, no breathing — they are sketches, not creatures) with a title on a plaque. The peddler's line: *"The case only holds five, and I've sketched a new one — throw out the ugliest for me?"*
- **The verb.** The player clicks one sketch, confirms, and it's gone. That is the entire round. The case closes; the peddler is done for the day.
- **The deadline.** One judging per day at most. An unjudged case expires at the day boundary; the identical case returns next visit (no verdict → nothing changed → nothing to regenerate, zero token cost).
- **The ladder.** Overnight after a judged day, the case refills: the culled slot — and the slot of any sketch that just reached **three survivals** and was kept — is filled with fresh sketches. Kept sketches never appear in the case again.
- **Absence.** On days with no working model, no budget, or no valid art, the peddler simply doesn't come. Degradation is fiction: travelers have their own affairs.

## 3. The dream-sketch

A sketch is data the existing compositor can already draw:

```ts
interface DreamSketch {
  id: string;              // unique, minted at generation
  rows: string[];          // body grid, authored by Claude
  crown: CrownId;          // one of the existing five
  hue: string;             // one of the eight curated HUES
  title: string;           // Claude's, shown on the plaque, ≤ 40 chars
  createdDay: string;      // UTC day bucket (shared with the M4 ledger)
  survivals: number;       // verdicts survived so far
}
```

Claude's creative freedom is deliberately narrow: **it authors `rows` and `title`, nothing else.** Crowns are parametric and fit any width; the parent spec's palette rule — arbitrary hex never enters the system — stays load-bearing. Clashing colors and broken crowns remain unrepresentable rather than discouraged.

### 3.1 Validation (pure, in core)

A grid is legal only if all of the following hold. Invalid means the sketch is rejected before it ever renders.

1. Every character is one of `X D W K A .` (the `LEGAL_ROLES`).
2. Rectangular: all rows equal length; width 5–14, height 5–14 (hand-authored bodies span 7×7 to 12×7).
3. The `W` pixels form **exactly two 2×2 blocks**, on the same two rows, separated by at least one non-`W` column, with no `W` anywhere else — so both eye anchors derive mechanically and blinking works if the design ever walks.
4. At least one `K` pixel on a row below the eye rows.
5. Bottom row contains only `D` and `.`, with **at least two `D`** — the walk cycle must find feet.
6. `D` appears only in the bottom row.
7. The non-`.` pixels form **one connected component** (4-connectivity) — no floating islands.

Eye anchors are derived (leftmost block is eye zero), never trusted from the model.

## 4. Generation

One `LLMService` call per sketch needed, **serious model** (session default), tokens charged to the normal M4 interactive daily ledger. The prompt carries:

1. The role-character legend and the drawing rules of §3.1, stated as instructions.
2. Two hand-authored bodies as a style primer.
3. Up to **6** sketches from the design stock — *more like these*.
4. Up to **6** of the most recent rejects — *never like these*.
5. The style guide note, once it exists (§5.2).
6. A strict JSON contract: `{ "rows": string[], "crown": "<one of five ids>", "hue": "<one of eight hexes>", "title": string }`. An out-of-list `crown` or `hue` fails validation like a bad grid.

**Repair:** an invalid reply gets **one** retry with the validator's specific complaints quoted back. Still invalid → that slot stays empty today; the peddler carries four sketches (or three…) and no error surfaces. If *zero* sketches are valid on a fill-from-empty day, the peddler doesn't come.

**Cold start:** before any verdicts exist, the prompt runs on the primer alone. The first case resembles cousins of the hand-authored villagers — fictionally exact: the peddler sketches what the village already loves, then learns what the player loves.

## 5. The training loop

### 5.1 Verdicts and the ladder

Every cull writes a verdict: `{ culledId, survivorIds, day }`. Applying it:

- The culled sketch moves to the **rejects gallery**, capped at the **20** most recent (taste evolves; week-one uglies age out of the prompt).
- Each survivor gains one survival. A sketch reaching **3 survivals** is kept: moved to the **design stock** (uncapped — it is the product). Multiple sketches may be kept by the same verdict.
- A verdict is one bit against one sketch, not a ranking of the other four — which is why keeping takes three survivals, not one.

The design stock has **no consumer in this milestone**. It accumulates in state; M5/M6 read it when they dress new creatures.

### 5.2 The style guide

After every **12** verdicts, one distillation call (serious model) reads the verdict history in compact form — each sketch's dimensions, silhouette, crown, hue, title, and fate — and writes an art-direction note of **≤ 100 words**, replacing the previous note. Stored in state, folded into every later generation prompt, shown in no UI. This is where generalizations live that examples can't express (*wide low bodies keep losing; gold always survives*).

## 6. Architecture

House rule throughout: everything that decides is a pure function; only the last inch draws.

### 6.1 `packages/core` (pure, fully tested)

- Types: `DreamSketch`, `PeddlerCase` (sketches, day, judged flag), `Verdict`, state slices for stock, rejects, and style guide.
- The §3.1 validator, including eye-anchor derivation.
- The **refill planner**: `(yesterdayState, todayBucket) → { carriedSketches, freshSlotsNeeded, keptIds, expiredUnjudged }`. Day-boundary and ladder logic live here, not in the server.
- Verdict application (§5.1) as a pure state transition.
- Prompt builders for generation and distillation, returning strings tests can assert on.
- The peddler's hand-authored body, exported separately from `BODIES` (it must never enter the DNA pool).

### 6.2 `packages/server`

- `STATE_VERSION` bumps (2 → 3, atop M4's bump); a v2 file migrates in place by adding an empty gallery slice; the existing `version >` guard still refuses future files.
- On the first tick of each new UTC day (same bucket function as the M4 ledger) — or on boot mid-day — run the refill planner; if fresh sketches are needed, request them **async** through `LLMService`. The tick never waits.
- The peddler enters the village snapshot only when a filled case exists for today. Peddler presence is *derived*, never stored.
- One new route: `POST` a cull with a sketch id. Accepted only if that sketch is in today's case and today is unjudged; otherwise a conflict no-op that returns current state (the midnight race resolves silently, the client re-syncs). A WebSocket event announces case changes.
- `~/.claude` is never written. Existing villagers keep their deterministic DNA appearance untouched; everything new lives in `~/.skill-village` state.

### 6.3 `packages/web` (thin glue, no game truth)

- The peddler rendered at the village edge via the existing compositor, with its one canned line through the existing bubble machinery.
- The case overlay: five framed static portraits with titled plaques; click → confirm → post the cull. Text follows the established supersample and mono conventions; frames hug their sketches (boxes hug text — playtest lesson).
- Imports stay `@village/core/visual`-only; no `Math.random()`; no hex literals outside the theme.

## 7. Error handling & degradation

| Condition | Behavior |
|---|---|
| Silent-movie mode (no CLI / not logged in) | No peddler. Nothing to dismiss. |
| Daily budget exhausted before refill | No peddler today; refill retries next day. |
| Some generations invalid after repair | Smaller case today; no error surfaces. |
| All generations invalid on an empty case | No peddler today. |
| Cull posted after midnight rollover | Conflict no-op; client re-syncs quietly. |
| Server restart mid-day | Boot tick re-runs the planner; an already-filled case is reused, not regenerated. |
| State file from v2 | Migrates in place; gallery slice starts empty. |

Never an error dialog. The peddler's absence is always narratively sufficient.

## 8. Testing

- **Core:** validator accepts all six hand-authored bodies (the style is its own golden set) and rejects a bestiary of evil grids (floating islands, one eye, three eyes, merged eye blocks, feet mid-air, ragged rows, oversize, out-of-list crown/hue); refill planner across day boundaries, unjudged expiry, multi-keep verdicts; verdict application; prompt builders assert legend, primer, gallery samples, style-guide inclusion, and JSON contract presence.
- **Server:** M4's injected fake-CLI pattern with fixtures returning scripted sketch JSON — no network, no tokens. Cases: happy fill, partial-invalid fill, zero-valid fill, budget-exhausted day, cull happy path, cull conflict, migration.
- **Web:** the boundaries test extends to new modules; DOM/KAPLAY glue carries no tests and is verified by playtest — the user's eyes are the visual review gate, and the peddler's body plus the case overlay are explicitly on that gate.

## 9. Out of scope (M4.5)

- Any consumer of the design stock (M5/M6 read it later; this milestone only writes it).
- Claude-authored crowns, palettes, decor, or gallery art (the pipeline is shaped for them; none ship now).
- A visible rejects gallery, style-guide UI, or any reveal of the secret.
- Peddler chat, care verbs, trades, or economy.
- Player-drawn sketches.
