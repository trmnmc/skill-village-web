## Checklist
- [x] Voice investigation + fix wave merged (`cb31c45`), re-playtested ("fine for now")
- [x] Silent-banner race + test flake fixed (`2555d8b`)
- [x] Remap spec written + user-approved (`f9faf2f`) with mockup artifact
- [x] Palette/weather/moon spec approved (`56217d8`) and plan written (`86ac12c`)
- [x] Execute the palette plan — Tasks 1–14 done on branch claude/palette-weather-moon
- [x] Diagnose the storm + Kelvin playtest complaints (root causes found; Kelvin was a false alarm — weekend special palette, not a code defect)
- [x] Plan + execute the 3-task weather fix wave (rescale, clouds, lightning) — review-clean at `dbdec41`
- [x] Coordinate with peer session and merge into main (`ea05233`, 852/852 + typecheck, pushed)
- [x] Post-merge cleanup (worktree removed, branch deleted, `dev-worktree` launch entry removed, 5173 on main's `dev`)
- [x] Diagnose "day/night + weather won't toggle" — not a bug; three design rulings compounding (URL overrides beat the menu, a time-pin freezes the cycle, Real only prompts on click)
- [ ] **Weather-menu affordance (awaiting user go-ahead):** show "dev override active — menu muted" when URL params are present, and highlight the pinned time chip — `packages/web/src/ui/weather-menu.ts`
- [ ] **Full visual playtest of the merged sky on main** — never done with human eyes: clouds at all phases, rainbow, a real ~30s lightning strike, two window sizes (display the Browser pane first; screenshots fail while it is hidden)
- [ ] Deferred visual minors from the final review: strike glow draws over the near deck; rainbow doesn't rebuild on resize under a pinned time; fair clouds pop at the dusk flip; viewports under ~256px give `fy <= 0`
- [ ] M5 implementation plan (writing-plans against the remap spec)
- [ ] LICENSE decision (user's call; MIT suggested)
- [ ] Optional: Pages landing refresh
- [ ] Playtest leftovers from M4 final review (bubble occlusion, meter granularity, trackpad tap + double-click)
- [ ] Backlog: project breeding (parked)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

_Updated: 2026-08-23 — main_
