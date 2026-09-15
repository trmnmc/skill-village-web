# Pocket God Minigame — Design

**Date:** 2026-08-26, revised 2026-09-14
**Status:** approved by user (approach, all sections, and the 2026-09-14
re-grounding)
**Repo state:** designed at `f3d3946`; revised against `d7a7628` after
the pinning / pick-up feature landed (`6f6678f`, `c2ac7ad`, `304f503`
and neighbours)

## 1. What this is

A mischief minigame in the spirit of Pocket God. The player flips into
god mode and tosses villagers around. Later phases add lightning and a
dunk pond. Mischief is playful, never destructive: it costs a creature
a little mood and energy, wakes sleepers grumpy, and nothing is ever
lost.

## 2. Decisions already made

These were the user's explicit choices during brainstorming, plus the
re-grounding approvals of 2026-09-14:

1. **Light consequence.** Small mood/energy dips, floor-clamped. A
   comic death + respawn is a possible future phase. Design so a death
   reaction bolts on as one more reaction state, not a new system.
2. **Build order: toss → lightning → dunk.** Each phase lands on the
   previous one's rails. Dunk needs new scenery (a pond), so it is last.
   This spec covers **phase 1 (toss)** in full; phases 2 and 3 appear
   only where a seam must be reserved for them.
3. **God-mode toggle.** In god mode, releasing a carried creature
   becomes a toss. Normal mode keeps today's behavior exactly. The
   toggle is a standalone lightning-bolt (⚡) HUD button, so the mode
   is visible at a glance.
4. **Local spectacle, server-recorded cost.** The arc and reactions
   play only in the actor's browser. The only mischief-specific server
   write is a small stat dip, fire-and-forget. (The landing pin is a
   normal placement write — see §5.) A fully-synced spectacle is a
   possible future upgrade alongside phase 3.
5. **Toss rides the pin rails** (2026-09-14). A toss is placement with
   airtime and a cost: the flight takes over the held body, and the
   landing resolves and pins through the same path an ordinary drop
   uses.
6. **Mode rules** (2026-09-14). In god mode a toss beats the robot
   house and evict. Aura instances are excluded from toss in phase 1.
   The robot resident is tossable but never pinned or evicted by it.

## 3. Ground truth this design stands on

Verified at `d7a7628`:

- A drag lifts the real villager: the actor hides (`setHeld`) and a
  dangling body rides the cursor (`packages/web/src/scene/held.ts`,
  `motion/dangle.ts`).
- A drop is placement: `resolveHeldDrop` (`layout/zones.ts` via
  `scene/placement.ts`) snaps the feet to a legal home, the pin is
  stored locally and sent with `pinCreature` (`net/client.ts`,
  `PUT /api/creatures/:id/pin`), and `reseat()` moves actors on the
  release frame.
- Cursor positions are zoom-corrected through `screenToWorld`; the
  scene keeps a world cursor (`lookAt`, `cursorY`) fresh every frame.
- Render keys and creature ids differ: an aura instance is a second
  body of a project creature (`keyCreatureId`). Aura drops are set-down
  no-ops — an aura has no ground of its own.
- The state schema is at v5 (layout block). Mischief adds no persisted
  fields, so no version bump.

## 4. Client architecture: the `god/` module

New directory `packages/web/src/god/` with four files. Each has one
job. Only `toss.ts` may touch KAPLAY objects, and only by taking
ownership of an existing `HeldCreature`.

### 4.1 `mode.ts` — the toggle store

- `godMode(): boolean`, `toggle(): void`, `subscribe(fn): unsubscribe`.
- The ⚡ button and village.ts are its only consumers.
- Off by default on every page load. The mode is not persisted.

### 4.2 `sampler.ts` — cursor velocity, in world coordinates

- A ring buffer of `(worldX, worldY, t)` covering the last ~120 ms.
- Pushed from the scene's `onUpdate` while a drag is live, using the
  same zoom-corrected world cursor the held body already follows. (The
  original design fed client pixels from `mousemove`; that is wrong
  under zoom and duplicates work the scene already does.)
- `velocity(t): { vx, vy }` in world px/s. With fewer than two fresh
  samples it returns zero, and the toss becomes a gentle drop.
- Why not extend `DragTracker`: its contract is click vs drop by slop
  distance, and every consumer depends on that staying simple.

### 4.3 `ballistics.ts` — the flight sim

