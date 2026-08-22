# SDD ledger — plan: docs/superpowers/plans/2026-08-21-m3-web-village.md

**Spec:** docs/superpowers/specs/2026-08-21-skill-village-web-design.md (read; binding authority)
**Branch:** m3-web-village
**Merge base:** 4ddcc199c7c949768a0bac8752d491403965e432

## Pre-flight scan

### Cross-task rows (tasks sharing a file or an interface)

| Tasks | Producer → consumer | Finding |
|---|---|---|
| 1 → 9, 10, 11 | `THEME`, `U` → scene + creature + labels | **F1** hex-literal violation, see rulings |
| 1 → 12 | root `package.json` scripts (`dev:web`) → (`dev`) | Clean: different keys, sequential |
| 2 → 4, 10 | `roleMap`, `RoleMap` → `bakePixels`, creature actor | Clean: signatures match |
| 3 → 4, 10 | `composeGrid`, `ComposedGrid` → bake input, actor | Clean: verified by running composeGrid against real core grids |
| 3 → 12 | `EyeAnchor` re-export → `index.ts` | Clean after the self-review fix that re-exports core's type instead of redeclaring |
| 4 → 10 | `bakePixels`, `hexToRgb` → actor texture bake | **F2** `hexToRgb` reaches the actor only via dead code, see rulings |
| 5 → 10 | motion fns → actor `update` | Clean: `phi` threaded through every call |
| 6 → 10 | `behaviourFor`, `Behaviour` → actor flags | Clean |
| 7 → 9, 10 | `ZONES`/`WORLD_W`/`GROUND_Y` → scene; `Spot`/`placeCreatures` → actor + setView | Clean |
| 8 → 9, 10 | `VillageView` → `setView` signature | Clean: Task 9 imports the type from protocol |
| 9 → 10 | `scene/village.ts` created, then modified | Clean: strictly sequential, additive |
| 10 → 11 | `scene/creature.ts` created, then modified | Clean: nameplate added before the `return`, so `update` closes over it |
| 12 → all | `index.ts` re-exports every pure module | Clean: no name collisions across the nine modules |

### Per-task self-consistency rows

| Task | Tests vs code, files created vs later touched | Finding |
|---|---|---|
| 1 | THEME test iterates all entries for hex validity — tolerant of added keys | Clean (F1 adds keys safely) |
| 2 | 6 assertions against 6 roles | Clean |
| 3 | 15 assertions; **executed against real core data during plan self-review, all passed** | Clean |
| 4 | Fixture `ComposedGrid` matches Task 3's interface | Clean |
| 5 | Constants match spec §4.2 verbatim; hop/blink/shadow math verified by execution | Clean |
| 6 | Thresholds self-consistent; sleep dominates hop and fly | Clean |
| 7 | Determinism + stability assertions match the id-hash implementation | Clean |
| 8 | Parser rejects malformed input rather than throwing | Clean |
| 9 | No unit test by design (KAPLAY glue) | **F3** unverified KAPLAY API surface |
| 10 | No unit test by design | **F2** dead code; **F3**; **F4** blink leaves baked eye-white visible |
| 11 | 5 label assertions; scene edits are additive | Clean |
| 12 | Re-export list matches the nine modules that exist by then | Clean |

### Rulings

- **Ruling (F1): extend `THEME` rather than allow hex literals in scenes.** The plan's Global Constraints forbid hex outside `theme.ts` and creature palettes, but Task 9's houses (`#E8D3EE`, `#B39DDB`, `#F2D8A7`, `#D96C57`) and Task 10's shadow (`#5A4628`) are literals. The constraint is right and the task code is wrong. Task 1 adds `shadow`, `wallLilac`, `roofLilac`, `wallSand`, `roofClay` to `THEME`; Tasks 9 and 10 reference them. *Cost if wrong: five constants sit in the theme unused — trivial to undo.*
- **Ruling (F2): delete the dead code in Task 10.** `rgbaCss()` is never called and `lidColour` is only kept alive by `void lidColour;`. Both would be flagged as YAGNI by the reviewer, and the `void` is a suppression that hides the defect. `lidColour` is revived with a real purpose by F4; `rgbaCss` is deleted outright. *Cost if wrong: a helper gets rewritten later if translucent shadows are wanted.*
- **Ruling (F4): blinking must cover the baked eye-white.** Eye whites are role `W`, baked into the body texture, so drawing only a lash line leaves two white squares showing through a closed eye. Each eye gets two overlay rects: a lid (body hue, 2×2 cells, shown only when shut) and a pupil (shown only when open), with the lash line drawn as a thin dark rect at the lid's lower edge — which is exactly the trailer's construction. *Cost if wrong: blinking looks wrong and is re-fixed in the review loop; this is the milestone's most visible motion, so catching it pre-flight is worth the ruling.*
- **Ruling (F3): the implementer verifies KAPLAY's API against the installed type declarations.** Task 9 already carries this instruction; it extends to Task 10 (`k.getSprite`, sprite swapping, `k.clamp`, `k.lifespan`, `k.move`, init options). Plan code that disagrees with the installed `kaplay` types loses to the types. *Cost if wrong: none — this is how the code has to be written regardless.*

