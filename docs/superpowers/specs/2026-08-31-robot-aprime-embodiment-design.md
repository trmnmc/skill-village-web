# Robot Embodiment A′ — Design (supersedes the R-track gateway architecture)

**Date:** 2026-08-31
**Status:** approved by user 2026-08-31 ("approved continue" — covers Sections 1–5, the corrected v1 latency estimate, and the HAL ceiling acceptance in §6)
**Supersedes:** `2026-08-23-robot-embodiment-design.md` §2 (architecture), §9 (latency), §10 (stages). **Strengthens** §3 (privacy). §1 (concept), §4 (robot-house), §5's resident semantics, §7 (state) and the merged R1/R2 web code all stand.
**Why superseded:** two new requirements from the 2026-08-31 brainstorm — (a) **no Chinese-authored code in the data path** (hard rule), which eliminates the xiaozhi firmware, the xiaozhi-esp32-server gateway, and FunASR/SenseVoice; (b) the creature's own pixel face animating on the robot's screen is **core**, not R3-stretch. Latency moves from "accepted 3–5 s" to a **~1 s first-word target**, staged.

## 1. Requirements (locked with user, 2026-08-31)

- The robot is **the voice of the resident project persona**: drag the cooking guy in while cooking, the brainstorming guy while ideating. Kind-agnostic, one resident, unchanged from the old spec.
- The **resident creature's pixel face animates on his screen** while he talks. Core requirement.
- **~1 s from end of speech to first spoken word** — target, staged honestly (see §5).
- Touch: tap = interrupt / talk-now; petting = care (bond/mood, one life); on-device resident swap menu (staged); face reactions.
- Brain **talks only** in v1: no tools, no timers, no memory beyond conversation history.
- Plug-and-play bias; hardware (M5StackChan AI kit, CoreS3) arrives 2026-09-01.
- **Hard rule: no Chinese-authored code in the data path.** Chinese-made silicon (Espressif/M5Stack) is acknowledged and **contained**, never trusted (§6).
- Standing invariants kept: voice audio never leaves the PC; text egress only to Anthropic (conversation) and OpenAI TTS (reply text); never-mute; one budget ledger; one life; never write `~/.claude`.

## 2. Architecture — own both ends of the wire

Four pieces. No Docker, no third-party gateway, no xiaozhi protocol, no OpenAI-compat dialect.

1. **Firmware (vendored fork)** of `migratorywhale/stackchan-mcp`'s `firmware/` (MIT, C/C++, PlatformIO). Verified by source read (2026-08-31, clone at scratchpad): **zero hardcoded external hosts** — it is a pure LAN device exposing an HTTP API (`docs/http-api.md`) plus raw TCP/UDP PCM listeners for low-latency playback; on-device mic endpointing (RMS trigger, silence-hold, pre-trigger ring, 16 kHz); AnimatedGIF face renderer; a UDP-audio **token** mechanism already present. We build it with: camera code **excluded**, notification polling off, our config. Their Python MCP server (where the Groq/Fish cloud calls live) is discarded entirely.
2. **Robot voice module (new, ours)** inside `packages/server` — same process as the village, port 8262, LAN-bound via existing `VILLAGE_HOST`. Owns the conversation loop (§4) and the device session (auth token, heartbeat → presence).
3. **Face-pack generator (new, ours)** — creature DNA → expression GIF set, delivered to the device at move-in (§3).
4. **The village web page (shipped)** — robot-house, drag/swap/evict unchanged; presence now truthful: dark = no device, lit = heartbeat OK, talking = turn in flight. The `/v1` OpenAI-compat shim becomes unused (kept dormant or retired — cleanup decision, not architecture).

## 3. Faces, touch, and the on-device experience

