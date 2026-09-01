# Session Handoff: Robot A′ redesign mid-flight — no-Chinese-code rule, design Section 2 awaiting verdict
**Date:** 2026-08-31 at 22:28
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main (design-only session; no branch created, no code written)
**Uncommitted changes:** yes (this handoff + CHECKLIST.md robot section)
**Stale if:** `docs/superpowers/specs/` gains a robot design spec dated ≥2026-08-31 (design finished elsewhere — resume THAT) · `docs/robot/SETUP.md` exists (bring-up started) · main moves past `fc94a94` · migratorywhale/stackchan-mcp default branch moves past its 2026-08-06 commit (re-verify firmware facts before the audit)
**Transcript:** (current session, project dir `robot-personality`)

## What Was Accomplished
- **Resumed the 2026-08-25 robot handoff** (all 4 stale-if conditions verified clear at session start). NOTE: mid-session the worktree `.claude/worktrees/m5stackchan-personality-houses-59eeeb` was **deleted by an external actor** (another session's cleanup — main absorbed the robot merge and moved on to `fc94a94`). Nothing was lost: this session wrote no files there.
- **Ran /brain-scout → brainstorming (architectural path)** on "from the village page to the robot's perspective." Requirements locked through one-question-at-a-time: robot = **the voice of whichever project persona is resident** (drag cooking guy in while cooking, brainstorming guy while ideating); the **creature's own pixel face animates on his screen** (core requirement, not stretch); **~1 s to first spoken word** (streaming end-to-end); touch = interrupt/talk-now + petting-as-care + on-device resident swap + face reactions; brain **talks only** in v1 (no tools/memory); plug-and-play — hardware arrives **2026-09-01**.
- **New hard rule established: no Chinese-authored code in the data path.** This kills the approved spec's whole gateway stack: xinnan-tech/xiaozhi-esp32-server, 78/xiaozhi-esp32 firmware, FunASR/SenseVoice ASR, and the factory firmware's AI agent (M5Stack ≈ Espressif-owned). Honest limits stated to user: Espressif silicon/radio blobs are unavoidable on ESP32 — the enforceable control is **containment** (below).
- **Deep GitHub scan (cutoff 2025-08-26)** produced a verified candidate table; user **approved approach A′** with **WebRTC VAD** (Silero rejected as Russian-authored):
  - **Firmware:** vendor `migratorywhale/stackchan-mcp` firmware (MIT, C/C++ PlatformIO, 68★, last commit 2026-08-06) — mic capture/upload, PCM playback, 192×192 AnimatedGIF pixel faces designed for replacement, touch, on-device HTTP server (`docs/http-api.md`). Strip: cloud voice bridge (Groq Whisper/Fish Audio), camera_service, recording_store. Built for DIY CoreS3+PCB, not the kit — servos/LEDs may not map; mic/speaker/screen/touch are CoreS3-native and should carry.
  - **PC:** robot voice module **inside skill-village-server** (port 8262, no Docker): audio → WebRTC VAD → whisper.cpp (local) → existing chat pipeline (`robotResidentId` → `spokenSystemPrompt`, one ledger, one life) → streamed tokens → sentence-chunked OpenAI TTS (Piper local fallback) → PCM + face state back. The OpenAI-compat `/v1` shim becomes unused (retire-or-keep = cleanup decision).
  - **Face-pack generator:** creature DNA → expression pack in firmware face format; requires the one risky firmware patch — **runtime face loading** (stock faces are compiled into `gif_assets.h`).
  - Fallbacks bookmarked: B′ = stack-chan/stack-chan (Apache, Moddable JS faces, no voice pipeline); C′ = streamcoreai/streamcore-server (steal barge-in ideas later); warble = reference code for VAD/whisper wiring. Dropped: kisaragi-mochi/stackchan-mcp (NOASSERTION license).
- **Privacy promoted to design requirements** (user asked "how should I be careful"): factory firmware NEVER gets Wi-Fi credentials (flash ours first); router-level internet block — robot's only destination is PC:8262; traffic-capture verification; mic on-demand with visible "listening" face indicator; no audio persistence anywhere; camera code excluded from build; shared-secret auth on BOTH HTTP ends; test fixtures recorded with scripted phrases only. Text egress unchanged: conversation text → Anthropic, reply text → OpenAI TTS (Piper = zero-egress voice switch).
- **Design presentation is mid-flight:** Section 1 (architecture, 4 pieces) presented and approved (user said "continue" after two security/privacy Q&As). **Section 2 (conversation loop + latency) presented, verdict NOT yet given** — user invoked /handoff instead. Section 2 content: v1 record-then-respond ~2–3.5 s → v1.1 streaming-mic ~1–1.5 s; the long pole is brain first-token → **warm persistent CLI runner** designed in, Anthropic-API config switch as escape hatch; 20 s follow-up window keeps conversation open; tap = instant interrupt; R3′ = openWakeWord hands-free + true barge-in.

## Decisions Made
- **No Chinese-authored code in the data path** — hard rule, user's words: "the chinese nowhere near my data." Enforced by component origin + containment; hardware layer acknowledged as Chinese and contained, not trusted.
- **A′ over B′/C′**: only path where the robot talks this week with the creature-face requirement structurally solved (GIF face system exists).
- **WebRTC VAD** (Google/BSD) over Silero (Russian-authored) — user's explicit pick.
- **Own both ends of the wire** → xiaozhi protocol AND OpenAI-compat shim dialect both deleted from the architecture.
- Creature face = core requirement (user rejected "stock face now, creature later" option). Latency ~1 s = requirement, honestly staged v1→v1.1.
- Talks-only v1; tools/timers/memory deferred. Wake word deferred to R3′ (openWakeWord, PC-side).
- Warm-CLI first for the brain; API key is a user-flippable money decision, not a default.
- v1 mic model = touch-to-talk (most private); hands-free comes with the visible listening indicator.

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/summaries/pause-2026-08-31-robot-aprime-design.md | created | this handoff |
| docs/summaries/CHECKLIST.md | appended robot section | mirror (MERGED, not overwritten — other sessions' M5 checklist is live in it) |

## Git State
```
(main clean at fc94a94 before this handoff; only the two files above touched)
```

## Checklist
<!-- snapshot — resume rebuilds TodoWrite from these boxes -->
- [x] Resume + stale-check of 2026-08-25 handoff (clear at start; worktree later deleted externally)
- [x] Brain-scout brainstorm: requirements locked (persona-speaker, creature face, ~1 s, touch ×4, talks-only, plug-and-play)
- [x] Hard rule locked: no Chinese-authored code in data path; containment plan stated
- [x] Deep scan + verified candidate table; approach A′ + WebRTC VAD approved
- [x] Privacy requirements promoted into the design (mic indicator, no audio persistence, auth, sanitized fixtures, camera excluded)
- [x] Design Section 1 (architecture) presented + approved
- [ ] Design Section 2 (loop + latency) — presented, AWAITING USER VERDICT (in progress)
- [ ] Design Sections 3–5: faces/touch/on-device UI · state/privacy/never-mute/errors · testing + stages + day-one runbook
- [ ] Write spec `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` (supersede §2/§9/§10 of the 2026-08-23 spec) → self-review → user review gate
- [ ] Invoke writing-plans → new implementation plan (replaces old plan's Task 13; execute on a FRESH branch off current main)
- [ ] Audit vendored firmware line-by-line BEFORE any flash (strip cloud bridge, camera_service, recording_store)
- [ ] User homework before the robot arrives (2026-09-01): router per-device internet block; pick robot's Wi-Fi network
- [ ] Day one order: unbox → hardware sanity WITHOUT giving factory firmware Wi-Fi → flash vendored build → router block → echo test → traffic capture
- [ ] Carried, status UNKNOWN after external cleanup: robot-house web playtest verdict (check main's log/other handoffs); SDD workspace `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/` cleanup; LICENSE decision; Pages refresh. Old fixture-replay item is SUPERSEDED by A′ (no xiaozhi gateway).

## Self-Critique
- **Least confident:** (a) vendored firmware runs on the KIT variant — it targets DIY CoreS3+StackChan-PCB; kit body (servos/LEDs/NFC) may be silent; (b) every latency number is an estimate — nothing measured; (c) the runtime-face-loading patch scope is unverified (only know faces are compiled into `gif_assets.h`); (d) warm persistent CLI session with the M4 runner is unproven; (e) whisper.cpp speed on the user's Windows CPU unknown; (f) migratorywhale is pseudonymous — the audit is the only authorship control; (g) Section 1 approval was implicit ("continue").
- **Biggest thing being missed:** hardware lands tomorrow and the only artifacts are this transcript and this handoff — no spec, no code, no firmware audit. Also this session ran in `robot-personality` (not a git repo) while all repo work belongs in skill-village-web; and ANOTHER session deleted this session's worktree mid-flight — the 2026-08-28 handoff's "session hygiene decision" is still unresolved and just bit again.
- **If it breaks in 3 months:** the vendored fork drifts from upstream stackchan-mcp (their troubleshooting docs show live audio churn); OpenAI TTS API/pricing changes; unmanaged whisper model files.
- **Did NOT do:** design sections 3–5, spec, plan; never read the actual firmware `.cpp` code (file listing + README only); never fetched `docs/http-api.md`; didn't check the user's router capability; didn't confirm whether the robot playtest verdict happened in another session.
- **How to check:** (a) audit = read `firmware/src/*.cpp` + `docs/http-api.md` in the fork; (b) time whisper.cpp on a sample WAV on this PC; (c) inspect `gif_assets.h` generation + `face_service.cpp` for a loader seam; (d) prototype a persistent `claude` session against the M4 runner; (e) `git -C skill-village-web log --all --oneline -- docs/robot/` and recent `pause-*.md` for playtest/bring-up traces; (f) `gh api repos/migratorywhale/stackchan-mcp/commits --jq '.[0].commit.committer.date'`.

## Remaining Work
1. **Get the Section 2 verdict** (loop + latency), then present Sections 3–5 (faces/touch/on-device UI; state/privacy/never-mute/error handling; testing + stages + day-one runbook).
2. **Write the A′ spec** to `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md`, marking exactly which sections of `2026-08-23-robot-embodiment-design.md` it supersedes (§2 architecture, §9 latency, §10 stages; privacy §3 is STRENGTHENED not replaced). Self-review, commit, user review gate.
3. **writing-plans** → implementation plan on a fresh branch off current main. Plan must front-load: firmware audit, fork+strip, flash path (M5Burner recovery), voice module skeleton, face-pack generator, runtime-face patch.
4. **Day-one runbook with the user present** (robot arrives 2026-09-01) — order in the Checklist. Task is human-in-the-loop; never dispatch to a lone subagent.

## Open Questions
- Section 2 verdict (and any latency-target adjustment after v1 numbers are real).
- Does the user's router support per-device internet blocking? (Determines containment mechanics.)
- Firmware fork location: vendor into skill-village-web (e.g. `firmware/` or `packages/robot-firmware/`) vs separate repo?
- Retire the now-unused `/v1` OpenAI-compat shim or keep as dormant compat layer?
- Carried: LICENSE (MIT vs all-rights-reserved); session-hygiene decision from 2026-08-28 handoff (one session vs isolated worktrees) — it deleted this session's worktree today.

## Coordinate Closet
<!-- Verbatim ids/paths from this session, newest-first, deduped. -->
- `fc94a94` (main + origin/main tip) · worktree `m5stackchan-personality-houses-59eeeb` DELETED externally mid-session · session start refs: `1cddcc7` (then-origin/main) · `842ca08` (robot merge) · `79bca20` (old branch head, gone)
- A′ firmware: `migratorywhale/stackchan-mcp` — firmware/src: `gif_assets.h` (compiled-in faces) · `http_server.cpp` · `pcm_stream_service.cpp` · `pcm_upload.cpp` · `audio_download.cpp` · `mic_service.cpp` · `playback_service.cpp` · `recording_store.cpp` (strip) · `camera_service.cpp` (strip) · `config_loader.h` · `docs/http-api.md` · faces 192×192 AnimatedGIF · languages C 935k/Py 230k/C++ 173k · last commit `2026-08-06T18:14:35Z`
- Other candidates: `stack-chan/stack-chan` (B′, Apache, web flasher) · `streamcoreai/streamcore-server` + `streamcoreai/esp32` (C′) · `rebelthor/warble` (reference) · `kisaragi-mochi/stackchan-mcp` (dropped, NOASSERTION) · excluded Chinese-authored: `78/xiaozhi-esp32` · `xinnan-tech/xiaozhi-esp32-server` · FunASR/SenseVoice · `78/xiaozhi-assets-generator`
- Components chosen: WebRTC VAD (Google/BSD) · whisper.cpp · OpenAI TTS (primary voice) · Piper (local fallback) · openWakeWord (R3′) · warm claude CLI runner (API-key config switch = escape hatch)
- Latency budget: v1 ~2–3.5 s · v1.1 ~1–1.5 s · follow-up window 20 s · brain first-token = long pole
- Repo anchors: port `8262` (`DEFAULT_PORT`) · vite `5173` · `VILLAGE_HOST` · `STATE_VERSION = 4` · `robotResidentId` · `spokenSystemPrompt` · spec `docs/superpowers/specs/2026-08-23-robot-embodiment-design.md` · plan `docs/superpowers/plans/2026-08-23-r1-r2-robot-embodiment.md` · SDD `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/`
- brain-scout cutoff `2025-08-26` · gh account `trmnmc` · old preview `843e6932-24fb-418e-8ad9-d19e22a49275` port `65347` (worktree deleted — presumed dead)
- Session project dir: `C:\Users\truman\OneDrive\Documents\Claude-Projects\robot-personality` (contains only `.claude`; memory dir lives under its project path)
- Robot hardware: M5StackChan AI kit — CoreS3, ESP32-S3, 320×240 touch IPS, dual mics, 1 W speaker, 2 servos, 12 RGB LEDs, NFC, IR, 0.3 MP camera (never compiled in), 550 mAh

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
its robot section. Then summarize the above for the user and run `git status` /
`git branch --show-current` (in the MAIN repo — the old worktree is gone) to
confirm state matches this handoff (warn on any mismatch — different branch,
unexpected changes). **Evaluate each "Stale if" condition in the header**: if any
holds, say which, treat the claims it covers as stale, and re-verify them against
the live artifact before acting on them. Present the rebuilt checklist +
Remaining Work and ask whether to continue or do something else. The immediate
next beat is the **Section 2 design verdict** — re-present Section 2 briefly if
the user doesn't remember it. Day-one hardware work is human-in-the-loop — never
dispatch it to a lone subagent; the user must be at the desk.
