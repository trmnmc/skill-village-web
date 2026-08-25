## Checklist
- [x] Voice investigation + fix wave merged (`cb31c45`), re-playtested ("fine for now")
- [x] Silent-banner race + test flake fixed (`2555d8b`)
- [x] Remap spec written + user-approved (`f9faf2f`) with mockup artifact
- [x] Palette/weather/moon spec approved (`56217d8`) and plan written (`86ac12c`)
- [x] Execute the palette plan — Tasks 1–14 done on branch claude/palette-weather-moon
- [x] Diagnose the storm + Kelvin playtest complaints (storm was a real architectural defect; the "Kelvin is a false alarm" verdict was later superseded — see `6b536d3`)
- [x] Plan + execute the 3-task weather fix wave (rescale, clouds, lightning) — review-clean at `dbdec41`
- [x] Coordinate with peer session and merge into main (`ea05233`, 852/852 + typecheck, pushed)
- [x] Post-merge cleanup (worktree removed, branch deleted, `dev-worktree` launch entry removed, 5173 on main's `dev`)
- [x] Diagnose "day/night + weather won't toggle" — not a bug; three design rulings compounding (URL overrides beat the menu, a time-pin freezes the cycle, Real only prompts on click)
- [x] Palette pin row in the gear menu (`27de404`) — auto + one chip per palette, persisted to `sv-palette-pin`; priority is `?palette=` > pin > schedule
- [x] Special days get a daylight noon (`6b536d3`) — a single-palette day's two `day` keyframes pull 80% toward 1a's sky. This, not the earlier "working as specced" ruling, is the real answer to the Kelvin complaint
- [x] Rainbow rebuilt across five commits (`6ab09ee` `ce23ce5` `cd27974` `510879a` `3693978`) — seated on the horizon, then re-derived as the cap of a circle centred on the antisolar point *below* the horizon; thin bands, leg fade, colours lifted toward white, sun read once and held, dropped to z 1 behind the weather. A bow keeps its clouds (a playtest note reversed half of `6ab09ee`); only heat haze gets bare sky
- [x] The village sleeps at night, not forever (`ded7076`) — decay floor 20 against a sleep threshold of 25 had left 69 of 75 creatures permanently asleep; the v3 migration (`ce56696`) wakes already-stranded saves at once
- [x] No white fringe around a shut eye (`7a56211`) — lid overhang plus `creatureOverlayColor`, so solid rects take the sky tint that sprites get for free

- [ ] **Answer "the floor is still clear."** Raised 2026-08-25 and never resolved — the session pivoted to the menu bug first. The ground *tint* provably works (store gives snow `#EBF1F2`, storm `#92AE82`, clear `#A8C68D`), so it is not a broken tint. Candidates: no snow accumulation/depth, a featureless green plane wanting texture, or dead space below the village in a tall window. **Ask before building**
- [ ] **Finish the visual playtest of the merged sky.** Rainbow, clouds, night and creature rendering *did* get human eyes — the five rainbow commits and `ded7076`/`7a56211` all came out of that pass. Still never seen: **a real ~30s lightning strike, the storm at large, clouds at all phases, two window sizes.** Display the Browser pane first; screenshots fail while it is hidden. Remember `&day=wed` to get the Kelvin weave rather than a weekend special
- [ ] Deferred visual minors from the final review — 2 of 4 are now fixed:
  - [x] rainbow rebuilds on resize — triggers on width *or* horizon change > 1px (`weather-layer.ts` ~1250)
  - [x] fair clouds no longer pop at the dusk flip — crossfade, and suppression follows the ramp
  - [ ] strike glow draws over the near deck — lightning still draws at z 5 while creatures span z 4–7
  - [ ] viewports under ~256px give `fy <= 0` — `fy()` is still a bare `horizonY / 182`, unclamped
- [x] **Weather-menu affordance — shipped and then some (`cc8041b`).** Not just the note: a menu click now strips the dev params via `history.replaceState` and takes effect immediately, and the store re-reads `location.search` on every resolve. The amber note (`skyOverrideKeys`) shows only until that first click
- [ ] **M5 execution** — the plan now exists at `docs/superpowers/plans/2026-08-25-m5-projects-move-in.md` (13 tasks, written 2026-08-25 against the remap spec). Not started. Note the plan corrects two stale spec assumptions: the transcript store is 486 files / 200 MB (not 314 / 20 MB), and most transcripts are nested under `<session>/subagents/`, so discovery must walk recursively
- [ ] LICENSE decision (user's call; MIT suggested) — there is still no LICENSE file in the repo
- [ ] Optional: Pages landing refresh
- [ ] Playtest leftovers from M4 final review (bubble occlusion, meter granularity, trackpad tap + double-click)
- [ ] Backlog: project breeding (parked)
- [ ] Housekeeping: 8 branches are fully merged into main and are deletion candidates (`custom-game-agents-3335c5`, `swarm-adoption-engine-b85a0a`, `token-drain-investigation-8cf0e3`, `flying-skills-missing-778900`, `volumetric-clouds`, `multiplayer-hub-interaction-b9ec2f`, `project-visualization-686f3c`, `skill-creatures-sound-engine-53779b`); 3 stashes are still parked on main
- [ ] Commit or discard the untracked `pause-2026-08-24-palette-rainbow-sleep.md` (offered twice, never answered)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

_Updated: 2026-08-25 — main · verified against `842ca08`; 937 passed + 1 skipped, typecheck green_
