# Village Lane Redesign — Design

**Date:** 2026-09-05
**Status:** approved in brainstorm, awaiting the owner's read of this file
**Scope:** sub-project 1 of 4 from the 2026-09-05 village brainstorm: art and structure.
The other three (creature voice, admin theme button, adding agents) get their own specs.
**Inputs:** the owner's brief ("you see the project, you see the little agents"; "the art is
the most important"; "a visual AI experience — recognizable without reading"), the
2026-09-05 design-shotgun board (six hand-built variants, pick B2), and the lane mockup
the owner approved by eye at `reference/village-lane-2026-09-05/` (day and night).

## 0. The principle

**You should know what you are looking at without reading a plate.** A project reads as
a house. A helper reads as a flying creature. Its color says its job family. Its tool says
its job. The house says whether the project is alive. Every visual channel carries one
meaning, and no two channels carry the same one.

## 1. Decisions log (from the brainstorm)

| # | Question | Decision |
|---|---|---|
| Q1 | Split of the four requests | Four sub-projects. Art first. |
| Q2 | What is a project, physically | **B**: a house, and the project creature stands at the door as the resident you talk to. Picked on the shotgun board (B2, ratings A1 3, A2 3, B1 3, B2 3, C1 2, C2 2). |
| Board | Art density | **Hand-pixeled** dense detail, not big flat shapes. |
| Board | Who flies | **All helpers fly.** Skills and agents both. Only residents stand. |
| Board | Notes | Spread out and organize. Fences never run into trees. |
| Q3 | Arrangement | **A**: one lane, stable order by first sighting, fixed plot width, the house carries the work signal, the Green at the far end. |
| Q4 | Crowd rule | **A**: six per yard on flight tiers, "+N more" board for the rest. |
| Q5 | Recognizable helpers | **C**: tool plus job color. Resolved so they cannot disagree: the family sets the hue, the tool is picked inside the family. |
| Build | Approach | **A: bake everything.** Painters in core, sprites in the client. |
| Section 1 | Lane and house | Approved by eye on the localhost mockup. |
| Sections 2–7 | Helpers, data, rendering, interaction, scope, tests | Approved. |

## 2. The lane and the house

**The strip.** Left to right: Hatchery (as today) · robot house on its own plot · the lane
of project houses · the Green · Adoption Center · Notice Board (as today). Only the Homes
zone changes.

**Plots.** One plot per project, all the same width: about four house-widths, mockup
520 px with a 40 px strip between plots. The house stands in the middle of its plot. The
yard is the rest, fenced, with a gate gap in front of the door. The fence line sits ~80 px
in front of the house baseline so the yard has depth (mockup: house at y 540, fence at
622, path at ~668). Plots stand in `firstSeenAt` order. A new project takes the next plot.
A released project's plot closes and the lane shortens. Trees and bushes stand only in the
strip between plots or behind the fence line. The path runs in front of every fence and
bends gently, as today.

**The house.** One and a half times today's house (base grid 96×66 house units at
scale 1.5). Parts: wall with plank lines and a stone foot band; stepped shingled roof;
brick chimney with a cap; door with frame, knob, and step; one or two cross-pane windows
with sills; a name sign hung under the eave; a flower box or a lantern. The sign is mono,
hugs its text, and trims a long name in the middle (`robot-per…riments`); the full name
shows on hover.

**Variation is hashed, not stored.** `houseLook(projectId)` is a pure function in core,
like DNA: wall/roof pair (palette `houseA` or `houseB`), door left or centre, chimney
side, one window or two, flower box or lantern, three-step or two-step roof. Same project,
same house, on any machine.

**The work signal**, from the mood bands that size the genie today (`THRIVING_MOOD`,
`CONTENT_MOOD` in `packages/core/src/sim/work.ts`):

| Band | Chimney | Windows after dusk | Resident |
|---|---|---|---|
| thriving (worked today) | smoke | lit | awake at the door |
| content (this week) | none | lit | awake at the door |
| below content (older) | none | dark | asleep on the step, with a "z" — still clickable |

Window glow at night is owned by the sky layer as today; the storm rule (windows glow in a
storm) applies only to lit houses.

**The Green.** An open field after the last plot: no fence, a bench, a tree, a sign that
says Green. Helpers no project uses hover there loosely.

## 3. The helpers

**Every helper flies.** Wings, tapered underside, a small shadow, per-creature phase
offsets. `winged` becomes true for every skill and agent. Residents stand.

**Job family sets the color.** Eight families own the eight curated hues
(`packages/core/src/appearance/palette.ts` `HUES`). Body and crown still come from the name
hash; only the palette hue moves to the family.

