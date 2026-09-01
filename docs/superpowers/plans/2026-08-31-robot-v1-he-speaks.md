# Robot V1 "He Speaks" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The physical M5StackChan speaks as the resident village creature — tap to talk, local ASR, streaming sentence TTS — with the audited, stripped, hardened vendored firmware.

**Architecture:** Pull-model loop, PC-driven: the voice module inside skill-village-server polls the robot's LAN HTTP API, pulls recordings, transcribes with a local whisper.cpp server, routes through `village.chat(residentId, text, 'spoken')`, and pushes sentence-chunked 24 kHz PCM back to the robot. The robot initiates nothing; the village server stays loopback-bound (the pull model needs no `VILLAGE_HOST` exposure — stricter than the spec assumed).

**Tech Stack:** TypeScript (fastify server, vitest), C/C++ PlatformIO firmware (vendored fork), whisper.cpp server (local ASR), OpenAI TTS REST (primary voice) + Piper (local fallback), M5Unified touch.

**Spec:** `docs/superpowers/specs/2026-08-31-robot-aprime-embodiment-design.md` (approved 2026-08-31). Audit gate: `docs/robot/AUDIT.md` (all ten fork changes land in Tasks 4–5).

## Global Constraints

- **No Chinese-authored code in the application data path** (spec §1; HAL ceiling accepted per spec §6 — M5Stack/Espressif HALs stay, everything above them is ours or vetted non-Chinese).
- **Voice audio never leaves the PC.** ASR local; only conversation text → Anthropic, reply text → OpenAI TTS (spec §6).
- **Audio never persists** — RAM only, device and PC both. No PCM ever written to disk except the user-triggered scripted test fixtures (spec §6).
- **Never mute:** every completed turn ends in sound, in character (spec §7). `village.chat` already falls back to canned lines; TTS has its own fallback chain.
- **One ledger, one life:** robot turns go through `village.chat(..., 'spoken')` — `kind: 'chatter'`, `budget: 'interactive'`, care applied (spec §2). Never call the LLM any other way.
- **Kind-agnostic:** nothing may branch on `CreatureKind`.
- **CI spends no tokens and needs no hardware:** all tests use the existing `fakeCliCommand` machinery, `app.inject`, and the fake device from Task 6. Firmware compile checks need PlatformIO (Task 3) but never a robot.
- **Fixtures use scripted phrases only** — never real conversations.
- Ports: server `8262`, Vite `5173`. Robot HTTP `:80`, PCM TCP `:9090`, UDP `:9091`, whisper server `:8178`. Data dir `~/.skill-village`.
- Firmware PCM contract (audited `wav_parser.cpp`): **PCM16, mono, 24000 Hz only.**
- Run tests from repo root: `npx vitest run <file>`. Typecheck: `npm run typecheck`. Commit after every green cycle; lower-case conventional messages.
- Hardware/money/ears steps are marked **[HUMAN]** — execute interactively with the user present; never dispatch to a lone subagent.

---

### Task 1: Fresh branch and green baseline

**Files:** none created; git + verification only.

- [ ] **Step 1: Branch from current main**

```bash
cd "C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web"
git fetch origin && git checkout -b robot-v1 origin/main && npm install
```

- [ ] **Step 2: Verify baseline is green**

Run: `npx vitest run` and `npm run typecheck`
Expected: all pass. If main is red, STOP and report — do not build on a red base.

- [ ] **Step 3: Confirm the symbols this plan builds on**

Run: `grep -n "style === 'spoken'" packages/server/src/village.ts && grep -n "setRobotResident\|robotActivityAt" packages/server/src/village.ts | head -3`
Expected: hits. If `village.chat`'s third parameter is gone or renamed, STOP and report.

---

### Task 2: Vendor the audited firmware snapshot

Pin exactly what was audited — upstream `migratorywhale/stackchan-mcp` commit `e8258a85b408057e9c914b8bcca9b70f59361445`.

