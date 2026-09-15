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

_Updated: 2026-09-15 — robot-v1 worktree; the reconciliation delta is absorbed, nothing flashed yet_

- [x] Requirements + hard rule locked (persona-speaker, creature face, ~1 s, touch ×4, no Chinese-authored code in data path)
- [x] Approach A′ approved: vendored migratorywhale/stackchan-mcp firmware + voice module in skill-village-server (WebRTC VAD, whisper.cpp, OpenAI TTS/Piper); xiaozhi stack dead
- [x] Design Section 1 (architecture) approved
- [x] Sections 3–5 authored + spec WRITTEN: `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` (self-reviewed; v1 latency honest-corrected to ~2.5–4 s)
- [x] Firmware pre-audit (clone in scratchpad): ZERO external hosts in firmware; cloud calls live in discarded Python side; face seam = `gif.openFLASH(ptr,len)` + SPIFFS mounted + 8MB PSRAM (runtime packs feasible); on-device mic endpointing exists; UDP-audio token exists; HTTP API has `/audio/session`+`/play/pcm` chunked push, `/face`, `/snapshot` (strip); source comments Japanese
- [ ] USER: Section 2 verdict (loop + latency) — presented in chat, spec §4–5 carries it
- [ ] USER: review the spec → then writing-plans (fresh branch off main; V1 fully, V2/V3 sketched)
- [x] Full firmware audit DONE → `docs/robot/AUDIT.md` @ upstream `e8258a85`: no backdoors/egress/persistence; verdict SAFE-AFTER-STRIPPING; 10 mandatory fork changes listed (auth everywhere, mic disarmed-by-default, strip /play+camera+SCServo, owner-scope M5GFX, face-buffer handshake, zero buffers)
- [ ] USER: the HAL ceiling call (spec §6 OPEN item) — M5Stack/Espressif HALs are Chinese-authored and irreducible on CoreS3; accept audit+containment, or different hardware (none exists in category)
- [ ] Build tooling install (tomorrow): `pip install platformio` (Python 3.12 + Node 24 present; whisper.cpp prebuilt binaries avoid cmake)
- [ ] User homework pre-arrival (2026-09-01): router per-device internet block; robot Wi-Fi choice
- [ ] Day one: unbox → sanity WITHOUT Wi-Fi on factory firmware → flash → router block → echo test → traffic capture
- [x] Tasks 1–10 executed on `robot-v1` @ `0a16604` (detail in the 2026-08-31 checklist entry on main)
- [x] **Task 10.5 (2026-09-15): reconciliation delta ABSORBED on `robot-v1`** (pushed): the plan gained Task 10.5 with every decision the delta needed; firmware — raw TCP :9090 / UDP :9091 PCM listeners deleted (audit change #11), a red ear mark in the screen margins while the mic is armed (listening ≠ thinking), a 25 s arm timeout, a tap mid-reply refuses the rest of the session (409 interrupted); server — speech guard (300 ms voiced + whisper-ghost filter; tap → "didn't catch that", follow-up window → silent, brain never called), canned rung (cached lines under `<dataDir>/robot-audio/` + a code-made chirp), timeouts on every hop (device 2/5/3/10 s, whisper 20 s, TTS 15 s, brain 15 s + hard cap), six-turn memory via `village.chat(…, { history, timeoutMs })`, persona warmed at move-in. Device-env compile SUCCESS; 1207 tests green; typecheck clean.
- [ ] **A′ vs A″ — the owner's call before flash.** `robot-v1` is A′ as built (vendored fork, line-audited, spec final on main). The 2026-08-31 eng review on `claude/plan-eng-review-0888c7` concluded A″ (fresh ~2k-line firmware over pinned M5Unified) in a parallel session that never saw robot-v1. This session proceeded on A′ because spec, plan, audit and code agree; every server-side change carries over to A″ unchanged if the owner picks it.
- [ ] Deferred to the R6 week (not flash-gating): server-side cancel of an in-flight brain call on tap; a persistent Piper process instead of one per sentence.
- [ ] Known gap: the firmware native test env needs a host g++ (MinGW); the device env is the real gate.
