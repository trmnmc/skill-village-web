# Checklist

_Updated: 2026-08-31 — main_

- [x] Isolation wiring committed + pushed (`a9c4e69`)
- [x] M5 visual verdict given (2026-08-30/31)
- [x] Thread A: aura + cross-row stacking fixed, measured 37→1 (`a1b5bd3`)
- [x] Thread B: presence follows the work signal in three bands (`b571d88`)
- [x] Thread C: clouds billow as one body (`1046ccc`)
- [ ] **User re-judges the three fixes** — http://localhost:5175 (storm: gear → night → Pick → storm) — plus still-unjudged: porch-alone read, all-instances-speak, HUD chip
- [ ] **Session hygiene, remaining half**: state-version handshake/lock so an older server can never wipe a newer save; decide which save is canonical (`~/.skill-village` vs the isolated dir)
- [ ] **Move `village-data-isolated/` somewhere durable** — it lives in a TEMP scratchpad the OS can clean
- [ ] Branch salvage: `C:\Users\truman\Projects\skill-village-web` still holds 24 sole-copy branches
- [ ] Droplet: still pre-M5 (deploy M5 + reseed decision — reseed publishes real folder paths, wipes visitor state); voice login decision; LICENSE; M6 plan
- [ ] Housekeeping (carried): droplet reboot pending, memory tight; 8 merged remote branches deletable; Chunks server restart

## Robot A″ (was A′) — eng review passed, all decisions locked (see docs/superpowers/reviews/2026-08-31-robot-aprime-eng-review.md)

_Updated: 2026-08-31 — /plan-eng-review session; A′ → A″: fresh firmware, no vendoring_

- [x] Requirements + hard rule locked (persona-speaker, creature face, ~1 s, touch ×4)
- [x] Rule redrawn as three tiers (D6.2): our code + M5Unified data-path drivers read line-by-line (~6k lines); Espressif layer contained (router blocks ALL egress incl. DNS except PC:8262)
- [x] Section 2 verdict IN (D5): v1 = proven one-shot runner, first word 3.5–5 s; warm runner + streaming mic + chunker + VAD = v1.1
- [x] Firmware strategy (D7): write ~1–2k lines fresh over pinned M5Unified; stackchan-mcp fork = read-only reference, never vendored, never run; faces-from-file designed in
- [x] Outside-voice adoptions (D8, all 7): v1 memory in prompt · whole-reply TTS · tap+silence endpoint · voice endpoints env-gated OFF (droplet safety) · secret on every mutating LAN route · hardware track starts pre-arrival · 10 s brain timeout + models outside OneDrive tree
- [x] Eng review: 4 sections + outside voice, 30 findings, 0 critical gaps, 0 unresolved
- [ ] Sections 3–5 design → spec `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` (supersede §2/§9/§10; carry the review doc's diagram + requirements 1–15 + test bill) → writing-plans (fresh branch off main)
- [ ] Track H pre-arrival TODAY: PlatformIO toolchain + fresh-firmware smoke build (T1); three-tier audit (T2)
- [ ] User homework pre-arrival: router ALL-egress block incl. DNS; AP-isolation check; 2.4 GHz network; Windows inbound 8262 rule (T3)
- [ ] Day one re-ordered: unbox → factory sanity WITHOUT Wi-Fi → flash OUR smoke build → router verify → echo test → traffic capture (T11)
