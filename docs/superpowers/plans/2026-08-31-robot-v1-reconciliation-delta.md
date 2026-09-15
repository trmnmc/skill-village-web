# Reconciliation Delta — robot-v1 vs the user's decisions

**Date:** 2026-08-31 (late night) · **Source:** interactive /plan-ceo-review session
(branch `claude/plan-ceo-review-908992`), decisions D1–D7 + E1–E6 answered by the
user personally. Outside-voice cross-check verified against `main@35cc6b2` and
`robot-v1@01c0682`.
**Authority:** `docs/superpowers/plans/2026-08-31-robot-v1-he-speaks.md` stays the
single build plan. This file is a DELTA the robot-v1 session must absorb into it.
The user chose (D6): **building may continue; nothing is flashed to hardware until
the BEFORE-FLASH items below are absorbed.** The user confirmed (D7) they approved
the spec themselves — this is drift-cleanup, not an authority dispute.

Each item: what drifted → the user's original call → the fix.

## BEFORE FLASH (absorb before any firmware goes on the robot)

- [ ] **R1 — Never-mute needs its bottom rung in V1, not V2.**
  Drift: plan Task 9 — both TTS engines failing ends the turn in a pouty face and
  silence; the canned-audio WAV cache was deferred to V2. Spec §7 requires it.
  Call: never-mute is a standing invariant (spec §5/§7, design session).
  Fix: at build time, pre-render 3–5 short in-character-ish lines to WAV on the PC
  ("my voice is stuck", "give me a moment") and play from disk when the TTS chain
  throws. Size: small. The ladder's last rung must not depend on any network or
  external process.

- [ ] **R2 — Mic model and indicator: hot mic must always show the listening face.**
  Drift: Task 5 uses `thinking` for armed; Task 9 re-arms the mic for the 20 s
  follow-up window while the face shows `calm`. And the firmware's RMS auto-trigger
  can start a recording from loudness alone.
  Call: v1 mic model is touch-to-talk — the mic opens only on touch (design
  session, "most private"); a visible listening state whenever the mic is hot is
  the non-negotiable privacy indicator (spec §3).
  Fix: (a) mic arms on touch only; RMS trigger active only inside the explicit
  follow-up window; (b) whenever the mic is armed — including the follow-up
  window — the face is the listening face. If that reads as too chatty, shorten
  the window; never hide it. Size: small.

- [ ] **R3 — The user's voice never enters git.**
  Drift: Task 12 Step 9/10 records scripted-phrase WAVs of the user and commits
  them as fixtures ("scripted fixtures" commit).
  Call: "voice audio never leaves the PC" is a hard rule; a scripted voiceprint in
  a pushed repo leaves the PC forever.
  Fix: gitignore `packages/server/src/robot/fixtures/*.wav`; the user's bench
  recordings stay local-only. CI/unit tests keep using synthetic audio (the plan
  already builds sine WAVs) or TTS-generated speech. Size: tiny.

- [ ] **R4 — No-speech guard before the brain.**
  Drift: V1 replaced the user-picked WebRTC VAD with `trimSilence`; nothing stops
  silence/noise from reaching whisper, which hallucinates text ("Thank you."), so
  the brain replies and the robot speaks unprompted.
  Call: WebRTC VAD was the user's explicit component pick; the sovereign speech
  principle is "speaks only in response to a deliberate user action."
  Fix (either): (a) put WebRTC VAD back in the v1 chain as the gate, or (b) keep
  trimSilence but add a no-speech guard — minimum voiced duration/energy +
  whisper no-speech/confidence heuristics; empty or low-confidence → "didn't
  catch that" face + canned line (spec already requires this behavior), and NO
  brain call. Record which option in the plan. Size: small.

- [ ] **R5 — Close the raw audio ports.**
  Drift: Task 4 keeps the PCM TCP :9090 listener (token added, unused) and UDP
  :9091 with no auth — any LAN host can inject speaker audio. The PC uses HTTP
  only.
  Call: shared-secret auth on BOTH ends; smallest possible attack surface.
  Fix: delete both raw listeners from the vendored firmware (HTTP PCM session is
  the only playback path), or auth both if one is truly needed. Size: small,
  strictly deletion-shaped.

## BEFORE CALLING V1 DONE

- [ ] **R6 — Latency staging keeps the user's calendar intent.** V1 measures the
  2.5–4 s band (fine, honest). But the streaming-brain speed-up is the user's
  v1.1 (week of Sep 8) intent, not a distant V3 wish. Keep the "measured V1
  baselines" gate; put the streaming spike in the Sep 8 week.

- [ ] **R7 — Face bar language in the V-map.** Add one line: "V1's stock face is
  bring-up scaffolding, never the end state; the creature face (V2) is the
  embodiment release bar." (User decision D5 tonight; they rejected stock-face-
  as-product in the design session.)

- [ ] **R8 — Landing sites for approved expansions.** User-approved tonight
  (E-decisions): E1 thinking-face cycle (v1 — mostly present already), E3 move-in
  greeting (V2 — present), E5 per-creature voices → land with V2 "he is them"
  (voice is identity, same argument as the face; spec currently defers past V3 —
  change it), E2 work-signal face reactions + E6 sleep-with-the-village-clock →
  the Sep 15+ wave (V2.5/V3 map entries). E4 idle murmurs was DECLINED — he
  speaks only on deliberate user action, never on a timer; do not resurface.

- [ ] **R9 — The save the robot now writes to must first stop being fragile.**
  The robot adds persisted state onto a save that lives in an OS-cleanable TEMP
  dir with no version lock. User's D3 parked these fixes out of the robot week;
  the CEO review's post-week priority: land save-durability + version-lock (Sep 8
  week, minutes of work) BEFORE the Sep 15+ wave.

- [ ] **R10 — Governance line.** The repo plan is the single build authority; the
  CEO decision records live at
  `~/.gstack/projects/trmnmc-skill-village-web/ceo-plans/2026-08-31-robot-aprime-embodiment-interactive.md`
  (this session, user-answered) and `...-embodiment.md` (autoplan, auto-decided).
  Parallel sessions must write distinct filenames — the autoplan run clobbered
  the interactive CEO plan mid-review tonight. Never reuse another session's
  artifact filename.

## Notes for the absorbing session

- Flash gate recap (unchanged, now explicit): factory-firmware backup exported
  before first flash; audit passed (82f7766, user-approved chain confirmed D7);
  R1–R5 absorbed; traffic capture on day one confirms the robot talks only to
  the PC.
- The outside voice also flagged: interrupt is device-only (no server-side cancel
  of brain/TTS in flight — spec §3/§7 want it; schedule with R6's week), and the
  Piper fallback spawns a fresh process per sentence (multi-second fallback —
  keep a persistent process; small fix, same week).
