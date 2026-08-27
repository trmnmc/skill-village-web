# Villager Pinning and the Under-Construction Zones — Design

**Date:** 2026-08-26
**Status:** approved by user (approach and all sections, this date)
**Repo state at design time:** worktree `claude/creature-drag-visual-5168e5`, branched from `e56b166`
**Depends on:** the drag-visual work on the same branch (`scene/held.ts`,
`motion/dangle.ts`, `CreatureActor.setHeld`). Pinning reuses that drop path.

## 1. What this is

Drop a villager anywhere and it stays there. The player arranges the village
by hand; the village rearranges itself around the arrangement. Villagers still
amble on their leash — a pin sets where home *is*, not that they stand frozen
on it.

Dropping is allowed across the whole strip, so the three zones that are empty
scenery today (Hatchery, Adoption Center, Notice Board) get an
under-construction treatment: parking a villager in a blank field only reads
well if the field explains itself.

## 2. Decisions already made

The user's explicit choices during brainstorming:

1. **Saved on the server.** The arrangement belongs to the village, not to one
   browser: it survives a reload, shows on every device, and the spectator
   view sees it. Follows the `robot.residentId` pattern exactly.
2. **Snap to the nearest depth row.** x is the player's; y resolves to one of
   the seven rows. This keeps the depth illusion and the draw order intact,
   and guarantees a villager stands on painted ground.
3. **Drop anywhere on the strip**, with the unfinished zones given an
   under-construction look rather than left blank.
4. **Undo is a "reset layout" HUD button.** Pins are sticky; to change one you
   move that villager again. One control releases everyone back to automatic
   placement. No per-creature undo gesture — single click already opens the
   chat panel, and double-click is not a gesture this scene has.

## 3. Approach: pins are fixed occupants

`placeCreatures(ids)` is a pure function of the *set* of ids, recomputed on
every server tick — which is why a dropped villager springs back today. It is
also the most carefully tuned function in the repo: it hashes each villager to
a depth row and to a slice of that row's free ground, keeps everyone off the
houses and trees, degrades comfort in whole-row steps as a row fills up, and
derives each wander leash from the real gaps to that villager's neighbours.

Pins enter that system as **fixed occupants**: `placeCreatures(ids, pins)`
seats each row's pinned villagers first, seats the auto crowd around them,
then runs the existing leash pass over everyone.

Two alternatives were considered and rejected:

- **Override after placement** — run `placeCreatures` untouched and overwrite
  the pinned entries. Two lines, no risk to the seating code, but the auto
  crowd never learns a pin exists: a drop can land permanently on top of a
  neighbour, and the pinned villager keeps its old spot's leash, which may now
  walk it into a tree.
- **Pinned villagers leave the system** — call `placeCreatures` with only the
  unpinned ids. Same overlap problem, since the auto crowd still cannot see
  the pins.

Both discard the overlap prevention this file was built for, at exactly the
moment the player is arranging things by hand.

## 4. `layout/zones.ts` — the core change

### 4.1 New types and the pin resolver

```ts
/** A pinned villager's resolved home: already snapped, clamped and cleared. */
export interface Pin { x: number; y: number; }

/**
 * Resolve a raw drop into a legal home. The result is what gets stored, so
 * what the player sees on release is exactly what reloads later.
 */
export function pinSpot(x: number, y: number, others: readonly Pin[]): Pin;
```

`pinSpot` applies four rules in order:

1. **Snap the row.** `row = clamp(round((GROUND_FRONT - y) / ROW_DEPTH), 0, ROWS - 1)`,
   then `y = rowY(row)`. Rows sit at y = 758, 712, 666, 620, 574, 528, 482.
2. **Clamp x to the world**, keeping a whole body inside it:
   `PIN_MARGIN = WIDEST_BODY / 2 + 8`, so x lands in
   `[PIN_MARGIN, WORLD_W - PIN_MARGIN]`.
3. **Push clear of props** on that row, via `nearestGround(x, lo, hi, keepOutAt(y))`.
4. **Push clear of other pins** on the same row by `MIN_SEPARATION`, nearest
   side first. Two villagers cannot be stacked on one spot.

### 4.2 Keep-out: one general function beside the Homes one

`homesKeepOutAt(feetY)` **keeps its exact present behaviour** — Homes decor
plus the Homes sign board. `ROW_GROUND` is precomputed from it at module load
and the whole automatic layout depends on it, so it must not move.

A new `keepOutAt(feetY)` returns the union of everything a *pin* must avoid:
Homes decor, all four zone sign boards, and the construction props of §7. Only
`pinSpot` uses it.

### 4.3 Seating with pins

`placeCreatures(ids, pins?: ReadonlyMap<string, Pin>)`:

- A pinned id is **excluded from the stratified `wanted` pass** — it is not
  asking for ground, it has some. Its row comes from its pinned y, not from
  its hash, so it may join a row its hash would never have chosen.
- Each row's `taken` list is **seeded with that row's pinned occupants**
  before the auto members are seated. All three seating rungs then route
  around them for free, because `findNearest` already works against `taken`.