- Pure functions in `motion/motion.ts`'s idiom: pure in time, nothing
  mutated, headless-testable.
- `launch(x, y, vx, vy, t0): Flight` — world coordinates, launch speed
  clamped so a fast flick cannot leave the strip.
- `flightState(t, flight, groundY): { x, y, done, bounceAt }` — gravity
  from the release point, a bounce or two damping along `groundY`,
  then `done`. `bounceAt` names the most recent bounce instant so the
  caller fires exactly one puff/sound per bounce (the `hopState`
  `landedAt` trick).
- `groundY` comes from the caller: where `resolveHeldDrop` puts the
  feet for the arc's current x. The sim never imports layout code —
  tests pass a plain number or a fake resolver.

### 4.4 `toss.ts` — the power

- `beginToss(...)` takes over the released gesture: the `HeldCreature`
  visual, the sampled velocity, and the release point (feet, not
  cursor — `footOffset()` applies, as the drop path already does).
- Each frame it advances `flightState` and moves the borrowed visual;
  the actor stays hidden exactly as during the drag.
- On `done` it reports the landing spot back to the scene, which pins,
  reseats, releases (firing the landing puff/sound at the new spot),
  and plays a short dazed reaction.
- Calls `postMischief(creatureId, 'toss')` fire-and-forget at launch,
  in `pinCreature`'s style: false means "nothing happened server-side"
  and the next state frame is the truth.
- Phase 2 adds `lightning.ts` beside it; phase 3 adds `dunk.ts`. One
  file per power.

## 5. The village.ts seam

**This is the named seam between god mode and the drop logic.** The
mouseup handler's drop branch currently orders: robot house → evict →
aura set-down → pin (`packages/web/src/scene/village.ts`, the
`window.addEventListener('mouseup', ...)` block). God mode adds one
gate at the top of that branch:

```
if drop and godMode():
    aura instance (draggedId !== gesture.targetId) → set down, as today
    otherwise → hand the HeldCreature to toss.ts, return
// normal-mode branches run only when god mode is off
```

Rules the gate encodes (approved 2026-09-14):

- **Toss beats the robot house and evict.** Managing residency means
  leaving god mode. Modes do one thing each.
- **Auras are set down, not tossed, no cost.** An aura has no ground of
  its own; a landing would teleport it back to its fan spot.
- **The resident is tossable but never pinned or evicted.** Its flight
  plays, the dazed beat lands, then it reseats home to the porch.

On touchdown for everyone else: `resolveHeldDrop` at the landing x/y →
`pins.set` → `reseat()` → hand the actor back (landing puff/sound at
the new spot) → dazed reaction → `pinCreature(id, x, y)`. The same
five steps an ordinary drop takes today, plus the reaction.

The scene keeps `flights: Map<renderKey, TossFlight>` — you can grab a
second villager while the first is still airborne. A state frame that
removes a flying creature drops its flight and visual with it.

Clicks in god mode pass through unchanged in phase 1 (the creature
panel still opens). Phase 2 claims the click branch for lightning at
this same gate.

## 6. Server: the mischief endpoint

Mirrors the care pattern end to end — re-verified at `d7a7628`
(`/api/creatures/:id/care`, `/api/creatures/:id/pin` both per-creature).

### 6.1 Core rule (`packages/core/src/sim/stats.ts`)

```ts
export type MischiefKind = 'toss'; // 'lightning' | 'dunk' arrive with their phases

export const MISCHIEF_EFFECTS = {
  toss: { mood: -3, energy: -4 },
};

export function applyMischief(stats: Stats, kind: MischiefKind): Stats
```

**The never-destructive guarantee is one clamp:** a dip never takes
mood or energy below `STAT_FLOOR` (30). A stat already at or below the
floor does not dip further. (`applyCare` clamps at 0; the floor there
applies only to away-time decay — so mischief carries its own floor
clamp.) Bond and xp are never touched by mischief.

Consequences fall out of existing thresholds, with no new code:
energy stays ≥ 30, above `SLEEP_BELOW` (25), so a tossed sleeper wakes
(grumpy, not comatose); mood sinking under `SCRUFFY_BELOW` (35) shows
as scruffy.

### 6.2 Runtime (`packages/server/src/village.ts`)

