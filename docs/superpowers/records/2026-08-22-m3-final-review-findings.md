# M3 final review — the fix wave

Five review dimensions raised 48 findings; 13 were adversarially verified, and the controller
independently confirmed several the verification cap had left unchecked. What follows is everything
that must be fixed before this branch merges. Anything not listed here has been deliberately deferred
and is recorded in the ledger.

Nobody has ever seen these creatures render — this environment's browser never composites a frame — so
every item below was found by reading code, and several would have been obvious in one glance at a screen.

---

## 1. CRITICAL — three quarters of the village floats in the sky

**`packages/web/src/scene/village.ts:90-91`**

The ground is painted as two bands: a far band `block(k, 0, GROUND_Y - 40, WORLD_W, 40, THEME.groundDark)`
and a near band from `GROUND_Y` downward. `block` uses `k.rect` + `k.pos` with no anchor, and KAPLAY 3001
defaults to top-left, so painted ground occupies `y >= 580` only.

But `placeCreatures` (`packages/web/src/layout/zones.ts:27-28, 63`) spreads villagers over `ROWS = 4` at
`ROW_DEPTH = 46`, giving `y = 620, 574, 528, 482`. Only row 0 lands on ground. Rows 1–3 stand 6px, 52px
and 98px **above** the far band's top edge, on the sky-blue KAPLAY clear colour — and their contact
shadows go with them, painting ellipses in mid-air.

Running the real FNV-1a hash over the 70 live creature ids gives a 19/16/16/19 split across rows 0–3, so
**roughly 51 of 70 villagers stand on nothing.** The camera opens at `GROUND_Y - 160 = 460`, putting the
horizon and the floating rows dead centre of the very first frame.

The far band must be at least `(ROWS - 1) * ROW_DEPTH = 138px` tall, not 40. `zones.ts:24`'s own comment
says "depth rows sit just behind it" — that is exactly what the code fails to deliver. The binding
reference gets it right: `reference/animation-trailer/skill-village-scene.jsx:289` paints ground
`top: 780, height: 500` with only a 14px dark strip on top, and its whole cast sits well inside the
ground body.

**Fix:** make the drawn ground actually contain every depth row, with margin. Derive the band height from
`ROWS` and `ROW_DEPTH` rather than hardcoding a number that can silently fall out of step with them again.

---

## 2. IMPORTANT — villagers overlap, and the test that was supposed to catch it cannot

**`packages/web/src/layout/zones.ts:58` and `packages/web/src/layout/zones.test.ts:56`**

There is no minimum spacing between placements. About 18 of the 70 villagers sit within 60px of a
same-row neighbour, with the closest pairs 8–9px apart — creatures 42–72px wide, so those pairs visibly
overlap and their nameplates collide.

The guard test, `"spreads them out rather than stacking them"`, asserts only that the number of distinct
x values exceeds `ids.length / 2`. That passes comfortably while 18 pairs are stacked, because distinct-
but-adjacent still counts as distinct. It is a tautology in the same family as the two already caught and
fixed during execution.