- `seatRowPacked` — the last-resort rung — takes the pinned occupants too and
  advances its cursor past any it would collide with, under the same
  `MIN_SEPARATION` rule. Without this the packed rung would walk straight
  through the player's arrangement.
- A pin whose id is not in `ids` is ignored. A creature deleted from disk
  cannot hold ground.

### 4.4 The wander leash, including for pins

The leash pass runs over every seated villager in a row — pinned and auto
together, sorted by x — using today's formula, plus one added clamp:

> a villager's leash is always also capped by the distance to its **own**
> bounds: `HOMES_LO`/`HOMES_HI` for an auto villager, the §4.1 world margins
> for a pinned one.

This is what stops an auto villager at the edge of Homes from inheriting a
huge leash when its nearest neighbour in that row is a pin parked out in the
Adoption Center.

**The added clamp cannot change today's output.** An interior villager has a
neighbour at or beyond `HOMES_LO`, so its neighbour term
`(e.x - left.x - MIN_SEPARATION) / 2` is already smaller than `e.x - HOMES_LO`;
an end villager's term is that distance exactly. With no pins present the
clamp never binds, so `zones.test.ts`'s existing expectations hold unchanged.

## 5. Server

### 5.1 State (`packages/server/src/state/schema.ts`)

`STATE_VERSION` 4 → 5.

```ts
/** Where the player has parked villagers by hand. Keyed by creature id. */
export interface LayoutState { pins: Record<string, { x: number; y: number }>; }
```

added to `VillageState` beside `robot`, with `emptyState` seeding
`{ pins: {} }` and a migration step
`if (state.version === 4) state = { ...state, version: 5, layout: { pins: {} } }`.
`store.ts` gains the matching `parsed.version >= 5` shape guard alongside the
existing llm and robot ones.

Village-level rather than a field on `Creature`: creature records are rebuilt
from disk on import, and a village-level map also makes "reset everything" a
one-line write — the same two reasons `robot.residentId` lives there.

### 5.2 Runtime (`packages/server/src/village.ts`)

Beside `setRobotResident`:

- `pinCreature(creatureId, x, y)` — throws "not found" for an unknown
  creature; otherwise commits `layout.pins[creatureId] = { x, y }` with one
  event `{ at, type: 'layout-pinned', creatureId }`.
- `resetLayout()` — commits `layout: { pins: {} }` with one event
  `{ at, type: 'layout-reset' }`.

Both new event types join the union in `state/events.ts`.

**Pruning.** Every commit drops pins whose creature id is no longer in
`state.creatures`, so a deleted skill does not reserve ground forever. Reads
ignore unknown ids as well (§4.3), so a stale pin can never strand a spot even
between commits.

### 5.3 Endpoints (`packages/server/src/api/app.ts`)

Shaped after the robot house, which is the closest existing thing: a `GET`
snapshot, a `PUT` that sets one piece of state, and a snapshot as every
response body.

- `GET /api/layout` — `{ pins }`. Mirrors `GET /api/robot`.
- `PUT /api/creatures/:id/pin`, body `{ x, y }`
  - 400 when x or y is not a finite number, or `Math.abs` of either exceeds
    `100_000`.
  - 404 when the creature does not exist.
  - 200 with the layout snapshot otherwise — *not* the updated creature, since
    a pin is village state rather than creature state.
- `POST /api/layout/reset` — 200 with the emptied snapshot. Takes no body.

**The server deliberately does not range-check against the world.** `WORLD_W`,
`GROUND_FRONT` and the depth rows all live in `packages/web/src/layout/zones.ts`,
and the server has no dependency on the web package — nor should it acquire
one for this. The client owns the geometry and does the snapping (§4.1); the
server's validation only has to reject garbage that would corrupt the save.
The bound above is a sanity rail, not a layout rule.

Both writes broadcast over `/ws` like every other write.

### 5.4 The view (`packages/web/src/net/protocol.ts`)

`VillageView` gains `pins: Record<string, { x: number; y: number }>`, validated
the way the existing fields are. A server that omits it reads as `{}`.

## 6. Client

### 6.1 The call (`packages/web/src/net/client.ts`)

`pinCreature(creatureId, x, y): Promise<boolean>` and
`resetLayout(): Promise<boolean>`, both siblings of `setRobotResident`: true on
ok, false on refusal or network failure, caller ignores the result.

### 6.2 The drop (`packages/web/src/scene/village.ts`)

The `mouseup` handler already computes the drop's world x/y and branches on
`inRobotHouse`. **Order matters and is fixed:** robot-house drop first, then
evict, then — for every other drop of a villager — pin.

```
drop at (worldX, worldY):
  robot house      -> onRobotDrop            (unchanged)
  was the resident -> onRobotEvict           (unchanged)
  otherwise        -> pin here
```

Pinning is optimistic. The scene keeps its own `pins` map:

1. On release, resolve the spot with `pinSpot`, write it into the local map,
   recompute `placements` and move the actors. The villager stays where the
   hand left it, with no wait for the round trip.
2. Fire `pinCreature` and ignore the result.
3. The next view frame carries the server's pins and replaces the local map
   wholesale. A refused or lost write corrects itself on that frame.

This is the posture `setRobotResident` and the pocket-god spec already take:
act locally, let the next state frame be the truth.

### 6.3 `setView`

`placeCreatures(view.creatures.map(c => c.id), pinsFrom(view))` — the pins map
comes from the view, except in the window between an optimistic local pin and
the frame that confirms it. The robot resident still overrides its spot to
`PORCH_SPOT` after placement, exactly as today: **residency beats a pin.**
Pinning the resident is not refused, it is simply not visible until it moves
out.

### 6.4 The reset button

`packages/web/src/ui/layout-button.ts`, a plain DOM button mounted in the HUD
beside the weather gear, styled the way `ui/weather-menu.ts` shows. It calls
`resetLayout()` and clears the local pins map. It is disabled while no pins
exist, so the village never offers to undo nothing.

## 7. The under-construction zones

New `packages/web/src/scene/construction.ts`, exporting `mountConstruction(k)`,
called from `startVillage` beside the other scenery.

Each of Hatchery, Adoption Center and Notice Board gets **one deliberate
cluster**, not scattered debris:

- two scaffold posts (`wood`) with two crossbars between them,
- a low barrier board in front of them, striped by alternating `wood` and
  `cream` blocks,
- a small `cream` plate with a 2px `ink` outline carrying "UNDER CONSTRUCTION"
  in mono, the plate sized from the rendered text rather than a fixed width.

Every piece is built with `block()` and carries its `themed:<token>` tag, so
the retint walker keeps it in step with the sky like all other scenery. Every
piece is grounded on the zone's baseline — nothing floats.

The cluster's x anchors live in `zones.ts` beside `HOMES_HOUSE_XS` and
`HOMES_TREE_XS`, and `keepOutAt` derives the construction keep-out bands from
those same anchors — so a moved scaffold moves its keep-out with it, the rule
the file already states for trees and houses. A villager cannot be parked
inside a scaffold.

Three constraints carried from earlier playtests: the plate hugs its text,
readable text is mono, and texture is selective — one cluster per zone reads as
a building site, while debris strewn evenly across three zones reads as the
graphics being turned down.

## 8. Error handling and edges

- **Server away or refusing.** The pin already applied locally; the next view
  frame is the truth. Same posture as the robot resident.
- **Creature vanishes while pinned.** Its pin is ignored on read and pruned on
  the next commit.
- **Drop outside the canvas.** The release is read on `window` (which is why
  the existing handler listens there), so the gesture completes and the drop
  clamps into the world by §4.1.
- **Pin under the robot resident.** Residency wins; the pin waits.
- **Two pins on one spot.** Impossible — §4.1 rule 4 pushes the second clear.
- **A row full of pins.** Auto villagers degrade through the existing three
  rungs and, past the last one, seat spacing-blind on clear ground. Nobody
  disappears and nobody stands on a prop, which is today's guarantee.

## 9. Testing

- `layout/zones.test.ts` — `pinSpot` snaps to the nearest row, clamps to the
  world, pushes off props, and separates two pins; `placeCreatures` holds a
  pinned x and y, seats the auto crowd clear of pins, ignores a pin for an
  unknown id, gives pins a sane leash, and — the regression that matters —
  returns identical output to today when the pins map is empty.
- `state/store.test.ts` — the v4 → v5 migration seeds empty pins and leaves
  everything else alone.
- `server/village.test.ts` — pinning writes its event, reset clears, and a pin
  for a vanished creature is pruned on commit.
- `server/api/app.test.ts` — 400 / 404 / 200 shapes for all three endpoints and
  the broadcast carrying pins, mirroring the robot-resident tests. Includes a
  non-finite x (NaN, Infinity, a string) being refused rather than saved.
- **Feel** — the player's own eyes on screen: does an arranged village hold its
  shape, does the wander still read as strolling rather than sliding off a pin,
  do the building sites read as deliberate.

## 10. Out of scope

- Per-creature undo. The reset button is the whole undo story for now.
- Dragging a *group* of villagers.
- Any real content for the three zones — this gives them a building site, not a
  Hatchery.
- Pinning from the spectator view or showroom: both read the same view and will
  show the arrangement, but neither gains a way to change it.

## 11. Risks

- **`placeCreatures` is delicate.** The empty-pins regression test in §9 is the
  guard: with no pins the function must produce exactly what it produces today,
  and §4.4 argues why the one added clamp cannot bind.
- **State version bump.** A v5 save cannot be read by an older build. The same
  one-way step every previous version bump took.
- **Two diverged repos.** This repo (OneDrive) and
  `C:\Users\truman\Projects\skill-village-web` are still unreconciled. This spec
  is grounded in the OneDrive worktree and must be re-verified if implementation
  happens elsewhere.
