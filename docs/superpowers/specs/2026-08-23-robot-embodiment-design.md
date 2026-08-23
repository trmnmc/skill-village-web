# Robot Embodiment — Design (R-track)

**Date:** 2026-08-23
**Status:** draft for user review
**Inputs:** brainstorm this date (approach A approved; all five design sections
approved one at a time). Depends on M4's chat machinery (merged: CLI runner,
personality cards, canned pools, budget ledger). Independent of M5–M10 — this
is a parallel track, R1–R3, and takes no number from the roadmap
reconciliation (`2026-08-22-roadmap-reconciliation-design.md`).
**Hardware:** M5StackChan AI Desktop Robot Kit (ESP32-S3 CoreS3: 2.4 GHz
Wi-Fi, dual mics, 1 W speaker, 2.0" 320×240 touch IPS, two servos, 12 RGB
LEDs, NFC, IR, 0.3 MP camera, 550 mAh battery).

## 1. Concept

The physical robot is a **house**. In the village, drag any creature onto the
robot-house and they move in: the robot on the desk becomes that creature —
its M4 personality card answers voice conversations, its canned lines cover
failures, and (R3) its own voice speaks. One resident at a time; any
creature kind, today's cast or the M5 remap's — embodiment is
kind-agnostic by construction.

## 2. Architecture

Four pieces; only the shim and the robot-house are written by us.

1. **Robot firmware** — XiaoZhi-compatible open firmware built from
   [m5stack/StackChan](https://github.com/m5stack/StackChan) (protocol:
   [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32)), configured to
   point at the user's PC on the LAN instead of xiaozhi.me. The robot is
   mouth, ears, face, servos. It holds no intelligence and no secrets; when
   it can't reach the PC it falls back to its own canned offline behavior.