**Files:**
- Create: `firmware/` (vendored copy of upstream `firmware/` only), `firmware/VENDOR.md`

- [ ] **Step 1: Fetch the pinned snapshot** (fresh clone; do not reuse any scratchpad state)

```bash
cd "$TEMP" && rm -rf stackchan-vendor && git clone https://github.com/migratorywhale/stackchan-mcp.git stackchan-vendor
cd stackchan-vendor && git checkout e8258a85b408057e9c914b8bcca9b70f59361445
```

- [ ] **Step 2: Copy ONLY the firmware subtree + license provenance into the repo**

```bash
cd "C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web"
mkdir -p firmware && cp -r "$TEMP/stackchan-vendor/firmware/." firmware/
cp "$TEMP/stackchan-vendor/LICENSE" firmware/UPSTREAM-LICENSE
cp "$TEMP/stackchan-vendor/THIRD_PARTY_NOTICES.md" firmware/THIRD_PARTY_NOTICES.md
rm -rf "$TEMP/stackchan-vendor"
```

- [ ] **Step 3: Write `firmware/VENDOR.md`**

```markdown
# Vendored firmware provenance

Source: https://github.com/migratorywhale/stackchan-mcp (MIT)
Commit: e8258a85b408057e9c914b8bcca9b70f59361445 (upstream 2026-08-30)
Audit: ../docs/robot/AUDIT.md — verdict SAFE-AFTER-STRIPPING; the strip and
hardening are Tasks 4–5 of docs/superpowers/plans/2026-08-31-robot-v1-he-speaks.md.
Only the upstream `firmware/` subtree is vendored; the Python MCP server,
faces, deploy and ops trees were deliberately not copied.
Upstream is REFERENCE ONLY after this commit — never pull without re-audit.
```

- [ ] **Step 4: Verify the snapshot matches the audit's tree** (spot integrity)

Run: `ls firmware/src/drivers && grep -c "esp_random" firmware/src/pcm_stream_service.cpp`
Expected: `SCServo` listed; count ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add firmware && git commit -m "chore(robot): vendor audited stackchan-mcp firmware snapshot e8258a85"
```

---

### Task 3: [HUMAN] Firmware toolchain + baseline compile

Proves the toolchain BEFORE we edit C++. Needs user approval for installs.

- [ ] **Step 1 [HUMAN]: Install PlatformIO** (user approves)

```bash
python -m pip install --user platformio
```

- [ ] **Step 2: Baseline compile of the UNMODIFIED vendored firmware**

```bash
cd firmware && cp config.h.example src/config.h && python -m platformio run
```

Expected: build SUCCESS for the default env. (`src/config.h` is git-ignored upstream; verify with `git status --short` that it is untracked — if not, add `firmware/src/config.h` to `.gitignore` in this step.)
If the build fails on toolchain download or env name, record the exact error and fix the environment — do NOT start editing sources to chase it.

- [ ] **Step 3: Commit** (only if .gitignore changed)

```bash
git add .gitignore && git commit -m "chore(robot): ignore firmware local config"
```

---

### Task 4: Firmware strip (audit changes #3, #4, #6, #8, #9)

**Files:**
- Delete: `firmware/src/drivers/SCServo/`, `firmware/src/camera_service.cpp`, `firmware/src/camera_service.h`, `firmware/src/audio_download.cpp`, `firmware/src/audio_download.h`, `firmware/data/` (legacy PNGs)
- Modify: `firmware/src/main.cpp`, `firmware/src/http_server.cpp`, `firmware/src/playback_service.cpp` (+`.h`), `firmware/src/config_defaults.h`, `firmware/config.h.example`, `firmware/platformio.ini`

- [ ] **Step 1: Delete the dead and the banned**

```bash
git rm -r firmware/src/drivers/SCServo firmware/src/camera_service.cpp firmware/src/camera_service.h firmware/src/audio_download.cpp firmware/src/audio_download.h firmware/data
```

- [ ] **Step 2: Remove camera from boot and routes.** In `main.cpp` delete the `#include "camera_service.h"` line and the `initCamera()` block (`main.cpp:43-45`). In `http_server.cpp` delete the `/snapshot` handler function and its route registration (single call site per audit — grep `captureJpeg` to find both).