- **Expression set per creature** (fixed vocabulary, generated from DNA): `idle`, `listening`, `thinking`, `talking`, `happy`, `sleepy`, `reaction` (pet). Server-side generator reuses the village's creature pixel-art rendering to emit 192×192 GIF frames (the firmware's native face format, centered on 320×240).
- **Runtime face packs — the one real firmware patch.** Stock faces are compiled into `gif_assets.h`, but the renderer draws via `gif.openFLASH(pointer, len)` from any memory buffer (verified in `face_service.cpp`); SPIFFS is already mounted and CoreS3 has 8 MB PSRAM. Patch: a face-pack upload endpoint + loader that swaps the active GIF table at move-in. Fallback: compiled-in default face if no pack is loaded — the robot always has a face.
- **Face state machine (server-driven, device-rendered):** `listening` whenever the mic is open (this is the privacy indicator — non-negotiable), `thinking` while ASR/brain run, `talking` during playback, `idle` otherwise; `sleepy` follows village night; `reaction` fires locally on touch for instant feedback, then reconciles with the server.
- **Touch:** tap during playback = interrupt (device stops audio locally at once, notifies server, server cancels in-flight brain/TTS); tap when idle = talk-now (open mic without wake ceremony); pet gesture (repeated taps/swipe) = care event → existing bond/mood, plus `reaction` face. **On-device resident swap menu is staged to V2** (long-press → roster list served at connect); until then swapping stays on the web page.
- Servos/LEDs: the fork targets the DIY StackChan PCB; the kit's body may not respond. Treated as garnish — nod/shake wired **only if** the kit body answers the existing `/move` endpoints during bring-up; never a blocker.

## 4. The conversation loop

**v1 (bring-up):** tap (or talk-now) → `listening` face → device records with its on-device endpointing (silence-hold closes the turn) → PC pulls the PCM → **WebRTC VAD** trims → **whisper.cpp** (local) transcribes → transcript enters the existing chat pipeline as the resident (`spokenSystemPrompt`, history, ledger, one life) via the existing slim CLI call → reply → sentence-split → **OpenAI TTS** per sentence (**Piper** local fallback) → PCM chunks pushed via the device's `/audio/session` + `/play/pcm` (or TCP stream) → `talking` face, audio plays while later sentences synthesize.
**Conversational wiring:** a follow-up window (~20 s, config) after he finishes keeps the conversation open — mic re-opens (face shows it), no re-tap mid-recipe. Silence closes the session.
**Brain:** the existing `runCli` slim call (measured ~2.5 s total). v1 ships with it unchanged.

## 5. Latency — target ~1 s first word, staged

| Hop | v1 | v3 target |
|---|---|---|
| End-of-speech close | ~0.5 s (device silence-hold) | ~0.3 s |
| ASR (whisper.cpp, short utterance) | ~0.3–0.8 s | ~0.2–0.5 s (rolling) |
| Brain first sentence | ~1.5–2.5 s (one-shot CLI) | ~0.5–1.2 s (see below) |
| TTS first chunk | ~0.3–0.5 s | ~0.2–0.4 s |
| **Total to first word** | **~2.5–4 s** | **~1–1.5 s** |

Levers, in order: (1) `--output-format stream-json --include-partial-messages` — stream tokens out of the same slim CLI call and TTS sentence one immediately; (2) **spawn-ahead warm runner** — pre-spawn the next CLI process while the robot is still speaking, so process startup (the front-loaded cost of the 2.5 s) is off the clock; (3) short spoken replies (already designed in); (4) escape hatch: an Anthropic API key config switch — fastest first token, pay-per-token, **user-flippable, never default**. The voice module logs per-hop timings from day one; targets are re-judged against measurements, not estimates.
**Deliberately later (V3):** hands-free wake via **openWakeWord** (Apache, PC-side, on the streamed audio, listening face always shown) and barge-in-by-voice.

## 6. Privacy and containment (hard requirements)