---

## Progress
Task 1: implemented (commit 1a0ed96) — theme + package skeleton, 344/344 suite, typecheck clean.
Task 1: review — spec OK (both rulings honoured); 1 plan-mandated conflict, 1 Important, 1 Minor.
Task 1: Ruling: index.html's `background: #171310` literal stands — the no-hex-literal constraint binds
  TypeScript modules, and this is the pre-boot page background, painted before any module loads, so it
  cannot read THEME. Threading it in would need a build-time template for one value visible for a few
  frames. It gets a comment marking it as a deliberate mirror of THEME.night instead.
  Cost if wrong: if THEME.night ever changes, index.html must change with it — one grep away.
Task 1: minor (deferred): the five ruling-added THEME comments name what each colour is for but not why
  it needs its own slot; softer than the grids.ts house style.
Task 1: fix round 1/5 (2 addressed, 0 open; commits 1a0ed96..0907020)
Task 1: complete (commits 4ddcc19..0907020, review clean)
Task 2-4: batched as one dispatch — the render pipeline (roles -> compose -> bake). Same directory,
  all pure functions, plan carries complete code, and Task 4's tests consume Tasks 2 and 3 directly,
  so one review surface is the natural unit.
Task 2-4: implemented (commits 1ab8e31 roles, 899d95c compose, 966452b bake); 373/373 suite, typecheck clean.
Task 2-4: review — spec OK, no scope creep; 1 Important (plan-mandated), 2 Minor (plan-mandated).
Task 2-4: Ruling: the lanky posture tests are tautological and must be strengthened. composeGrid always
  appends POSTURES[chosen].rows as the literal tail, so asserting rows.slice(-N) === those rows is true
  regardless of where the walk-back sets `start` — a boundary bug that ate into the torso or left a stray
  leg row would pass. The reviewer hand-traced the current code as correct (start=8, hip taper '..XXX..'
  retained), so this is a missing regression guard, not a live bug. The plan's test text is wrong and the
  finding is right: pin the retained torso prefix and the composed height for a winged lanky.
  Cost if wrong: one extra test on the milestone's subtlest function.
Task 2-4: minor (deferred): baseIndex's doc comment claims it handles lanky, but the lanky path
  reimplements the D-row search inline and never calls it — misleading vestige from the brief.
Task 2-4: minor (deferred): lanky branch duplicates findIndex(row => row.includes('D')) instead of
  reusing baseIndex(). DRY nit, not a defect.
Task 2-4: fix round 1/5 (1 addressed, 0 open; commits 966452b..908299e) — deliberate-break check confirmed
  the new assertions fail on a one-row-off walk-back while the old tail-only ones stayed green.
Task 2-4: complete (commits 0907020..908299e, review clean)
Task 2-4: minor (deferred): the no-feet-on-lanky assertion is implied by the torso-prefix + tail
  assertions; belt-and-suspenders, not new coverage.
Task 5-6: batched — motion vocabulary and behaviour flags, both pure motion/ modules with complete
  plan code and no shared file.
Task 5-6: implemented (commits ecfbab5 motion, 26a131f behaviour); 404/404 suite, typecheck clean.
Task 5-6: complete (commits 908299e..26a131f, review clean — spec OK, quality approved, zero findings;
  reviewer hand-verified the blink duty-cycle and hop-landing tests genuinely bite).