- [ ] **Step 3: Remove `/play` + download path.** In `http_server.cpp` delete the `/play` handler (the one reading `voice_url`) and its registration. In `playback_service.cpp`/`.h` delete `downloadVoice` and the download task it spawns (audit: `playback_service.cpp:199-224`). PCM push (`/audio/session`, `/play/pcm`, TCP, UDP) stays — it is the only playback path now.

- [ ] **Step 4: Delete dead config.** Remove `NOTIFICATION_CHECK_INTERVAL`, `HTTP_TIMEOUT_CHAT`, `HTTP_TIMEOUT_SHORT` from `config_defaults.h` and `config.h.example`.

- [ ] **Step 5: Owner-scope M5GFX.** In `platformio.ini` change the bare `M5GFX@0.2.21` lib_deps line to `m5stack/M5GFX@0.2.21`.

- [ ] **Step 6: Verify absence, then compile**

```bash
grep -rn "esp_camera\|captureJpeg\|downloadVoice\|voice_url\|SCServo\|NOTIFICATION_CHECK" firmware/src ; cd firmware && python -m platformio run
```

Expected: grep finds NOTHING (exit 1); build SUCCESS.

- [ ] **Step 7: Commit**

```bash
git add -A firmware && git commit -m "feat(robot): strip firmware - no camera, no url fetch, no dead vendor code"
```

---

### Task 5: Firmware harden — auth, mic disarm, touch, zeroing (audit #1, #2, #5, #10-prep)

**Files:**
- Modify: `firmware/src/http_server.cpp`, `firmware/src/mic_service.cpp` (+`.h`), `firmware/src/recording_store.cpp`, `firmware/src/main.cpp`, `firmware/src/config_defaults.h`, `firmware/config.h.example`, `firmware/src/pcm_stream_service.cpp`

- [ ] **Step 1: Add the shared secret to config.** In `config_defaults.h` and `config.h.example`:

```c
// Shared secret: the PC must send this in X-Robot-Token on every request.
// Placeholder default guarantees a fresh flash rejects everything until
// the owner sets a real value in config.h.
#define ROBOT_API_TOKEN "CHANGE-ME"
```

- [ ] **Step 2: Enforce it on every HTTP route.** In `http_server.cpp`, above the handlers:

```c
static bool authorized() {
    if (server.header("X-Robot-Token") == ROBOT_API_TOKEN
        && strcmp(ROBOT_API_TOKEN, "CHANGE-ME") != 0) return true;
    server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
    return false;
}
```

Then make the FIRST line of every handler `if (!authorized()) return;`. Also add `server.collectHeaders(...)` in the server-begin function so `X-Robot-Token` is captured (WebServer collects only listed headers):

```c
static const char* kCollect[] = {"X-Robot-Token"};
server.collectHeaders(kCollect, 1);
```

- [ ] **Step 3: Token the TCP PCM handshake.** In `pcm_stream_service.cpp`, after the existing magic-line check (`STACKCHAN_PCM_STREAM/1`), require the next line to equal `ROBOT_API_TOKEN`; close the socket otherwise.

- [ ] **Step 4: Mic disarmed by default.** In `mic_service.cpp`: add `static volatile bool s_mic_armed = false;` and exported `void armMicrophone(bool on)` + `bool microphoneArmed()` (declare in `mic_service.h`). At the top of `updateMicrophone()`'s capture path (right after the playback early-return) add `if (!s_mic_armed) return;`. Disarm automatically when a recording is stored (one utterance per arm — the follow-up window re-arms from the PC):

```c
// in the state that hands the WAV to the recording store:
s_mic_armed = false;
```

