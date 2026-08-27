# Pocket God Minigame — Design

**Date:** 2026-08-26
**Status:** approved by user (approach and all sections, this date)
**Repo state at design time:** `main` at `f3d3946`

## 1. What this is

A mischief minigame in the spirit of Pocket God. The player flips into
god mode and tosses villagers around. Later phases add lightning and a
dunk pond. Mischief is playful, never destructive: it costs a creature
a little mood and energy, wakes sleepers grumpy, and nothing is ever
lost.

## 2. Decisions already made

These were the user's explicit choices during brainstorming:

1. **Light consequence.** Small mood/energy dips, floor-clamped. A
   comic death + respawn is a possible future phase. Design so a death
   reaction bolts on as one more reaction state, not a new system.
2. **Build order: toss → lightning → dunk.** Each phase lands on the
   previous one's rails. Dunk needs new scenery (a pond), so it is last.
   This spec covers **phase 1 (toss)** in full; phases 2 and 3 appear
   only where a seam must be reserved for them.
3. **God-mode toggle.** In god mode, a drag on a creature becomes a
   toss. Normal mode keeps today's behavior exactly — the
   drag-to-robot-house and evict flows are untouched. The toggle is a
   standalone lightning-bolt (⚡) HUD button next to the weather gear
   (⚙), so the mode is visible at a glance.
4. **Local spectacle, server-recorded cost.** The ragdoll arc and
   reactions play only in the actor's browser. The only server write is
   a small stat dip, fire-and-forget. A fully-synced spectacle is a
   possible future upgrade alongside phase 3.

## 3. Client architecture: the `god/` module

New directory `packages/web/src/god/` with four files. Each has one
job and no KAPLAY dependency except where named.

### 3.1 `mode.ts` — the toggle store

- `godMode(): boolean`, `toggle(): void`, `subscribe(fn): unsubscribe`.
- The ⚡ button and village.ts are its only consumers.
- Off by default on every page load. The mode is not persisted.

### 3.2 `sampler.ts` — pointer velocity

- A ring buffer of `(clientX, clientY, tMs)` samples covering the last
  ~120 ms.
- `push(x, y, t)` is called from village.ts's existing
  `window.mousemove` listener — one added line.
- `velocity(t): { vx, vy }` in px/s, computed over the buffered window.
  With fewer than two fresh samples it returns zero velocity, and the
  toss becomes a gentle drop straight down.

Why not extend `DragTracker`: the tracker's contract is click vs drop
decided by slop distance, and every existing consumer depends on that
staying simple. Velocity is god mode's private need, so it lives in
god mode's module.

### 3.3 `ballistics.ts` — the flight sim

- Pure functions in `motion/motion.ts`'s idiom: pure in time, no
  objects mutated, headless-testable.
- `launch(originX, originY, vx, vy, t0): Flight` — clamps launch speed
  to a max so a fast flick cannot throw a creature off the strip.
- `flightState(t, flight): { dx, dy, done, bounceAt: number | null }`
  — gravity, a floor bounce or two with damping, then `done`.
  `bounceAt` names the most recent bounce instant so the caller can
  fire exactly one puff/sound per bounce (same trick as `hopState`'s
  `landedAt`).
- Offsets are relative to the creature's home position, matching how
  `wanderOffset` composes today.

### 3.4 `toss.ts` — the power

- `beginToss(creatureId, releaseEvent, sampler): Flight` — builds the
  flight from the release position and sampled velocity.
- Calls `postMischief(creatureId, 'toss')` fire-and-forget, in
  `setRobotResident`'s style (`packages/web/src/net/client.ts`): a
  failed or offline call means nothing happened server-side, and the
  next state frame is the truth.
- Phase 2 adds `lightning.ts` beside it; phase 3 adds `dunk.ts`. Each
  power is one file.

## 4. The village.ts seam

village.ts grows one thin intercept and one wiring line. **This is the
named seam between god mode and the robot-house drop logic** — anyone
editing the gesture block must keep the god-mode branch above the
robot-house branch.

In the existing `mouseup` handler (currently
`packages/web/src/scene/village.ts` ~line 550):

```
if gesture.type === 'drop' and godMode():
    hand to toss.ts, add the Flight to the scene's flight map, return
// existing robot-house / evict logic runs only in normal mode
```