`mischief(creatureId, kind)` beside `care()`: look up the creature
(throw "not found"), apply `applyMischief`, set `lastSeenAt`, commit
with one event `{ at, type: 'mischief', creatureId, detail: kind }`.
No LLM involvement; mischief is an offline verb. No schema change, no
STATE_VERSION bump.

### 6.3 Endpoint (`packages/server/src/api/app.ts`)

`POST /api/creatures/:id/mischief` with body `{ kind }`:

- 400 when `kind` is not a known `MischiefKind` (same shape as care's
  verb check).
- 404 when the creature does not exist.
- 200 with the updated creature otherwise.

The state broadcast over `/ws` carries the dip to every viewer, same
as care does today.

### 6.4 Client call (`packages/web/src/net/client.ts`)

`postMischief(creatureId, kind): Promise<boolean>` — a sibling of
`pinCreature`: true on ok, false on refusal or network failure, caller
ignores the result.

## 7. The ⚡ toggle button

- A standalone HUD button beside the existing ⚙ weather button and the
  layout-reset button (`packages/web/src/ui/layout-button.ts` is the
  freshest pattern to copy: a plain DOM button mounted into the HUD
  container).
- Active state is visible: the button lights up while god mode is on.
- New file `packages/web/src/ui/god-button.ts` — mounts the button,
  talks only to `god/mode.ts`.

## 8. Error handling

- **Server away / refusal:** `postMischief` returns false and is
  ignored. The spectacle already played locally; the next state frame
  is the truth. Same posture as `pinCreature`.
- **Creature disappears mid-flight:** flight and borrowed visual are
  dropped with the actor.
- **Degenerate gestures:** near-zero velocity → gentle drop; huge
  velocity → clamped at launch. Both are ballistics.ts's job, tested.
- **Sprites still baking:** `createHeld` can return null; with nothing
  in hand there is nothing to toss — the release falls through to the
  normal drop path (which still pins at the drop point), no cost.
- **Resident and auras:** covered by the §5 rules — no pin, no evict,
  no aura cost.

## 9. Testing

- `god/ballistics.test.ts` — arc shape, bounce damping and count,
  termination, launch-speed clamp, one `bounceAt` per bounce,
  determinism. Pure-function tests like `motion.test.ts`.
- `god/sampler.test.ts` — velocity from synthetic world-coordinate
  samples, stale-sample expiry, empty/one-sample safety.
- `god/mode.test.ts` — toggle and subscribe.
- Seam rules — unit tests for the gate's routing where it is testable
  headless (aura exclusion, resident no-pin), mirroring how
  `placement.test.ts` pins down drop resolution.
- `core` `stats.test.ts` — `applyMischief`: effect values, floor clamp,
  no dip at floor, bond/xp untouched.
- `server` `app.test.ts` — endpoint 400/404/200 shapes, event written,
  broadcast carries the dip. Mirrors the care tests.
- **Feel** — pixel-playtester after it is on screen: does the toss read
  as playful, does the dazed reaction land, does the button read.

## 10. Out of scope (phases 2–3, noted for seams only)

- **Lightning (phase 2):** god-mode click → `lightning.ts`, a strike
  effect, `kind: 'lightning'`. The click branch at §5's gate is
  reserved for it.
- **Dunk (phase 3):** pond scenery, `dunk.ts`, `kind: 'dunk'`.
- **Comic death + respawn:** one more landing reaction at §5's
  touchdown step.
- **Aura tosses:** revisit if auras ever get ground of their own.
- **Fully-synced spectacle:** would replace the local-only flight with
  server-relayed launches; revisit at phase 3.

## 11. Risks

- **The village.ts gesture block drifts.** Someone edits the mouseup
  handler without knowing god mode gates it. Mitigation: the gate is a
  few lines with a comment naming this spec, placed at the top of the
  drop branch, and §5 names the ordering rule.
- **The pin rails move again.** This design leans on `resolveHeldDrop`,
  `reseat`, `setHeld`, and `footOffset` staying shaped as they are at
  `d7a7628`. The 2026-08-26 → 2026-09-14 revision was exactly this
  risk landing once already; re-verify the seam before implementation
  if main moves far again.
- **Two diverged repos.** This repo (OneDrive) and
  `C:\Users\truman\Projects\skill-village-web` were still unreconciled
  at revision time, but all recent work (M5, pinning, robot v1 docs)
  has landed here and is pushed. Implementation proceeds here unless
  the user says otherwise.
