# Robot A″ — Engineering Review (locks the plan for the spec)

**Date:** 2026-08-31 (evening; hardware arrives 2026-09-01)
**Reviewed:** the A′ redesign (pause-2026-08-31-robot-aprime-design.md) against the
2026-08-23 spec, the merged robot code (old plan Tasks 1–12), and the live repo.
**Review ran:** /plan-eng-review — Step 0 scope challenge, 4 sections, outside-voice
challenge (Claude subagent, fresh context), all decisions resolved with the user.
**Supersedes:** the A′ firmware strategy. The architecture below is **A″**: A′ with
fresh firmware instead of vendoring, plus the decisions in the table.
**Consumed by:** the spec-writing session → `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md`
(supersede §2/§9/§10 of the 2026-08-23 spec; §3 privacy strengthened), then writing-plans.

## Decisions (all resolved 2026-08-31, user-confirmed)

| # | Decision | Verdict |
|---|----------|---------|
| D4 | Scope trims | Both taken (shim retirement stands; vendor trim superseded by D7) |
| D5 | **Section 2 verdict** (was pending) | v1 brain = existing one-shot CLI runner (proven, ~2.5 s). Warm persistent runner + streaming mic land together as v1.1. First word ~3.5–5 s accepted for week one. Rest of Section 2 approved as designed: record-then-respond, 20 s follow-up window, tap = interrupt. |
| D6.2 | **No-Chinese-code rule, redrawn (three tiers)** | Tier 1: our app code — read every line. Tier 2: M5Unified/M5GFX data-path drivers (Mic/Speaker/Touch ≈ 4k lines, verified: no socket code, one "WiFi" mention to check) — pinned by exact hash AND read line-by-line. Tier 3: Espressif platform/blobs/silicon — contained, not trusted: router blocks ALL egress incl. DNS except PC:8262; traffic capture proves it. |
| D7 | **Firmware: write fresh** | ~1–2k lines of our own C++ over M5Unified, targeting the actual kit. migratorywhale/stackchan-mcp stays a read-only REFERENCE (repo + commit `2026-08-06` era, master @ 2026-08-30 is CI-only drift) — never vendored, never run. Kills: 1.1M-line audit, strip risk, runtime-face patch to foreign code. Faces-from-file designed in from the start (AnimatedGIF lib supports it natively). |
| D8 | Outside-voice adoptions (all 7) | (1) v1 conversation memory: rolling recent turns ride in the prompt. (2) v1 plays the whole TTS reply; sentence-chunker deferred to v1.1. (3) v1 listening = tap-to-talk + RMS silence timeout; WebRTC VAD deferred to v1.1 open-mic (native-addon pain avoided). (4) Voice endpoints OFF unless configured (env gate) — the public droplet never grows a mic API; /v1 rate-limit hook + nginx cleanup on shim removal. (5) LAN threat model: shared secret on EVERY mutating route when LAN-bound (incl. `PUT /api/robot/resident`, `/api/creatures/:id/chat`); secret + Wi-Fi provisioning via gitignored build-time config. (6) Hardware bring-up is its own track, starting pre-arrival. (7) Voice module sets its own ~10 s brain timeout (cli.ts default is 90 s); model files live OUTSIDE the OneDrive-synced tree. |

## A″ architecture (spec §2 replacement diagram)

```
 M5StackChan kit (CoreS3)                    PC — skill-village-server :8262
┌──────────────────────────────┐            ┌──────────────────────────────────────────┐
│ OUR firmware (~1–2k lines)    │  Wi-Fi LAN │ voice module (new, env-gated OFF by      │
│  over M5Unified (pinned)      │            │ default; never on in the droplet deploy) │
│  mic ──→ PCM upload ──────────┼────────────┼─→ secret check → RAM buffer (hard cap)   │
│  speaker ←─ whole-reply PCM ←─┼────────────┼── TTS: OpenAI (text out) / Piper local   │
│  screen ←─ face state ←───────┼────────────┼── face events                            │
│  touch: tap=talk / interrupt ─┼────────────┼─→ endpoint: RMS silence timeout          │
│  LittleFS: face packs (files) │            │ whisper.cpp child (base model)           │
│  heartbeat ──────────────────┼────────────┼─→ presence for the robot-house           │
└──────────────────────────────┘            │ → text + rolling history → M4 pipeline   │
  router: ALL egress blocked                │   robotResidentId → spokenSystemPrompt   │
  (incl. DNS) except PC:8262                │   → one-shot claude runner (10 s cap)    │
                                            └──────────────────────────────────────────┘
                                              Leaves the PC as TEXT only: Anthropic
                                              (chat), api.openai.com (TTS). Audio never.
```