- [ ] **Step 5: Arm/disarm routes + status field.** In `http_server.cpp` add authorized routes `POST /mic/arm` → `armMicrophone(true)`, `POST /mic/disarm` → `armMicrophone(false)`, both replying `{"armed":<bool>}`; add `"mic_armed"` to the existing status JSON so the PC can poll one endpoint.

- [ ] **Step 6: Touch = arm / interrupt.** In `main.cpp` `loop()` after `M5.update()` (add `M5StackChan.update()`/`M5.update()` if absent):

```c
auto t = M5.Touch.getDetail();
if (t.wasClicked()) {
    if (isPlaying()) { stopPlayback(); }          // tap while speaking: shut up
    else { armMicrophone(!microphoneArmed()); }    // tap while idle: talk toggle
}
```

Use the real names from `playback_service.h` for the is-playing check and stop call (read the header; if no stop exists, add `void stopPlaybackNow(void)` that ends `M5.Speaker` output and frees the queue, mirroring the completion path at `playback_service.cpp:661-675`).

- [ ] **Step 7: Face shows the mic.** Where `armMicrophone(true)` lands, call the existing `switchToFace` with the listening face (stock set: use `thinking` for armed/listening in V1); on disarm return to `calm`. (Face names per `face_names.cpp`.)

- [ ] **Step 8: Zero buffers after consumption.** In `recording_store.cpp`, in the consume/clear/replace paths, `memset` the buffer before free/reuse; in `mic_service.cpp` `memset(record_buffer, 0, ...)` after the store copy.

- [ ] **Step 9: Compile**

```bash
cd firmware && python -m platformio run
```

Expected: SUCCESS.

- [ ] **Step 10: Commit**

```bash
git add -A firmware && git commit -m "feat(robot): harden firmware - token auth, mic disarmed by default, tap to talk, zeroed buffers"
```

---

### Task 6: Device client + fake device (TypeScript)

**Files:**
- Create: `packages/server/src/robot/device.ts`, `packages/server/src/robot/testing/fake-device.ts`
- Test: `packages/server/src/robot/device.test.ts`

**Interfaces:**
- Consumes: firmware HTTP API as hardened in Task 5 (`X-Robot-Token`; `GET /audio/status`, `GET /audio`, `POST /audio/session`, `POST /play/pcm?session=&seq=&final=`, `POST /face`, `POST /mic/arm`, `POST /mic/disarm`).
- Produces (used by Tasks 9–10):

```ts
export interface DeviceStatus { reachable: boolean; micArmed: boolean; recordingReady: boolean; playing: boolean; }
export interface RobotDevice {
  status(): Promise<DeviceStatus>;
  pullRecording(): Promise<Buffer | null>;        // WAV bytes or null
  playPcm(chunks: AsyncIterable<Buffer>): Promise<void>; // 24kHz mono PCM16
  setFace(name: string): Promise<void>;
  arm(): Promise<void>; disarm(): Promise<void>;
}
export function createDeviceClient(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch }): RobotDevice;
```

- `fake-device.ts` produces `createFakeDevice(): RobotDevice & { pushRecording(wav: Buffer): void; playedPcm: Buffer[]; faces: string[]; armedLog: boolean[] }` — pure in-memory, no sockets.

- [ ] **Step 1: Write the failing tests** (`device.test.ts`) — spin a throwaway fastify echoing the firmware contract; assert the client sends the token header on every call, `pullRecording` returns the body bytes and `null` on 204/404, `playPcm` opens a session then posts sequenced chunks with `final=1` on the last, and any 401 rejects with an error naming auth.