- **Factory firmware never gets Wi-Fi credentials.** Unbox → hardware sanity offline → flash ours → only then network.
- **Router-level internet block:** the robot's only permitted destination is the PC on 8262 (+ the PCM ports). Verified by traffic capture at bring-up; the firewall rule keeps it true. If the router can't do per-device blocking, solve before first conversation (dedicated AP / PC hotspot).
- **Shared-secret auth on both ends:** the device's HTTP/PCM surfaces and the PC's robot endpoints reject unauthenticated callers (the firmware's existing token mechanism, extended). No open mic on the LAN.
- **Mic state is always visible** on the face. **No audio persists anywhere** (device recording path is RAM-only — re-verify in audit; PC transcribes in memory and drops the PCM).
- **Camera code excluded from the build** (`camera_service`, `/snapshot`). Windows Firewall: inbound 8262/PCM ports from the robot's IP, private profile only.
- **Test fixtures use scripted phrases only** — never real conversations. OpenAI key lives in local config, never the repo.
- Component origins on record: whisper.cpp (MIT), WebRTC VAD (Google/BSD), Piper (MIT/US), openWakeWord (Apache/US), OpenAI TTS (US, reply text only), Anthropic (US, conversation text), vendored firmware (MIT, mixed Japanese/Chinese-commented source, **line-audited before first flash** — see `docs/robot/AUDIT.md`).
- **Accepted ceiling (user decision, 2026-08-31):** the CoreS3's mic/speaker/display HALs and Wi-Fi stack are Chinese-authored open source (M5Stack/Espressif) — irreducible on this hardware, like the silicon itself. They are pinned, widely vetted, audited to initiate zero egress, and containment-locked regardless. The no-Chinese-code rule binds the application layer and egress (both fully hold); the HAL layer is covered by audit + containment, per the user's acceptance.

## 7. Never-mute and error handling

Every completed turn ends in sound, in character: brain failure or budget exhaustion → canned line from the resident's pool (existing M4 machinery); OpenAI TTS failure → Piper; Piper failure → **pre-rendered canned WAV cache** (rendered per creature at move-in); ASR failure / silence → in-character "didn't catch that" canned line. Interrupt cancels in-flight brain and TTS work (kill child / abort). Device unreachable → house goes dark; resident state persists; he wakes as them on reconnect. Empty house → the fixed `EMPTY_HOUSE_LINE` as speech.

## 8. State

Reuses the shipped robot block (`robotResidentId`, `robotLastTurnAt`, `STATE_VERSION 4` migration). New persisted fields (one version bump, chained migration, M4 pattern): device shared secret; face-pack cache metadata. Timing log is ephemeral.

## 9. Testing

- **CI spends no tokens, needs no robot:** voice-module units against the existing fake-CLI machinery; device-protocol tests replay recorded fixtures (scripted phrases); face-pack generator has golden-image tests (DNA → deterministic frames); VAD/ASR/TTS behind interfaces with fakes.
- **Hardware-in-the-loop is manual:** per-stage playtest checklist; the user's ears are the gate. Latency is measured by the module's own per-hop stopwatch and logged — baselines recorded at each stage exit.
- **Firmware audit is a test:** the line-by-line read (started 2026-08-31: no external hosts; cloud lives in the discarded Python side) completes before first flash; its notes land in `docs/robot/AUDIT.md`.

## 10. Stages

- **V1 — he speaks (bring-up).** Audit complete → stripped build (no camera, no notification poll, our config + token) → flash (M5Burner factory-restore is the recovery path) → voice module v0 (pull-recording loop, whisper.cpp, existing CLI call, sentence TTS, PCM push) → stock whale face → tap-interrupt → containment verified (router block + traffic capture). Exit: a conversation with the resident's personality; latency baseline logged.
- **V2 — he is them.** Face-pack generator + runtime loader patch + move-in delivery; talking/listening/thinking states; petting → care; canned-audio cache; presence wiring; on-device resident menu. Exit: drag a creature in and his face, voice-persona, and reactions are theirs.
- **V3 — he keeps up.** stream-json brain + spawn-ahead warm runner + streaming mic; measured against the 1–1.5 s target; openWakeWord hands-free; barge-in-by-voice. Exit: measured first-word latency ≤1.5 s median; hands-free works from across the kitchen.

## 11. Out of scope (deliberately)

Tools/timers/lookups/music control (its own future track); per-creature TTS voices (returns after V3 on real TTS facts); mood→face beyond the fixed expression set; multiple robots; camera/vision (excluded from build); away-from-home access; NFC/IR.

## 12. Risks

- **Kit-variant unknowns:** fork targets DIY CoreS3+PCB; kit mic/speaker/touch are CoreS3-native (expected fine), body extras may be silent. Mitigation: garnish-not-blocker rule (§3).
- **Runtime face patch** is new firmware code. Mitigation: seam verified in source; compiled-in fallback face; V2 not V1.
- **Latency targets are estimates** until the stopwatch runs. Mitigation: per-hop logging from day one; API-key escape hatch exists.
- **whisper.cpp speed on this PC unknown.** Mitigation: model size is a dial (base→small); measure day one.
- **Upstream drift** of the vendored fork. Mitigation: it's a vendored snapshot; we own it; upstream is reference only.
- **Warm-runner + stream-json contract** with the installed CLI version needs probing (the M4 pattern: probe, pin, re-verify).