Latency, one number: **v1 first word 3.5–5 s** (measure whisper on this PC before
arrival). v1.1 (warm runner + streaming mic + chunked TTS + real VAD): target 1–1.5 s.

## Findings disposition (30 distinct: 19 in-review + outside voice)

**Resolved by decisions above:** v1 brain (D5) · rule line + audit boundary (D6.2) ·
vendor-vs-fresh, strip risk, runtime-face patch (D7) · memory, chunker, VAD, deploy
gate, LAN auth, track split, timeout, model storage (D8).

**Standing requirements for the spec (my recommendation applied — veto anytime):**
1. Auth covers every socket. We define the wire protocol: authed HTTP/TCP only; no
   unauthenticated UDP audio path exists because we never build one.
2. Presence source = robot heartbeat seen by the voice module (gateway is dead).
3. Face-pack contract in spec §3: pack format, transfer over the authed channel to
   LittleFS, numeric flash budget, swap semantics, and a compiled-in neutral-face
   fallback so the generator is never a launch blocker.
4. Never-mute failure matrix in spec §4 (table below).
5. Firmware distribution: pinned PlatformIO env, reproducible build doc, flash +
   M5Burner factory-recovery doc (bold), model download script pinned by hash.
6. Firmware lives in-repo at `firmware/`; `firmware/UPSTREAM-REFERENCE.md` records the
   reference fork repo + commit hash. Their code is consulted, never copied blind;
   any copied idea is noted in the file.
7. One mood→expression table in packages/core; web scene and face-pack generator both
   read it. Two tables would drift.
8. Voice module shape: `packages/server/src/voice/` — pure logic in files
   (`asr.ts`, `tts.ts`, `endpoint.ts`), wiring in api/app.ts (repo idiom).
9. One config module, `VILLAGE_*`/`SKILL_VILLAGE_*` naming, for: voice gate, secret,
   whisper model path, silence-timeout ms, TTS provider.
10. Audio wire contract pinned in the spec: 16 kHz mono 16-bit PCM; the firmware
    resamples/downmixes (dual mics → mono) so the server stays dumb.
11. whisper + Piper run as child processes; the node event loop never blocks (shares
    a server with the village web app).
12. Audio in RAM only, hard cap (~30 s ≈ 1 MB @16 kHz mono 16-bit); overlong rejected.
    Doubles as the no-audio-persistence privacy rule.
13. Windows plumbing in the runbook: inbound firewall 8262 (private profile), Wi-Fi
    AP/client-isolation check, 2.4 GHz-only network for the robot.
14. Old spec §2 diagram is stale → superseded by the diagram above; the voice module
    service file carries an inline pipeline diagram comment.
15. Re-verify every handoff coordinate at plan-writing time (STATE_VERSION already
    drifted 4→5).

## Test bill (26 paths — write each test WITH the code, not after)

```
CODE PATHS (planned)                                USER FLOWS
[+] voice/endpoint.ts (tap + RMS silence)           [+] Talk to the robot
  ├── end-of-speech on silence                        ├── [→E2E] speak → reply heard (fake-robot script)
  ├── never-silent timeout cap                        ├── tap mid-reply → speech stops fast
  └── empty / too-short audio                         ├── follow-up in 20 s window carries history (D8.1)
[+] voice/asr.ts (whisper child)                      └── speak after window closes → fresh turn
  ├── clean transcript
  ├── garbage / empty transcript                    [+] Resident changes
  ├── binary missing → canned fallback                ├── swap mid-conversation → next reply is new creature
  └── timeout kill                                    └── empty house → fixed "nobody lives here" line
[+] voice/tts.ts
  ├── OpenAI happy path (mock HTTP)                 [+] Failure states (never-mute)
  ├── dead key → Piper fallback                       ├── claude fails/10 s cap → canned line, in character
  └── Piper missing → face + chat-panel text only     ├── both voices dead → face still reacts
[+] api/app.ts voice routes                           └── server down → robot's offline face (firmware)
  ├── env gate OFF by default (deploy safety)
  ├── auth · size cap · concurrent-talk lockout     [+] Security
  └── heartbeat → presence states                     ├── wrong secret → 401 on every mutating route
[+] core mood→expression table                        └── oversized upload rejected
  └── every mood maps to a pack slot
[+] face-pack generator                             [+] Firmware
  ├── DNA → deterministic pack (golden files)         └── [→CI] PlatformIO compile job (non-blocking)
  └── pack size ≤ flash budget
DELETED with the shim: openai.test.ts, fixtures.test.ts — replaced by the fake-robot E2E
FAKES: fake-whisper + fake-piper binaries injected like SKILL_VILLAGE_CLAUDE
Hardware-in-the-loop stays manual playtest — the user's ears/eyes are the gate.
```