Task 7-8: batched — zone layout and the server client. Both pure modules plus one deliberately untested
  socket file; no shared file between them.
Task 7-8: implemented (commits 2fd8269 zones, f1197ac net); 424/424 suite, typecheck clean.
Task 7-8: review — spec OK, no scope creep; 1 Important (plan-mandated) on isRenderable.
Task 7-8: Ruling: deepen protocol.ts's isRenderable guard. It asserts `value is Creature` but only checks
  that `appearance` and `stats` are non-null objects, so `appearance: {}` passes the filter and reaches
  the renderer typed as complete. Task 10 dereferences appearance.palette.hue and indexes
  BODIES[appearance.body] directly, so a half-formed creature crashes exactly the way toView exists to
  prevent. Load-bearing: Task 10 builds on this contract. Validate what the renderer actually touches --
  body/crown as members of core's BODY_IDS/CROWN_IDS, palette.hue/lite/dark as strings, winged boolean,
  nickname string, stats.mood/energy numbers. The brief is wrong and the finding is right.
  Cost if wrong: a stricter filter could drop a creature the renderer would have survived, but since the
  checks cover exactly the dereferenced fields, a dropped creature is one that would have crashed.
Task 7-8: minor (deferred): zones.test.ts determinism test is weak in isolation (two in-process calls
  agree even under once-per-load seeding); purity rests on the module having no random/clock/mutable state,
  which the reviewer verified by reading it. Reviewer explicitly called this not a defect.
Task 7-8: fix round 1/5 (1 addressed, 0 open; commits f1197ac..35d560d) — implementer mutation-checked all
  5 negative cases against the reverted shallow guard before restoring the fix.
Task 7-8: complete (commits 26a131f..35d560d, review clean)
Task 7-8: minor (deferred): isRenderableAppearance/Palette/Stats return boolean rather than type
  predicates; fine today since isRenderable carries the assertion, but standalone calls get no narrowing.
Task 9: dispatched alone — first task with no unit tests (KAPLAY glue). Visual verification is mine to do
  with browser tools, not the implementer's; it builds and serves, I look at it.
Task 9: implemented (commits d8ffaa4 scene, 208d8bd vite root fix). DONE_WITH_CONCERNS.
Task 9: implementer amended per rulings F1/F3 — houses use THEME.wall*/roof*, fonts via document.fonts
  (k.loadFont wants a file URL), k.camPos -> k.setCamPos/getCamPos (deprecated in installed types).
Task 9: Ruling (BLOCKER found during verification, plan defect): @village/web must import a browser-safe
  subset of core, not the barrel. core's index.ts re-exports appearance/dna.ts, which imports node:crypto
  at module top level; Vite externalizes Node builtins, so importing the barrel throws in the browser and
  main.ts renders a blank page today. I verified it: dna.ts is the ONLY file in core touching a Node
  builtin, and web uses exactly 13 symbols -- BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, INK, HUES,
  derivePalette, BODY_IDS, CROWN_IDS and 4 types -- all from types.ts, appearance/grids.ts and
  appearance/palette.ts, none of which import anything but types. Web never uses dna, files, sim or
  personality. Fix: add a `@village/core/visual` subpath over those three modules and point web at it.
  Chosen over swapping dna.ts's hash for a pure-JS one because that would fix today's crash while leaving
  the boundary undefined -- yaml and the file parsers would stay reachable from browser code, and the next
  Node-only import into core would break the web again silently. Additive: "." is unchanged, server
  unaffected. Cost if wrong: a larger diff than a one-line hash swap, and if subpath exports fight the
  toolchain the fallback is the pure-JS hash.
Task 9: fix round 1/5 (1 addressed, 0 open; commits d8ffaa4..2ab6cb8) — @village/core/visual subpath
  added, 8 web imports repointed, boundaries.test.ts added and proven to fail on violation.
Task 9: controller verification — I ran both servers and inspected the live page. Zero console errors;
  module graph loaded main/village/client/protocol/theme/zones + kaplay; /api/state returned 200 through
  the Vite proxy; canvas present at 1280x800. Decisively, the only core modules fetched were visual.ts,
  types.ts, grids.ts and palette.ts -- no dna.ts, no yaml -- so the browser-safety ruling holds in the
  real browser, not just in theory. Could NOT verify pixels: gl.readPixels returns black without
  preserveDrawingBuffer, and the Browser pane would not composite for a screenshot. Eyeball check
  deferred to Task 10, when there are creatures worth looking at.