2. **Voice gateway** —
   [xiaozhi-esp32-server](https://github.com/xinnan-tech/xiaozhi-esp32-server),
   Docker on the PC (native Python is the fallback if Docker Desktop on
   Windows 10 misbehaves). Accepts the robot's audio stream, runs
   speech-to-text **locally** (SenseVoiceSmall class), synthesizes replies
   via TTS (§6), and is configured with exactly one LLM provider: the shim.
3. **The shim** (ours) — an OpenAI-chat-compatible endpoint inside
   skill-village-server (port 8262). Per turn: look up `robotResidentId`,
   load that creature's personality card, route through the same M4 chat
   pipeline the village chat panel uses, return the reply in OpenAI response
   format. The gateway never knows claude exists.
4. **The robot-house** (ours) — a building in the KAPLAY scene representing
   the physical robot: presence states, current resident on display,
   drag-and-drop target.

One utterance: speak → robot streams audio to gateway → local ASR → shim +
claude (as the resident) → TTS → robot speaks.
[dotty-stackchan](https://github.com/BrettKinny/dotty-stackchan) (MIT) proved
this chain on this exact hardware; it is a reference map, **not** a
dependency (unstable, restart-to-change-personality).

## 3. Privacy invariants

- The user's **voice audio never leaves the PC**: ASR is local; the robot
  talks only to the LAN gateway; nothing is ever pointed at xiaozhi.me.
- What leaves the PC: conversation **text** to Anthropic (existing M4
  claude path, user's subscription) and reply **text** to OpenAI TTS (§6).
- Verified at R1 exit by checking the robot's traffic goes only to the PC.

## 4. The robot-house (packages/web)

- Always in the scene, visually distinct from scenery houses — it should
  read as *him* (the robot's silhouette / face-screen as the door).
- **Presence:** dark/asleep when the gateway is unreachable; lit when the
  gateway health check passes; brighter/active while conversation turns are
  flowing (the shim knows). True robot↔gateway connection state is a
  verify-during-R2 upgrade if the gateway exposes it; the fallback above
  works regardless.
- **Move in:** drag a creature onto the house; they walk over, enter, and
  are shown *at* the house (porch/window) so a glance says who the robot
  is. They keep their creature id, card, and stats — embodiment is a
  pointer, not a copy.
- **Move out:** drag them off (they walk back) or drop another creature on
  (swap; the old resident walks home). Robot offline during a swap is fine:
  the resident is state, and he wakes as them on reconnect.
- Drag-and-drop is new input work in the scene (today: hover only):
  pointer-down on a creature, drag ghost, drop hit-test on the house.

## 5. The shim (packages/server)

- Implements the OpenAI chat-completions surface the gateway expects
  (path/streaming requirements pinned by R1 fixtures, not assumed; if
  streaming is required, the shim chunks the finished reply into SSE).
- Per-turn resident lookup means a drag-and-drop swap changes the speaker
  mid-conversation with zero restarts.
- **Spoken-mode preamble** wraps the personality card: one to three short
  sentences, no markdown, no lists. This is also the latency lever.
- **Never mute:** claude failure or budget exhaustion falls back to the
  resident's canned pool, in character (M4 machinery). Empty house gets a
  fixed line: nobody lives here yet — drag someone in.
- **One ledger:** robot turns draw from the same M4 token budget as the
  chat panel; chat-model routing (haiku) matches the chat panel.
- **One life:** a robot conversation counts exactly as a chat-panel
  conversation for bond/care and history.

## 6. Voice (TTS)

- **OpenAI TTS** is the mouth (user decision): only reply text leaves the
  PC; needs the user's OpenAI API key + billing; cost is pennies per day at
  spoken-reply lengths. **Piper (local)** stays configured as the offline
  fallback — a dead key degrades his voice, never silences him.
- R1 ships one default voice. R3 assigns **per-creature voices**: a base
  voice plus personality-flavored style instructions, derived
  deterministically from the creature (DNA/kind), so swapping residents
  changes timbre, not just words.

## 7. Embodiment state (packages/core + server)

- One new persisted field: `robotResidentId: string | null`. Set by
  drag-and-drop, read by the shim per turn, survives restarts. Ships with
  the next `STATE_VERSION` bump and in-place migration (M4 pattern); the
  implementation plan binds the actual number at execution time (other
  tracks also bump it).
- Everything else (card, canned pool, mood, bond) already lives on the
  creature.

## 8. Ceremony and expressiveness (R3)

- **Move-in greeting:** if the XiaoZhi protocol supports server-initiated
  speech (verify during R3), a swap triggers a spoken greeting in the new
  voice; the same push channel enables occasional idle lines from the
  resident's canned pool. If push is unavailable, v1 degrades gracefully:
  he greets as his new self on the next wake word, idle chatter waits.
  Push is an enhancement seam, not a foundation.
- **Faces:** stock firmware expressions in v1. Village-mood → robot
  expression rides the same push-channel verification. Stretch, not core.

## 9. Latency

Expected v1: **~3–5 s** from end of speech to first spoken word
(end-of-speech detection ~0.5–1 s, local ASR ~0.3 s, claude CLI on haiku
~2–4 s dominant, TTS ~0.3 s, LAN negligible). Measured at R1 exit as the
baseline. Levers, in order: short replies (designed in), sentence-streaming
TTS (later), warm CLI session (later). Instant ChatGPT-voice banter is out
of reach of this architecture by design — the robot is a thoughtful desk
pet, not a phone call.

## 10. Stages

- **R1 — brain swap.** Gateway up (Docker; local ASR; OpenAI TTS + Piper
  fallback), firmware built and flashed pointing at the PC (riskiest hour;
  M5Burner restores factory firmware if it goes wrong), shim v0 with one
  hard-coded card, gateway request shapes recorded as fixtures. Exit: a
  conversation with the robot as one villager; traffic check passes;
  latency baseline recorded. User-steps: OpenAI key/billing; being the
  ears (§11).
- **R2 — the robot-house.** State field + migration, per-turn resident
  lookup, house rendering + presence, drag-and-drop with swap/evict,
  empty-house line. Exit: drag a creature in mid-conversation; the next
  reply is them.
- **R3 — expressiveness.** Greeting on swap, idle canned lines,
  per-creature voices, mood→face stretch — each gated on the push-channel
  verification where noted.

## 11. Testing

- **CI spends no tokens and needs no robot:** shim tested against gateway
  request fixtures captured in R1; claude side uses the existing fake-CLI
  machinery; unit tests for the migration, resident semantics
  (swap/evict/empty), spoken-mode preamble, and voice mapping; drag-drop
  logic tested at the layout/hit-test level (M3 pattern).
- **Hardware-in-the-loop is manual:** a per-stage playtest checklist; the
  user's eyes and ears are the review gate (standing policy). Latency and
  voice quality are playtest items, not assertions.

## 12. Risks

- **Firmware flash** — mitigated by M5Burner factory restore.
- **Gateway contract unknown in detail** — mitigated by R1 fixture capture
  before the shim hardens; dotty-stackchan as a reference map.
- **Push channel may not exist** — R3 features degrade gracefully (§8).
- **Docker Desktop on Windows 10** — native-Python gateway fallback.
- **Repo concurrency** — other tracks are executing on main; the robot
  branch rebases before merge and expects small scene-file conflicts.

## 13. Out of scope (deliberately)

Away-from-home access (droplet relay — the firmware's server URL makes this
a future config change, and the ESP32-S3's Wi-Fi keeps the door open);
multiple robots; camera/vision; wake-word customization; NFC physical
tokens; any writing to `~/.claude` (standing rule).