| Family | Hue | Tools |
|---|---|---|
| build | gold `#e2b45e` | hammer, wrench, gear |
| test | mint `#7fbf8a` | clipboard-check, bug, flask |
| review | sky `#7fb6d9` | magnifier, glasses, scale |
| write | lilac `#b79fd6` | quill, book, scroll |
| plan | rose `#e0a3b2` | lightbulb, compass, map |
| ship | coral `#e58c68` | rocket, flag, key |
| research | teal `#6fbcad` | telescope, globe, net |
| care | sage `#9dba77` | broom, basket, lantern |

**The tool.** A hand-drawn pixel glyph, six cells wide, two tones (ink plus the family's
lite), held at the side of the body at hand height, composited over the wing. It also
appears at small size on the nameplate and in the chat header. The set of twenty-four is
approved on a contact sheet before it ships.

**Picking family and tool.** A keyword table (§4) picks at scan time, so a creature is
never blank. When the personality card is written, the model may refine the pick from the
file's full text, once. After that the pick never changes: a creature that changes its look
stops feeling alive. Existing creatures get theirs from the keyword table at first boot.

**Seats in a yard.** Six fixed seats, three flight heights on each side of the house:
low by the fence, mid beside the wall, high beside the roof. Mockup offsets from the house
centre (x, feet-y, hover): (−120, 610, 26) (128, 610, 26) (−178, 578, 66) (184, 578, 66)
(−142, 570, 118) (148, 570, 118). Seats never overlap the house, the roof, the resident, or
each other, by construction. Each helper drifts a little inside its seat box. Seat rank is
by `helperUse` recency: the six most recently used show; the rest hide behind a "+N more"
board on the fence at the right of the plot.

**One helper, many yards.** A helper used by four projects hovers in four yards. One
personality, one stats block, one chat. A helper with no links hovers on the Green.

**Names on hover.** Nameplates appear on pointer hover, as today, in supersampled mono,
hugging their text. Speech bubbles float above the head.

## 4. Data and the personality card

**Core types** (`packages/core/src/types.ts`):

- `Creature.family: JobFamily` and `Creature.tool: ToolId`, set once. `familySource:
  'keyword' | 'card'` records who set them.
- `Creature.firstSeenAt: number` (projects use it for plot order; set for all kinds).
- Projects: `helperUse: Record<string, number>` — helper id → last time this project
  used it, derived from transcript facts (the newest `lastActivityMs` of any file that
  mentions the helper).
- `CreatureAppearance` keeps its shape; `palette.hue` is the family hue; `winged` is true
  for all helpers.
- `JOB_FAMILIES`, `TOOLS` (24 string grids), `familyHue(family)`, `houseLook(projectId)`,
  and the painters (§5) live in core and are exported through `@village/core/visual`.

**Keyword pick.** `pickFamily(name, description): { family, tool }` — pure, table-tested,
deterministic. First match wins, in this order:

| Match (name or description, case-insensitive) | Family |
|---|---|
| test, qa, verify, assert | test |
| review, audit, lint, inspect, check | review |
| deploy, ship, release, land, publish | ship |
| plan, brainstorm, design, spec-writing, roadmap | plan |
| doc, write, readme, summar, note | write |
| scrape, search, browse, fetch, research, explore | research |
| clean, memory, save, restore, tidy, prune, context | care |
| anything else | build |

The tool inside the family is the family's first tool unless a second keyword names one
(e.g. "bug" → bug, "rocket"/"launch" → rocket); otherwise the first.

**Card refine.** `personalityCardPrompt` asks for `"family"` and `"tool"` from the fixed
lists. `parsePersona` accepts them only if both are valid and the tool belongs to the
family; otherwise the keyword pick stands and the card is still accepted. A valid card
pick replaces a keyword pick once (`familySource: 'card'`). A card pick never replaces a
card pick.

**Migration.** `STATE_VERSION` +1. The migration fills `family`/`tool`/`familySource`
for every helper from `pickFamily`, sets `firstSeenAt` from the earliest recorded event
for that creature or else its `lastSeenAt`, recolors every helper palette to its family
hue via `derivePalette`, sets `winged` true for helpers, prunes `layout.pins`. Idempotent.
The Peddler branch (`origin/m4-5-peddler`) also claims the next version; whichever lands
second renumbers.

**Wire.** `/api/state`, the socket `state` frame, and `/api/creatures` carry the new
fields. `packages/web/src/net/protocol.ts` treats them as optional so an older client
still draws.

## 5. Rendering (approach A: bake everything)