Clicks in god mode pass through unchanged in phase 1 (the creature
panel still opens). Phase 2 claims the click branch for lightning the
same way.

The drag ghost: while god mode is on, the drag ghost still rides the
cursor (the creature is being carried). No change to the ghost code.

## 5. The flung state in the scene

`motion/` stays pure — there is no authority enum to join (the handoff
that guessed one was wrong; verified against `motion/motion.ts` and
`behaviour.ts`).

- The scene keeps `flights: Map<creatureId, Flight>`.
- Where a creature actor's draw position is computed, one branch: a
  live flight replaces the wander offset with
  `flightState(t, flight)`'s `dx/dy`.
- When `done`: remove the flight, play a short **dazed** reaction
  (stars or a wobble, reusing the existing reaction/bubble machinery).
  The future comic-death reaction bolts on at this exact point as one
  more reaction choice.
- A creature mid-flight ignores hover and drag (it cannot be re-grabbed
  until it lands). If a state frame removes the creature mid-flight,
  the flight is dropped with it.

## 6. Server: the mischief endpoint

Mirrors the care pattern end to end — verified against
`packages/server/src/api/app.ts` and `packages/server/src/village.ts`.

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
No LLM involvement; mischief is an offline verb.

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
`setRobotResident`: true on ok, false on refusal or network failure,
caller ignores the result.

## 7. The ⚡ toggle button

- A standalone HUD button next to the ⚙ weather button, styled the
  same way (`packages/web/src/ui/weather-menu.ts` shows the pattern:
  a plain DOM button mounted into the HUD container).
- Active state is visible: the button lights up while god mode is on.
- New file `packages/web/src/ui/god-button.ts` — mounts the button,
  talks only to `god/mode.ts`.

## 8. Error handling

- **Server away / refusal:** `postMischief` returns false and is
  ignored. The spectacle already played locally; the next state frame
  is the truth. This matches the robot-resident posture.
- **Creature disappears mid-flight:** flight dropped with the actor.
- **Degenerate gestures:** near-zero velocity → gentle drop; huge
  velocity → clamped at launch. Both are ballistics.ts's job, tested.
- **God mode + robot resident:** a toss in god mode never evicts — the
  god-mode branch returns before the evict check. Evicting requires
  leaving god mode. This is deliberate: modes do one thing each.

## 9. Testing

- `god/ballistics.test.ts` — arc shape, bounce damping and count,
  termination, launch-speed clamp, one `bounceAt` per bounce,
  determinism. Pure-function tests like `motion.test.ts`.
- `god/sampler.test.ts` — velocity from synthetic samples, stale-sample
  expiry, empty/one-sample safety.
- `god/mode.test.ts` — toggle and subscribe.
- `core` `stats.test.ts` — `applyMischief`: effect values, floor clamp,
  no dip at floor, bond/xp untouched.
- `server` `app.test.ts` — endpoint 400/404/200 shapes, event written,
  broadcast carries the dip. Mirrors the care tests.
- **Feel** — pixel-playtester after it is on screen: does the toss read
  as playful, does the dazed reaction land, does the button read.

## 10. Out of scope (phases 2–3, noted for seams only)

- **Lightning (phase 2):** god-mode click → `lightning.ts`, a strike
  effect, `kind: 'lightning'`. The click branch in the village.ts seam
  is reserved for it.
- **Dunk (phase 3):** pond scenery, `dunk.ts`, `kind: 'dunk'`.
- **Comic death + respawn:** one more landing reaction at §5's seam.
- **Fully-synced spectacle:** would replace the local-only flight with
  server-relayed launches; revisit at phase 3.

## 11. Risks

- **The village.ts gesture block drifts.** Someone edits the
  mouseup handler without knowing god mode wraps it. Mitigation: the
  intercept is three lines with a comment naming this spec, and the
  seam is documented in §4.
- **Two diverged repos.** This repo (OneDrive) and
  `C:\Users\truman\Projects\skill-village-web` are not reconciled.
  **Resolve which repo is canonical before implementation starts**;
  this spec is grounded in the OneDrive repo at `f3d3946` and must be
  re-verified if implementation happens elsewhere.
