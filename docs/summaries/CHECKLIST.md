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

## Robot A′ redesign (see pause-2026-08-31-robot-aprime-design.md)

_Updated: 2026-08-31 — design session, no branch_

- [x] Requirements + hard rule locked (persona-speaker, creature face, ~1 s, touch ×4, no Chinese-authored code in data path)
- [x] Approach A′ approved: vendored migratorywhale/stackchan-mcp firmware + voice module in skill-village-server (WebRTC VAD, whisper.cpp, OpenAI TTS/Piper); xiaozhi stack dead
- [x] Design Section 1 (architecture) approved
- [ ] Section 2 (loop + latency) — presented, awaiting verdict (in progress)
- [ ] Sections 3–5 → spec `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` → writing-plans (fresh branch off main)
- [ ] Firmware audit before any flash (strip cloud bridge, camera, recording_store)
- [ ] User homework pre-arrival (2026-09-01): router per-device internet block; robot Wi-Fi choice
- [ ] Day one: unbox → sanity WITHOUT Wi-Fi on factory firmware → flash → router block → echo test → traffic capture
