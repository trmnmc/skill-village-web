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
- [x] Sections 3–5 authored + spec WRITTEN: `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` (self-reviewed; v1 latency honest-corrected to ~2.5–4 s)
- [x] Firmware pre-audit (clone in scratchpad): ZERO external hosts in firmware; cloud calls live in discarded Python side; face seam = `gif.openFLASH(ptr,len)` + SPIFFS mounted + 8MB PSRAM (runtime packs feasible); on-device mic endpointing exists; UDP-audio token exists; HTTP API has `/audio/session`+`/play/pcm` chunked push, `/face`, `/snapshot` (strip); source comments Japanese
- [x] Spec + HAL ceiling APPROVED by user ("approved continue", 2026-08-31); spec status final @ `ba8a5ce`
- [x] Full firmware audit DONE → `docs/robot/AUDIT.md` @ upstream `e8258a85`: no backdoors/egress/persistence; verdict SAFE-AFTER-STRIPPING; 10 mandatory fork changes listed
- [x] Plan written: `docs/superpowers/plans/2026-08-31-robot-v1-he-speaks.md` (12 tasks) @ `35cc6b2`
- [x] **Tasks 1–10 EXECUTED on branch `robot-v1`** (worktree `.claude/worktrees/robot-v1`, pushed to origin @ `0a16604`): baseline green → firmware vendored @ `e8258a85` → PlatformIO installed + baseline compile SUCCESS → strip (−1663 lines: camera, /play URL-fetch, SCServo, dead config; M5GFX pinned owner-scoped @0.2.28 = what baseline actually resolved) → harden (token auth on every route + TCP handshake, mic disarmed-by-default + one-utterance-per-arm, tap-to-talk/tap-to-interrupt, zeroed buffers) → device client + audio/ASR + TTS modules (3 parallel agents) → conversation loop → main.ts wiring (VILLAGE_ROBOT_HOST/TOKEN, VILLAGE_WHISPER_URL, OPENAI_API_KEY, VILLAGE_PIPER_EXE/MODEL). 1168 tests green, typecheck clean, device-env firmware compiles.
- [ ] Known gap: firmware native test env needs host g++ (MinGW) — fails identically pre-strip; device env is the real gate
- [ ] Task 11 [HUMAN]: whisper-server + model download, Piper download, OpenAI key, ASR speed measurement
- [ ] Task 12 [HUMAN, robot in hand 2026-09-01]: unbox → sanity WITHOUT Wi-Fi on factory firmware → config.h (Wi-Fi + generated ROBOT_API_TOKEN) → flash (M5Burner = recovery) → router block → echo test → first conversation → traffic capture → latency baseline → scripted fixtures → SETUP.md
- [ ] User homework pre-arrival: router per-device internet block; robot Wi-Fi choice
- [ ] After V1: merge robot-v1; V2 (creature face packs) + V3 (streaming ~1–1.5 s) plans per spec §10
