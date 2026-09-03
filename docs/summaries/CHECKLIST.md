# Checklist

_Updated: 2026-09-02 — claude/plan-ceo-review-5a272a (merged, not overwritten: the village, robot and foundation sections are all live; see pause-2026-09-02-foundation-sprint-review.md)_

- [x] Isolation wiring committed + pushed (`a9c4e69`)
- [x] M5 visual verdict given (2026-08-30/31)
- [x] Thread A: aura + cross-row stacking fixed, measured 37→1 (`a1b5bd3`)
- [x] Thread B: presence follows the work signal in three bands (`b571d88`)
- [x] Thread C: clouds billow as one body (`1046ccc`)
- [ ] **User re-judges the three fixes** — after the saves merge (foundation T9) the dev server runs on the canonical world; storm: gear → night → Pick → storm; plus still-unjudged: porch-alone read, all-instances-speak, HUD chip
- [ ] **Session hygiene, remaining half** → foundation sprint T1 (refuse-to-boot on a newer save, hash-named snapshots) + T9 (saves MERGED into `~/.skill-village`, decided 2026-09-02: neither save is a superset — isolated has 98 creatures/6 pins/fresh playtest, shared has 96/26 pins/621 events)
- [ ] **Move `village-data-isolated/` somewhere durable** → foundation T9 retires the TEMP dir after the merge (originals archived by hash first)
- [x] Branch salvage, first half (2026-09-01): the 5 sole-copy branches with content pushed to origin — `m4-5-peddler` (a FINISHED 19-commit M4.5 Peddler feature, never merged; its gallery slice collides with main's STATE_VERSION 5 → lands as v6 in the plan after this sprint), `claude/art-direction-minigame-c0e07b`, `claude/m5-continuation-626bed`, `claude/spectator-on-main-seating`, `claude/skills-projects-agents-mechanics-36973e`
- [ ] Branch salvage, second half → foundation T11: land the four doc-only branches' docs on main, delete them + the two merged remotes (`claude/creature-drag-visual-5168e5`, `claude/skill-village-monetization-1ca575`)
- [ ] Droplet: still pre-M5 (75 creatures, STATE_VERSION 4 build) → foundation T6 + T10: `deploy:village` (code before seed, seed scrubbed of all paths, receipts, `--rollback`); voice login decision (open); LICENSE = MIT (decided 2026-09-02, T8); M6 plan → after the Peddler landing, via /office-hours
- [ ] Housekeeping (carried): droplet reboot pending, memory tight → TODOS.md "Droplet operations" (after the first scripted deploy reports numbers); Chunks server restart

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
- [ ] NOTE (2026-09-01 CEO review, first pass, before the user redirected to non-robot work): the eng review on branch `claude/plan-eng-review-0888c7` concluded A″ (fresh firmware) at 23:17 while robot-v1 was being built (23:14–23:20); neither session saw the other. The reconciliation delta R1–R10 is UNCOMMITTED in the robot-v1 worktree. Code-verified gaps on robot-v1 before any flash: tap-interrupt skips one sentence, not the reply; listening face == thinking face; no request timeouts anywhere; no no-speech guard; no conversation memory; no never-mute bottom rung; 90 s CLI timeout + inline persona generation on first turn. Resolve in the robot sessions.

## Foundation sprint (non-robot week) — see docs/superpowers/plans/2026-09-02-foundation-sprint.md

_Updated: 2026-09-02 — /plan-ceo-review, SCOPE EXPANSION, 30 findings all decided; CEO decision record at `~/.gstack/projects/trmnmc-skill-village-web/ceo-plans/2026-09-02-foundation-sprint-interactive.md`_

- [x] Week shape decided: foundation sprint → land the Peddler (v6) → /office-hours for M6; robot track continues in parallel sessions
- [x] Five sole-copy branches pushed to origin; gstack upgraded 1.69.0.0 → 1.78.0.0
- [x] Saves compared (isolated 98 / shared 96; shared ⊂ isolated for creatures; 26 vs 6 pins; 30 diverged care stats) → MERGE decided
- [x] Reseed decided: droplet code first, then a seed with every path scrubbed; LICENSE = MIT (Truman Fenley)
- [x] Expansions accepted: E1 migration safety · E2 village-save tool · E3 one-command deploy (code-only default, `--seed` opt-in; re-priced to CC ~4 h) · E4 world badge · E5 scratch-workspace filter · E6 branch ledger; E7 droplet ops deferred to TODOS.md
- [x] Outside voice (18 findings) adjudicated: project ids leak the home path → scrub rewrites them; sudo needs a tty → scp'd script + `ssh -t`; data-dir lock for server and CLI; "land the Peddler first" declined
- [x] T0 done in the review session: both saves archived read-only under `~/.skill-village/archive/snapshots/pre-sprint-2026-09-02/` (hashes verified); `main` pushed (was 1 ahead of origin)
- [ ] T1–T8 code + docs (see plan) on a fresh branch off main; 1168 tests must stay green
- [ ] T9 [HUMAN-assisted] merge + prune the saves into `~/.skill-village`, retire the TEMP dir, dev server up for the re-judge
- [ ] T10 [HUMAN] first `deploy:village`: `--dry-run`, then `--yes`; post-deploy checklist
- [ ] T11 branch ledger; T12 close-out (this file, TODOS.md)
- [ ] Next plan: Peddler landing (rebase 19 commits, gallery → STATE_VERSION 6, rehearse the migration per the runbook, re-read the spec against projects-as-villagers)