## Failure modes (new codepaths; critical gaps: 0)

| Failure | Handled by | Test | User sees |
|---------|-----------|------|-----------|
| whisper garbage/empty | canned "didn't catch that", in character | unit | robot asks again |
| whisper binary/model missing | canned fallback + log | unit | robot still talks |
| claude hang | 10 s voice-path cap → canned line | unit | short pause, then character line |
| TTS key dead | Piper fallback | unit | different voice, same words |
| both voices dead | face reacts + text in chat panel | unit | silent face + village text |
| oversized/looping mic upload | RAM cap, reject | unit | robot error face |
| Wi-Fi drop mid-reply | firmware playback stop + offline face | firmware smoke | sleepy face |
| server down | heartbeat stale → firmware offline face | firmware smoke | sleepy face |
| double-talk / tap during reply | interrupt semantics, lockout | unit | robot yields instantly |
| droplet deploy exposure | env gate default OFF | unit | nothing — endpoint absent |
| router misconfig | traffic-capture step in runbook (human) | runbook | capture log |

## Parallel lanes

| Step | Modules touched | Depends on |
|------|----------------|------------|
| H1 toolchain + fresh-firmware skeleton (hello-face, mic meter) | firmware/ | — (start TODAY, pre-arrival) |
| H2 three-tier audit (M5Unified data-path files @ pinned hash) | docs/robot/ | H1 pin |
| H3 router block + firewall + network homework | docs/robot/ (human) | — |
| S1 voice module skeleton (gate, auth, routes, caps, timeout) | packages/server | spec §2 (this doc suffices) |
| S2 whisper + TTS + memory + fakes + tests | packages/server | S1 |
| S3 shim retirement (+ rate-limit hook, nginx note) | packages/server | S1 landed |
| F1 mood→expression table + face-pack generator | packages/core | — |
| F2 firmware GIF-from-file + pack transfer + neutral fallback | firmware/ | H1, F1 |
| SPEC Sections 3–5 + spec doc | docs/superpowers/ | this review |

Lanes: **H (hardware)** H1→H2→H3 ∥ **S (server)** S1→S2→S3 ∥ **F (faces)** F1 then F2.
Launch H and S in parallel worktrees now; F1 parallel too; F2 waits on H1. Conflict
flags: H and F2 share `firmware/`; S2 and F1 both touch `packages/core` exports —
coordinate merges. SPEC can be written while H1/H3 run.

## Implementation Tasks

- [ ] **T1 (P1, human: ~half day / CC: ~1h)** — firmware — PlatformIO project at `firmware/`, M5Unified pinned by hash, hello-face + mic-level smoke build (pre-arrival)
  - Surfaced by: D7 + OV#7 · Files: firmware/* · Verify: `pio run` compiles; flashes to CoreS3
- [ ] **T2 (P1, human: ~afternoon / CC: ~30min guided read)** — audit — read Mic/Speaker/Touch classes at the pin; check the one "WiFi" mention; write docs/robot/AUDIT.md
  - Surfaced by: D6.2 · Verify: AUDIT.md lists every file read + verdict
- [ ] **T3 (P1, human: ~1h)** — network — router all-egress block incl. DNS, AP-isolation check, 2.4 GHz pick, Windows inbound 8262 rule
  - Surfaced by: privacy reqs + OV#8 · Verify: traffic capture shows PC:8262 only