```ts
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDeviceClient } from './device.js';

describe('createDeviceClient', () => {
  let app: ReturnType<typeof Fastify>; let base: string; let seen: string[];
  beforeEach(async () => {
    seen = [];
    app = Fastify();
    app.addHook('onRequest', async (req, reply) => {
      seen.push(`${req.method} ${req.url}`);
      if (req.headers['x-robot-token'] !== 'sekrit') return reply.code(401).send({});
    });
    app.get('/audio/status', async () => ({ mic_armed: false, recording_ready: true, playing: false }));
    app.get('/audio', async (_r, reply) => reply.type('audio/wav').send(Buffer.from('RIFFfake')));
    app.post('/audio/session', async () => ({ session: 's1', token: 1234 }));
    app.post('/play/pcm', async () => ({ ok: true }));
    app.post('/face', async () => ({ ok: true }));
    app.post('/mic/arm', async () => ({ armed: true }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  it('sends the token and pulls a recording', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit' });
    const status = await dev.status();
    expect(status).toMatchObject({ reachable: true, recordingReady: true });
    const wav = await dev.pullRecording();
    expect(wav?.toString()).toBe('RIFFfake');
  });

  it('streams pcm chunks through a session with seq and final', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit' });
    async function* chunks() { yield Buffer.alloc(4); yield Buffer.alloc(4); }
    await dev.playPcm(chunks());
    const pcmCalls = seen.filter((s) => s.startsWith('POST /play/pcm'));
    expect(pcmCalls[0]).toContain('seq=0'); expect(pcmCalls.at(-1)).toContain('final=1');
  });

  it('rejects on 401', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'wrong' });
    await expect(dev.status()).resolves.toMatchObject({ reachable: false });
    await expect(dev.pullRecording()).rejects.toThrow(/unauthorized|401/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run packages/server/src/robot/device.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `device.ts`** — plain `fetch` with the token header; `status()` maps snake_case fields and returns `{reachable:false,...}` (all false) on network error or 401 instead of throwing; other methods throw on non-2xx. `playPcm` posts each chunk to `/play/pcm?session=<id>&seq=<n>&final=<0|1>` with `content-type: application/octet-stream`, buffering one chunk of lookahead so the last chunk carries `final=1`.

- [ ] **Step 4: Implement `testing/fake-device.ts`** — in-memory `RobotDevice` with the extra observation surface in the Interfaces block.

- [ ] **Step 5: Run tests + typecheck** → PASS. **Step 6: Commit** `feat(server): robot device client and fake device`.

---

### Task 7: Audio utilities + local ASR

**Files:**
- Create: `packages/server/src/robot/audio.ts`, `packages/server/src/robot/asr.ts`, `packages/server/src/robot/testing/fake-asr.ts`
- Test: `packages/server/src/robot/audio.test.ts`, `packages/server/src/robot/asr.test.ts`

**Interfaces (produced):**

```ts
// audio.ts — pure, no deps
export function wavToPcm16(wav: Buffer): { pcm: Int16Array; sampleRate: number }; // throws on non-PCM16-mono
export function pcm16ToWav(pcm: Int16Array, sampleRate: number): Buffer;
export function trimSilence(pcm: Int16Array, opts?: { threshold?: number; padMs?: number; sampleRate?: number }): Int16Array;
export function resampleTo24k(pcm: Int16Array, fromRate: number): Int16Array; // linear interpolation
// asr.ts
export interface Transcriber { transcribe(wav: Buffer): Promise<string>; healthy(): Promise<boolean>; }
export function createWhisperTranscriber(opts: { serverUrl: string; fetchImpl?: typeof fetch }): Transcriber;
// testing/fake-asr.ts
export function fakeTranscriber(replies: Record<string, string> | string): Transcriber;
```

- [ ] **Step 1: Write failing audio tests** — build a synthetic WAV (44-byte header + sine samples) in the test, round-trip `wavToPcm16`/`pcm16ToWav`, assert `trimSilence` cuts leading/trailing zeros but keeps `padMs` of margin, assert `resampleTo24k` maps a 22050 Hz buffer to `Math.round(n * 24000/22050)` samples and is identity at 24000.
- [ ] **Step 2: FAIL run.** **Step 3: Implement `audio.ts`** (RIFF parse: check `RIFF`/`WAVE`/`fmt `/`data` chunks, format 1, 16-bit mono; iterate chunks — do not assume a 44-byte layout).
- [ ] **Step 4: Write failing ASR tests** — throwaway fastify with `POST /inference` (multipart) returning `{ text: " hello there " }`; assert `transcribe` posts the WAV under form field `file` and returns the TRIMMED text; `healthy()` false when the port is closed.
- [ ] **Step 5: FAIL run.** **Step 6: Implement `asr.ts`** against whisper.cpp's server contract (`POST /inference`, multipart field `file`, optional `temperature`/`response_format=json`), and `fake-asr.ts`.
- [ ] **Step 7: PASS + typecheck.** **Step 8: Commit** `feat(server): robot audio utils and whisper transcriber`.

---

### Task 8: TTS — sentence splitter, OpenAI speaker, Piper fallback

**Files:**
- Create: `packages/server/src/robot/tts.ts`, `packages/server/src/robot/testing/fake-tts.ts`
- Test: `packages/server/src/robot/tts.test.ts`

**Interfaces (produced):**

```ts
export function splitSentences(text: string): string[]; // ".!?…" boundaries, keeps delimiters, merges fragments < 4 chars into the previous sentence
export interface Speaker { synthesize(text: string): AsyncIterable<Buffer>; /* 24kHz mono PCM16 chunks, one per sentence */ }
export function createOpenAiSpeaker(opts: { apiKey: string; voice?: string; model?: string; fetchImpl?: typeof fetch }): Speaker;
export function createPiperSpeaker(opts: { exePath: string; modelPath: string }): Speaker; // spawns piper per sentence, resamples 22050→24000
export function withFallback(primary: Speaker, fallback: Speaker, onFallback: (err: unknown) => void): Speaker;
// testing/fake-tts.ts
export function fakeSpeaker(bytesPerSentence?: number): Speaker & { spoken: string[] };
```

- [ ] **Step 1: Failing tests** — `splitSentences('Hi! Two things. Ok?')` → 3; fragments merge; `createOpenAiSpeaker` (against a throwaway fastify posing as `https://api.openai.com/v1/audio/speech` via `fetchImpl` + base-url override in opts for tests) sends `response_format: 'pcm'` and yields one Buffer per sentence; `withFallback` switches to fallback on primary throw and reports via `onFallback`; fallback throw propagates (loop's never-mute handles it).
- [ ] **Step 2: FAIL run.** **Step 3: Implement.** OpenAI call per sentence: `POST {base}/audio/speech` body `{ model: opts.model ?? 'gpt-4o-mini-tts', voice: opts.voice ?? 'alloy', input: sentence, response_format: 'pcm' }` → 24 kHz PCM16 body verbatim. Piper: `spawn(exePath, ['--model', modelPath, '--output-raw'])`, write sentence to stdin, collect stdout, `resampleTo24k(pcm, 22050)`.
- [ ] **Step 4: PASS + typecheck.** **Step 5: Commit** `feat(server): robot tts - openai speaker, piper fallback, sentence streaming`.