**Fix:** enforce a real minimum separation between same-row neighbours while keeping placement
deterministic and stable (a creature's spot must still depend only on its own id — adding a villager must
not move anyone else, and `zones.test.ts`'s existing stability test pins that; do not break it).
Then rewrite the spread test to assert the property that matters: no two same-row villagers closer than
the minimum. Verify the new test fails against the current implementation before you change it.

---

## 3. IMPORTANT — behaviour flags freeze at spawn, so mood and energy select nothing

**`packages/web/src/scene/creature.ts:85` and `packages/web/src/scene/village.ts:194`**

`behaviourFor(creature)` is evaluated once, inside `spawnCreature`, and captured in the actor's closure.
`setView` respawns an actor only when its *appearance* changes — deliberately, since stats change on every
server tick and respawning on those would restart every creature's motion.

The consequence is that `asleep`, `hopper`, `fly` and `scruffy` are decided from the stats a creature
happened to have when it was first drawn, and never change again for the life of the page. Spec §4.2 is
explicit that "mood and energy select which flags are active, so a well-cared-for skill hops and a
neglected one dozes" — as written, they select once and then stop mattering.

**Fix:** let the actor re-evaluate its behaviour when the creature's stats change, without respawning it
and without restarting its motion. Pass the updated creature through to the existing actor and recompute
the flags there. Sleep glyphs, nameplate dimming, wings and hop state must all follow the new flags.

---

## 4. IMPORTANT — roaming lanky agents draw their eyes 6–18px away from their eye whites

**`packages/web/src/scene/creature.ts:108, 132, 191, 202, 259, 270, 306`**

A winged `lanky` creature has two baked textures: the resting grid and the `trailing` roam grid. They are
**different heights**. `composeGrid` keeps the torso (`rows.slice(0, 8)`) and appends the posture's rows,
and posture row counts differ: `stubs` 1, `splayed` 2, `floating` 3, `trailing` 4. So
`restGrid.h = 8 + rest.rows.length + crown.h` while `roamGrid.h = 12 + crown.h` — a fixed difference of
3, 2 or 1 rows (18/12/6px at U=6), never zero.

Every derived geometry constant is computed once from `restGrid` and never revisited: `bh` (108), the wing
y (132, 259), the nameplate and file-label y (191, 202), the z-glyph y (306), and critically
`baseY = (anchor.r - restGrid.h + 1) * U` (270). The body sprite is `anchor('bot')`, so the taller roam
texture lifts the head — but the overlays stay put.

For the common `stubs` case the true eye-white centre is at `(2 - 12 + 1) * 6 = -54` while the pupil, lid
and lash are drawn at `(2 - 9 + 1) * 6 = -36`. The baked eye whites are left fully exposed — two blank
squares that never blink and never track — while the pupils sit 18px lower on the torso, the nameplate
overlaps the crown, and both wings hang below the shoulders. It corrects itself the moment the agent's
energy drops below 60 and it stops roaming.

**Fix:** derive the overlay geometry from the grid currently being displayed, not from the resting grid.

---

## 5. IMPORTANT — the left wing draws inward across the body

**`packages/web/src/scene/creature.ts:132-140`**

The left wing is mirrored with a negative x scale and positioned with `anchor('right')`. KAPLAY composes
its transform as T·S·R and applies the anchor offset **after** the mirror scale (confirmed against
KAPLAY's own `src/game/make.ts:148-151` via the shipped sourcemap), so negating the scale flips which side
of the anchor point the sprite occupies. The left wing therefore extends inward over the creature's body
instead of outward from its shoulder.

**Fix:** position the mirrored wing so it extends away from the body, accounting for the anchor being
applied after the scale. Both wings must sit symmetrically outboard of the shoulders.

---

## 6. MINOR (fix while you are here) — a landing puff on the very first frame

**`packages/web/src/scene/creature.ts:314` with `packages/web/src/motion/motion.ts:60-79`**

`lastLanding` initialises to `null` while `hopState` returns a non-null `landedAt` for any `t` past the
first landing of its cycle. Because the hop clock is now staggered by `-phi * 2.6`, most creatures are
mid-cycle on their first drawn frame, so `hop.landedAt !== lastLanding` is true immediately and a puff
fires for a landing that never happened.

**Fix:** seed `lastLanding` from the first observed `landedAt` rather than from `null`, so a puff only
fires on a *transition*.

---

## 7. MINOR (fix while you are here) — a `void` suppression survived

**`packages/web/src/scene/creature.ts:61`** — `void square;` inside `puff()`.

This is the exact pattern already removed once during execution under a standing ruling: a `void x;` that
exists only to silence the compiler is a signal that `x` should not exist. Restructure so the value is
either used or never bound.

---

## 8. IMPORTANT (test rigor) — two guards that cannot fail

Both are in the same family as the tautologies already caught and fixed during execution.

**(a) `packages/web/src/motion/motion.test.ts`** — every phase-offset term except `isBlinking`'s is
unguarded. Delete the `phi` term from `breathe`, `gaze`, `wingAngle` or the hover sine and all 438 tests
still pass. The phase offset is the single detail the spec credits with most of the living-community
feeling, and the plan's own "Done when" says *nobody moves in lockstep* — yet nothing pins it.
**Fix:** for each periodic function taking `phi`, assert that two different `phi` values genuinely produce
different output at the same `t`. Verify each new assertion fails when its `phi` term is removed.

**(b) `packages/web/src/motion/behaviour.test.ts:46`** — `scruffy` is never asserted `false`. Hardcoding
`scruffy: true` in the implementation passes the entire file.
**Fix:** assert both polarities, and confirm the hardcode now fails.

---

## Explicitly NOT in scope — do not change these

These were reviewed and deliberately deferred; several are recorded rulings.

- **No creature can ever hop in M3.** `hopper` needs `mood > 75 && energy > 70`, creatures start at 70/70,
  and stats only decay because care actions land in M4. This is faithful to the spec, not a defect — do
  not retune the thresholds to manufacture hopping.
- **`fly: 'roam'` does not move a creature across the village.** Spatial roaming is a movement system M3
  never claimed; `roam` currently selects the trailing posture and a hover.
- The duplicated FNV-1a hash between `motion.ts` and `zones.ts` (a recorded ruling — it is deliberate).
- `index.html`'s pre-boot `background` hex literal (a recorded ruling).
- The lash sitting at the lid's vertical midline rather than its lower edge (a recorded ruling — it
  matches the trailer, which is the visual bible).
- README wording, doc nits, `WORLD_W` derivation, `WING` dimension derivation, the `0.7` squash coefficient
  duplication, unused public-surface exports, and the `boundaries.test.ts` side-effect-import regex gap.