**Painters in core** (`packages/core/src/appearance/`): `house.ts` — `paintHouse(look,
state, tokens): PixelGrid`; `tools.ts` — the 24 grids; `flora.ts` — tree and bush grids.
Pure, no engine, no DOM, snapshot-tested. Fences, signs, benches, and the smoke stay
as tagged rectangles.

**Bake.** `packages/web/src/render/bake.ts` already bakes a grid into pixels; houses,
trees, and bushes use the same path. House bake key: `(projectId, state, tokensSignature)`.
A theme publish re-bakes houses on screen and marks the rest stale to bake on scroll-in.
Window glow stays a small overlay rectangle owned by `scene/sky.ts`, so dusk does not
re-bake. The tool glyph is composited into the creature grid at bake time: one sprite per
helper.

**Lane layout, pure** (`packages/web/src/layout/lane.ts`): projects sorted by
`firstSeenAt` → plots; per project, helpers ranked by `helperUse` → the six seats and the
hidden count; unlinked helpers → Green positions; the robot house plot at the head; world
width. A function of the state alone. Replaces the Homes hashing in `zones.ts` and the fan
in `instances.ts`. The residency rule stands: a project living in the robot house stands
at the robot porch alone (`seatResident` verdict, 2026-08-26).

**Culling.** Everything off camera is hidden with `hidden`, never `offscreen({pause})`
(frame-cost lessons, 2026-09-03). Camera and drag-pan as today.

**Motion.** Helpers keep breath, blink, flap, phase offsets, and drift inside the seat
box. Residents breathe and blink, or sleep with closed eyes and a "z". Houses never move.
Smoke is three puffs rising on a slow timer, the one moving thing on a house.

**Gate.** `?perf` in-frame CPU, before and after: a lane of every project on the reference
machine must cost no more per frame than today's village.

## 6. Interaction

- Click the resident or the house → the project's chat (as today). Click any copy of a
  helper → that helper's chat.
- Click the "+N more" board → a DOM list of the hidden helpers, each with its tool; click
  one → chat.
- Hover a house with a trimmed name → the full name.
- Drag a resident to the robot house → it moves in (as today); its door stands empty; its
  house keeps its work signal.
- **Villager pinning is removed.** The lane is the layout. `layout.pins` is pruned by the
  migration; the "put everyone back" button (`ui/layout-button.ts`) and `/api/layout/*`
  go. This is the one M5 feature the redesign takes out, by the owner's decision.

## 7. Scope

**Stays:** Hatchery, Adoption Center, Notice Board scenery; the robot house at the head
of the lane; sky, weather menu, time-of-day; sound; the spectator site; the chat panel.
**Replaced:** genie presence sizing → house states; the commons → the Green; hashed Homes
placement → the lane.
**Out of scope:** creature voice (sub-project 2), admin theme button (3), adding agents
(4), M6 care verbs, the Peddler, the foundation sprint.

## 8. Testing and gates

**Pure tests:** `pickFamily` table; `houseLook` stability and distribution; lane layout
(plot order, seat fill, hidden count, Green) with an invariant test that no two seat boxes
in a plot intersect and none intersects the house box; tool grids well-formed (legal roles,
6 wide); painter golden snapshots for every house look × state × day/night; migration
v5→v6 fills, recolors, prunes, and is idempotent; `parsePersona` with valid, invalid, and
mismatched family/tool; protocol optional fields.

**Contact sheets** (`packages/core/scripts/contact-sheet.ts` grows): the 24 tools; one
sample creature per family with each tool; every house look × three states × day and
night. **Gate 1:** the owner approves the sheets by eye before scene work starts.

**Live playtest:** the lane with the owner's real villagers on the dev server, day and
night via `?at=`, storm via `?weather=storm`. **Gate 2:** the owner's verdict against the
eye rules — bodies never coincide, ground everything, one channel one meaning, boxes hug
text, selective animation. **Gate 3:** the `?perf` budget.

## 9. Build order (for the plan)

1. Core: types, `pickFamily`, `familyHue`, `houseLook`, `TOOLS`, painters, tests.
2. Server: migration, scanner fills family/tool/firstSeenAt/helperUse, card prompt and
   parse, wire fields.
3. Web: protocol fields; `layout/lane.ts`; bake pipeline for houses and flora; tool in the
   creature bake; scene: houses, seats, Green, smoke, sleep; remove pinning.
4. Contact sheets → Gate 1. Live playtest → Gates 2 and 3.

## 10. Visual reference

`reference/village-lane-2026-09-05/`: `lane.html` (the approved mockup; `?t=day|night`),
`lane-day.png`, `lane-night.png`, and `variant-B2.png` (the shotgun pick). Palette hexes,
body grids, offsets, and the work-signal caption in those files are the numbers to copy.