---

### Task 9: The conversation loop

**Files:**
- Create: `packages/server/src/robot/loop.ts`
- Test: `packages/server/src/robot/loop.test.ts`

**Interfaces:**
- Consumes: `RobotDevice` (Task 6), `Transcriber` (7), `Speaker` (8), and the existing `village.chat(id, text, 'spoken')` / `village.getState().robot.residentId` / module consts `EMPTY_HOUSE_LINE`, `MOVED_AWAY_LINE` (export these two from `api/app.ts` or move them to `robot/lines.ts` and import in both — mover's choice, one definition).
- Produces:

```ts
export interface RobotLoopDeps { device: RobotDevice; asr: Transcriber; tts: Speaker;
  village: Pick<Village, 'chat' | 'getState'>; log: (line: string) => void;
  pollMs?: number; followUpMs?: number; }
export function startRobotLoop(deps: RobotLoopDeps): { stop(): void; snapshot(): { deviceReachable: boolean; lastTurnAt: number | null } };
```

- [ ] **Step 1: Failing tests** (fake device + fake ASR + fake TTS + a stub village):
  - recording appears → loop pulls, transcribes, chats as resident, pushes TTS pcm, sets faces `thinking`→`happy`→`calm`, re-arms mic (follow-up window), disarms after `followUpMs` of silence;
  - `residentId === null` → speaks `EMPTY_HOUSE_LINE`, never calls `village.chat`;
  - `village.chat` throws → speaks `MOVED_AWAY_LINE`;
  - TTS primary+fallback both throw → face `pouty`, error logged, loop keeps polling (never crashes);
  - each turn logs one timing line matching `/robot turn: pull=\d+ms asr=\d+ms brain=\d+ms tts_first=\d+ms total=\d+ms/`;
  - `stop()` halts polling (fake timers).
- [ ] **Step 2: FAIL run.** **Step 3: Implement** — single `setTimeout` chain (no overlapping polls); per-hop `performance.now()` stopwatch; trim + transcribe; empty transcript → re-arm and continue silently; the reply's sentences flow `splitSentences → tts.synthesize → device.playPcm` as one async iterable so sentence 2 synthesizes while 1 plays.
- [ ] **Step 4: PASS + typecheck.** **Step 5: Commit** `feat(server): robot conversation loop - pull, transcribe, chat, speak, never mute`.

---

### Task 10: Wire-up, config, presence

**Files:**
- Modify: `packages/server/src/main.ts`, `packages/server/src/api/app.ts` (robot snapshot only)
- Test: extend `packages/server/src/api/app.test.ts`

**Interfaces:**
- Consumes: `startRobotLoop` (9), `createDeviceClient` (6), `createWhisperTranscriber` (7), speakers (8).
- Env contract (all optional — loop OFF unless `VILLAGE_ROBOT_HOST` set): `VILLAGE_ROBOT_HOST` (e.g. `192.168.1.42`), `VILLAGE_ROBOT_TOKEN`, `VILLAGE_WHISPER_URL` (default `http://127.0.0.1:8178`), `OPENAI_API_KEY`, `VILLAGE_PIPER_EXE`, `VILLAGE_PIPER_MODEL`.

- [ ] **Step 1: Failing test** — `GET /api/robot` gains `deviceReachable: boolean` (false when no loop is running); existing fields unchanged.
- [ ] **Step 2: FAIL run.** **Step 3: Implement** — in `main.ts`, when `VILLAGE_ROBOT_HOST` is set: build device client (`baseUrl: http://${host}`), transcriber, `withFallback(openai, piper, log)` (or piper-only when no `OPENAI_API_KEY`), start the loop, expose its `snapshot()` to `createApp` via an optional param threaded to the robot snapshot route. Missing token → refuse to start the loop with a clear log line (never run unauthenticated).
- [ ] **Step 4: PASS full suite + typecheck.** **Step 5: Commit** `feat(server): robot loop wiring - env config and presence`.

---

### Task 11: [HUMAN] Runtime pieces — whisper, piper, key

All downloads need the user's approval; record exact versions in `docs/robot/SETUP.md` as you go (that doc is Task 12's deliverable — start it here with a "Runtime pieces" section).