Task 9: review — spec OK, all three rulings honoured, carve-out verified genuinely browser-safe;
  1 Important (drag-pan state leak), 2 Minor.
Task 9: minor (deferred): camera clamp [w/2, WORLD_W - w/2] inverts when viewport width exceeds
  WORLD_W (4300px) -- ultra-wide/spanned monitors only; camera freezes with blank space at the left edge,
  no crash, self-corrects on resize.
Task 9: minor (deferred): boundaries.test.ts regexes require `from` or `import(` before the specifier, so
  a bare side-effect import (import '@village/core') would pass the guard. No such import exists and named
  imports are the natural style, but the guard protects the exact crash class that cost us a blocker --
  flagging it prominently for the final review to triage.
Task 9: fix round 2/5 (1 addressed, 0 open; commits 2ab6cb8..47e4b44) — reviewer confirmed stopPropagation
  appears zero times in the KAPLAY bundle, so the window-level listener genuinely catches both the
  in-canvas and outside-canvas release paths.
Task 9: complete (commits 35d560d..47e4b44, 2 fix rounds, review clean)
Task 9: minor (deferred): the three new window listeners are never removed; matches the file's existing
  pattern (KAPLAY's own canvas listeners have no teardown either), flagged by implementer, not a regression.
NOTE (environment): the headless browser tab in this session never composites — document.hidden is true and
  rAF never ticks — so KAPLAY's frame-gated pipeline cannot be driven and no pixel or screenshot evidence is
  obtainable. Independently observed by me (readPixels black, screenshot timeout) and by the Task 9
  implementer. Visual claims in this milestone are therefore structural, never "I saw it look right".
Task 10: implemented (commit 663bd2d); 433/433 suite, typecheck clean. Reviewed on opus (largest, riskiest
  diff in the milestone). Spec OK, all 4 rulings met, no scope creep; 4 Important, 5 Minor.
Task 10: Ruling: all four Importants are real and all four get fixed. My brief was wrong in each case.
  (a) Pupil sits U*0.425 = 2.55px too low -- the brief converted the x offset to centre-anchoring but
      carried the trailer's top-left y offset over unconverted; the pupil's bottom overhangs the eye white
      onto the body hue. Correct value is baseY + U*0.125.
  (b) Eye overlays do not track the body's scale, so pupils detach from the face by up to 8.6px on lanky
      during the hop squash. The implementer judged this out of scope needing a reparent; the reviewer
      showed a ~4-line fix (scale the offsets, add k.scale to the three rects). Cheap enough that leaving
      it would be a choice to ship creatures whose eyes slide off their heads.
  (c) A view update arriving mid-spawn spawns the same creature twice and permanently orphans the loser --
      a frozen blob of stacked pupil/lid/lash at that creature's feet, since it is never update()d and
      nothing hides it. Plausible at startup with 70 async sprite loads racing the first WebSocket tick.
      This is a worse sibling of the self-healing race the implementer flagged, and both die to one
      per-id generation counter.
  (d) hopState(t, 0) omits phi, so every hopper hops in unison -- a direct violation of this milestone's
      own "Done when" criterion that nobody moves in lockstep. The trailer passes a scripted cue because
      it is a 30-second choreographed shot; a village that runs forever needs the stagger.
  Cost if wrong: (a) and (d) are one-line changes; (b) and (c) are contained to two files and are the
  difference between the village looking alive and looking broken.
Task 10: Ruling: minors living inside the lines an Important fix rewrites come along with it -- leaving a
  known dead-actor-update bug in freshly rewritten reconciliation code would be perverse. This does not
  extend the loop; it avoids re-touching the same block twice.
Task 10: Ruling: the lash sits at the lid's vertical midline, not its lower edge as my ruling worded it.
  The implementation matches the trailer, which is the visual bible, and the reviewer judges it reads as
  the closed-eye crease. My wording was loose; the trailer wins. No change.
Task 10: minor (deferred): shadow.pos.y = 0 is a dead assignment every frame (brief-inherited).
Task 10: minor (deferred): body sprite textures are never unloaded on destroy(); per-creature keys
  accumulate across respawns (brief-inherited, negligible at M3 scale).
Task 10: fix round 1/5 (6 addressed, 0 open; commits 663bd2d..668a0c7) — re-reviewed on opus; geometry
  verified analytically (lid edges coincide with the deformed block at both squash extremes, so ruling 1's
  coverage survives the scale fix), generation counter traced through both races, hop stagger uniform.
Task 10: complete (commits 47e4b44..668a0c7, review clean)
Task 10: minor (deferred): 2.6 is now a magic literal in creature.ts duplicating motion.ts's unexported
  HOP_CYCLE — if that constant changes, the hop stagger silently degrades rather than failing loudly.
Task 10: minor (deferred): the pupil-offset and lid-coverage geometry is pure arithmetic verified once by a
  throwaway script; nothing in the committed suite would catch a regression. Cheaply unit-testable, and it
  guards the milestone's most delicate visuals. Flagging prominently for the final review to triage.
Task 10: minor (deferred): pupil sits at the block centre horizontally, where the trailer is U*0.075
  (0.45px) left of it. Sub-pixel, pre-existing, not introduced by the fix.
Task 11-12: batched — labels + punctuation, then the public surface and dev script. Task 11's scene edits
  and Task 12's index both touch files the other needs; one review surface is the natural unit.
Task 11-12: implemented (commits 43dc4c4 labels+punctuation, b8fd6fa index+dev script); 438/438 suite,
  typecheck clean. Implementer caught two stale brief snippets: font: 'village'/'mono' string literals that
  would throw "Font not found" at first draw (threaded village.ts's resolved fonts through a new param),
  and a nameplate missing k.opacity while Step 5 assigned to it.
Task 11-12: review — spec OK, quality approved, zero Critical/Important. Reviewer verified all four of
  Task 10's fixes survive the same-file edits, and that the puff fires exactly once per landing.
Task 11-12: complete (commits 668a0c7..b8fd6fa, review clean)
Task 11-12: minor (deferred, FLAG TO FINAL REVIEW): behaviourFor is evaluated once at spawnCreature and
  village.ts respawns only on appearance change, so a creature crossing the sleep or scruffy stat threshold
  never updates its z-glyphs, dimming, hop or fly state within a session. Negligible in M3 (stats only drift
  slowly on server ticks and there are no care actions yet), but M4 adds chat and care, which change mood
  immediately and will expect the creature to visibly react. Pre-existing from Task 10's design, not
  introduced by Task 11.

=== ALL 12 TASKS COMPLETE (commits 4ddcc19..b8fd6fa) — proceeding to final whole-branch review ===

=== CONTROLLER VERIFICATION OF THE PLAN'S "DONE WHEN" CRITERIA ===
- npm test: 438 passing across 36 files (re-run after the machine's hard power-off). PASS
- npm run typecheck: clean. PASS
- npm run dev brings up server and client together: both serving within 2s, /api/health returns 70
  creatures, Vite serves the page, and /api/state proxied through Vite returns all 70. PASS
- web never imports @village/server: grep clean. PASS
- web never imports the bare @village/core barrel: grep clean, all via /visual. PASS
- no Math.random() in packages/web: grep clean. PASS
- no hex literals outside theme.ts: grep clean (index.html's pre-boot background is the one ruled
  exception and is not a .ts module). PASS
- ~/.claude untouched by the M3 run: find -newer against a marker set before the run returns nothing
  under skills/ or agents/; the only writes are in ~/.skill-village. PASS
- "nobody moves in lockstep": delegated to the final review's spec dimension, which checks phi at every
  call site. NOT independently confirmed by me.
- Visual confirmation: STILL IMPOSSIBLE in this environment (browser pane will not composite; confirmed
  a third time after the restart). Worked around by driving the pure pipeline in Node and rendering real
  villagers to SVG: all 6 bodies and all 5 crowns appear across the user's 70 skills, and synthetic
  winged agents exercise the flight undersides and lanky's three resting postures plus the trailing
  roam posture. Sheets delivered to the user. This is the first time anyone has seen the creatures.

=== FINAL WHOLE-BRANCH REVIEW (5 dimensions x parallel, 13 adversarial verifications, 18 agents) ===
48 findings raised. 13 verified. Controller independently confirmed several the 3-per-dimension
verification cap had left unchecked.
Final: Ruling: the fix wave covers 8 items (final-findings.md) -- 1 Critical, 5 Important, 2 Minor that
  live in the same lines. Everything else defers.
Final: Ruling: "no creature can ever hop" is NOT a code defect. hopper needs mood>75 && energy>70;
  creatures start at 70/70 and stats only decay in M3 because care actions are M4. The implementation is
  faithful to spec 4.2; retuning the thresholds to manufacture hopping would fake liveliness the game has
  not earned. Consequence to accept honestly: hop, landing squash, shadow squash and PuffBurst have never
  executed once, so four motion paths ship unexercised. First thing M4 should verify.
  Cost if wrong: those paths carry a latent bug nobody sees until care lands.
Final: Ruling: fly:'roam' not moving a creature across the village is out of scope, not a defect. Spatial
  roaming is a movement system M3 never claimed; roam selects the trailing posture and a hover.
  Cost if wrong: the village feels statically posed rather than trafficked until a later milestone.
Final: observation worth recording: all 70 creatures currently hold identical stats (mood = energy =
  62.657). Expected in M3 -- decay is uniform and nothing yet varies per creature -- but it means the
  behaviour system has exactly one live state across the whole village today.
Final: fix wave (commits b8fd6fa..c01bbf6, 8 commits) — re-reviewed on opus. 7 of 8 ADDRESSED. Critical
  ground fix verified by independent recomputation: GROUND_TOP = 458, rows at 620/574/528/482, shadow tops
  at 477, 19px margin, and the new test fails against the old 580 top. All four earlier fixes intact.
Final: Ruling: finding 2 gets ONE more targeted round, and this is not a second fix wave on a residual --
  it is NEW breakage the fix wave itself introduced, which the re-review exists to catch. Three facts
  decide it: a mid-list insert displaces incumbents (1571/2000 trials moved at least one, up to 341px);
  setView never repositions an existing actor, so a displaced incumbent keeps rendering at its old x while
  the newcomer takes that spot, turning a static overlap into a dynamic one; and the rewritten stability
  test appends to the end of an UNSORTED array, where displacement is impossible, so it is a tautology of
  exactly the kind this whole review has been hunting. Shipping a test that cannot fail is the one outcome
  worse than shipping the bug it hides.
Final: Ruling: you cannot have all three of per-id purity, guaranteed separation, and never displacing a
  neighbour -- with finite slots, any two exclude the third. I choose separation + correct rendering +
  an honest test, and accept that installing a skill can nudge its neighbours. Rationale: the spec's
  "stable geography" promise is about reloads with unchanged membership, which is the common case and is
  preserved; membership changes are rare and a villager shifting to make room reads as the village
  adjusting, not as randomness. Cost if wrong: adding a skill visibly slides up to a few neighbours.
Final: finding 2 round 2 (commit 406bd4c) — ADDRESSED. Reviewer verified by EXECUTING the real
  placeCreatures against the test fixture rather than reading it: the displacement branch is entered in
  71% of the test's 200 arrivals, so the new test is genuinely not a second tautology. Order-independence
  (layout is a pure function of the id SET, not the order the server sends them) confirmed as a real
  strengthening, false without the internal seating sort. All binding constraints clean.
Final: parked — the new zones.test.ts comment still describes the OLD implementation ("appending to the
  end... can never displace anyone"); with the internal seating sort that is no longer why the test works.
  Ruling: real but cosmetic, and nothing builds on it. A stale comment on an honest test is a smaller debt
  than another round at this point. Cost if wrong: the next reader of that test is briefly misled.
Final: parked — the fix report's arrival statistics do not reproduce. It claims 42/38/10/9% and "never
  more than three" displaced with an 821px max; against the test's own fixture the reviewer measured
  29/30/22.5/10/8.5%, four displaced in 17 of 200 cases, and a 338px max. Ruling: real, and it understates
  the tail, but no assertion depends on those numbers and the behaviour itself is correct and bounded by
  a test. Recording the true figures here so the prose cannot mislead later. Cost if wrong: someone plans
  around a tighter displacement bound than actually holds.

=== FINAL REVIEW CLEAN — all findings addressed or parked with rulings ===