- [ ] **T4 (P1, human: ~1 day / CC: ~1h)** — server — voice module skeleton: env gate (default OFF), secret on every mutating route, RAM cap, 10 s brain timeout, canned fallbacks, heartbeat→presence
  - Surfaced by: D8.4/5/7, findings 1–2 · Verify: unit tests in the bill
- [ ] **T5 (P1, human: ~half day / CC: ~45min)** — server — whisper.cpp child (base model), models outside OneDrive tree, pinned download script, fake-whisper
  - Surfaced by: Step 0 search + OV#12 · Verify: bench WAV on this PC; unit tests
- [ ] **T6 (P1, human: ~2h / CC: ~20min)** — server — v1 rolling conversation memory in prompt (20 s window carries context)
  - Surfaced by: OV#1 · Verify: follow-up test in the bill
- [ ] **T7 (P1, human: ~2h / CC: ~20min)** — server — TTS whole-reply: OpenAI primary, Piper fallback, fake-piper; no chunker
  - Surfaced by: design + OV#10 · Verify: unit tests
- [ ] **T8 (P2, human: ~1–2 days / CC: ~half day)** — faces — core mood→expression table; DNA→pack generator (golden files); firmware GIF-from-file + neutral fallback; pack transfer + flash budget
  - Surfaced by: findings 3/7, OV#9 · Verify: golden tests; pack loads on device
- [ ] **T9 (P2, human: ~half day / CC: ~30min)** — server — shim retirement: robot/openai.ts + 2 tests + /v1 routes + rate-limit hook + nginx note
  - Surfaced by: D4 + OV#6 · Files: packages/server/src/robot/*, api/app.ts:76,305,310 · Verify: grep /v1 empty; suite green
- [ ] **T10 (P2, human: ~half day / CC: ~1h)** — tests — fake-robot E2E (WAV in → PCM + face events out, fake whisper + fake CLI)
  - Surfaced by: finding 13 · Verify: runs in CI, no tokens, no robot
- [ ] **T11 (P2, human: ~2h / CC: ~30min)** — docs — SETUP.md + re-ordered day-one runbook (factory sanity no-Wi-Fi → own smoke build → router verify → echo test → capture)
  - Surfaced by: OV#7 + old Task 13 salvage · Verify: user walks it with robot in hand
- [ ] **T12 (P3, human: ~1h / CC: ~15min)** — CI — non-blocking PlatformIO compile job
  - Surfaced by: finding 15 · Verify: CI green on firmware change
- [ ] **T13 (P3, human: ~30min)** — spec — single v1 latency number (3.5–5 s) + measured whisper time
  - Surfaced by: OV#13 · Verify: spec §9 has one number

## NOT in scope (considered, deferred, with reasons)

- **v1.1 speed push** (warm runner, streaming mic, chunked TTS, real VAD): lands as one
  measured latency release after v1 talks — every piece has a designed slot.
- **Wake word / barge-in (R3′)**: needs open-mic; waits for v1.1's VAD.
- **Servos / LEDs / NFC / IR**: kit extras; nothing in v1 depends on them.
- **Camera**: excluded from the build by privacy requirement — never compiled.
- **Away-from-home relay**: the server URL stays a config change; door open, not built.
- **Per-creature TTS voices**: R3 as in the old spec §6.
- **The old plan's Tasks 13–14**: dead with the gateway; the fake-robot E2E replaces
  fixture replay's job.
- **Their Python server / MCP stack**: never vendored, never run (D7).

## What already exists (reused, not rebuilt)

- M4 chat machinery: one-shot CLI runner (measured ~2.5 s), personality cards,
  spokenSystemPrompt, canned pools, budget ledger, one-life semantics — the brain
  path, reused whole.
- Robot-house scene, drag-and-drop, `robotResidentId` (STATE_VERSION 5), presence
  states — merged with M5; only the presence SOURCE re-points to the heartbeat.
- Fake-binary test pattern (`SKILL_VILLAGE_CLAUDE`) — extended to whisper/Piper.
- The reference fork's debugged audio lessons — consulted as a map, not run.

## Unresolved decisions

NO UNRESOLVED DECISIONS — D4, D5, D6.2, D7, D8 all user-confirmed 2026-08-31.