- [ ] **Step 1 [HUMAN]: whisper.cpp server** — download the latest whisper.cpp Windows release binaries (`whisper-server.exe` + `ggml-base.en.bin` model to start; try `small.en` later if accuracy disappoints) into `C:\robot-stack\whisper\`. Launch: `whisper-server.exe -m ggml-base.en.bin --port 8178`. Verify: `curl http://127.0.0.1:8178/` answers.
- [ ] **Step 2 [HUMAN]: Piper** — download Piper Windows release + one en_US voice (e.g. `en_US-lessac-medium.onnx`) into `C:\robot-stack\piper\`. Verify: `echo hello | piper --model en_US-lessac-medium.onnx --output-raw > NUL` exits 0.
- [ ] **Step 3 [HUMAN]: OpenAI key** — user creates/loads the key; it lives in the shell env (`$env:OPENAI_API_KEY='...'`) or a local untracked `.env` — NEVER the repo.
- [ ] **Step 4: Measure ASR speed** — time whisper on a 3-second scripted WAV; record ms in SETUP.md (spec §5 baseline input).

---

### Task 12: [HUMAN] Bring-up — flash, contain, first conversation

Interactive with the user at the desk. **Order is load-bearing** (privacy: factory firmware never gets Wi-Fi).

- [ ] **Step 1 [HUMAN]: Unbox + offline sanity** — power on, confirm screen/servos/speaker demo WITHOUT joining any network, no app install, no account.
- [ ] **Step 2 [HUMAN]: Local config** — `firmware/src/config.h`: real `WIFI_SSID_0/PASSWORD_0`, a generated `ROBOT_API_TOKEN` (`openssl rand -hex 16` or PowerShell `-join ((48..57)+(97..102) | Get-Random -Count 32 | % {[char]$_})`). Confirm `git status` shows it untracked.
- [ ] **Step 3 [HUMAN]: Flash** — `cd firmware && python -m platformio run --target upload` (USB). **Recovery: M5Burner restores factory firmware** — write this in SETUP.md in bold before flashing.
- [ ] **Step 4 [HUMAN]: Contain** — router: per-device internet block for the robot's MAC (its only reachable peer: the PC). Windows Firewall: nothing inbound needed on the PC for the pull model. Verify: from the PC, `curl -H "X-Robot-Token: <token>" http://<robot-ip>/audio/status` answers; from the robot's side, the block is proven in Step 7.
- [ ] **Step 5 [HUMAN]: Echo test** — start whisper-server; start the village server with `VILLAGE_ROBOT_HOST/<TOKEN>` set (plain terminal, not inside a Claude Code session — nested CLI reports "Not logged in"); tap the robot, speak a scripted phrase, watch the server log show the transcript.
- [ ] **Step 6 [HUMAN]: First conversation** — set a resident (drag in the browser at `http://localhost:5173` or `curl -X PUT localhost:8262/api/robot/resident -H "content-type: application/json" -d "{\"creatureId\":\"<id>\"}"`), tap, ask who he is. Expected: the reply is in the resident's personality, the timing log line appears, `robotLastTurnAt` moves.
- [ ] **Step 7 [HUMAN]: Traffic capture** — `pktmon` or Wireshark filtered to the robot's IP for a full conversation: every packet terminates at the PC. Save the one-line conclusion (not the capture) to SETUP.md.
- [ ] **Step 8: Latency baseline** — copy three turns' timing lines into SETUP.md; compare against spec §5 v1 (~2.5–4 s).
- [ ] **Step 9: Scripted fixtures** — with the user speaking three SCRIPTED phrases, save the WAVs via a temporary `SKILL_VILLAGE_ROBOT_WAV_FIXTURES` hook or by copying the pull in the loop under a debug flag; commit under `packages/server/src/robot/fixtures/` for replay tests. (Text-only fixtures acceptable if WAV plumbing drags — note which landed.)
- [ ] **Step 10: Finish `docs/robot/SETUP.md`** (what-talks-to-what, prerequisites, runtime pieces, flash, containment, rollback) and commit: `chore(robot): v1 bring-up notes, latency baseline, scripted fixtures`.

---

## After V1 (sketch only — plan separately once V1's measurements exist)

- **V2 "he is them":** face-pack generator (creature DNA → GIF expression set; golden tests), firmware runtime face loading (AUDIT §11: free-after-acknowledge handshake or double-buffer + mutex — the audited hazard), move-in delivery + swap, petting→care touch gestures, canned-audio WAV cache, on-device resident menu, presence truthfulness polish.
- **V3 "he keeps up":** `--output-format stream-json --include-partial-messages` streaming brain (probe the installed CLI first, M4-style), spawn-ahead warm runner, streaming mic off the device, WebRTC VAD on the PC stream, openWakeWord hands-free, barge-in-by-voice. Gate: measured V1 baselines.
- Cleanup queued behind V1: retire or keep the dormant `/v1` OpenAI-compat shim; delete `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/`.
