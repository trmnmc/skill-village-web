# TODOS

Deferred work with context. Format: docs/superpowers records the decisions;
this file holds what was deliberately not built yet. Created 2026-09-02 by
/plan-ceo-review (foundation sprint); robot items carried from the
2026-08-31 /autoplan run.

## Foundation

### Notice-board consumer for /api/events

**What:** Render village history (the events log) in the game. The server
route exists (`packages/server/src/api/app.ts`, `/api/events`); no web code
fetches it today, so `save-migrated` and `save-merged` entries are invisible.

**Why:** The Notice Board zone exists in `packages/web/src/layout/zones.ts`
with no feed; M6's "signs say why" needs the same history.

**Context:** Start by rendering the last N events as sign copy. Belongs with
the M6 design pass (office-hours), not a foundation sprint.

**Effort:** M (human) / S (CC)
**Priority:** P2
**Depends on:** M6 design

### Droplet operations: MemoryMax, journald caps, OPS.md

**What:** `MemoryMax=` in `deploy/skill-village.service`, journald size
caps, and a `deploy/OPS.md` naming the reboot procedure and the health check.

**Why:** The checklist carries "droplet reboot pending, memory tight".

**Context:** Needs the droplet's real numbers (free memory, what else runs
there). The first scripted deploy (`deploy:village`) reports them.

**Effort:** S (human) / S (CC)
**Priority:** P3
**Depends on:** first run of `deploy:village`

### Rewind: village-save restore <snapshot>

**What:** Adopt a named file from `archive/snapshots/` as the live state,
under the CLI's safety contract (current state snapshotted first, live
server refused).

**Why:** The snapshots directory becomes useful the day something goes
wrong; without this, restore is a hand copy.

**Context:** `packages/server/scripts/village-save.ts`; a snapshot is a full
state file, so restore is import from the snapshots dir.

**Effort:** S / S
**Priority:** P3
**Depends on:** E1, E2 of the foundation sprint

### Second machine: village-save export --bundle and import

**What:** One-file bundle of the data dir (minus cache and pid) and a
matching import, plus a short doc.

**Why:** The world-file promise stops at one machine; a laptop needs a hand
copy of a directory today.

**Context:** Bundling needs a zip step: tar via child process or a tiny
dependency, a decision in its own right. The merge rules already reconcile
two diverged worlds.

**Effort:** M / S
**Priority:** P3
**Depends on:** E2

### Deploy script parity on macOS and Linux

**What:** Run `deploy:village` from a non-Windows machine and fix any scp,
path, or shell assumption.

**Why:** Written on Windows; node built-ins only, so parity should be a
test run, not a port, but nothing proves it.

**Context:** `deploy/deploy-village.ts`; the argv-array transport avoids
shell quoting differences.

**Effort:** S / S
**Priority:** P4
**Depends on:** E3, a second machine

## Robot (carried from the 2026-08-31 /autoplan run)

- [ ] **Latency dev overlay** — P3, effort M (human) / S (CC). Per-stage turn
  timings are logged by the voice module; this adds a dev-mode village
  overlay to see them live. Start at the voice module's timing logger.
- [ ] **Servo/LED choreography** — P3, effort M. The kit's servos and LEDs may
  not map to the DIY-variant firmware; the hardware day records the truth.
- [ ] **faster-whisper / Voxtral ASR evaluation** — P3, effort S. Trigger:
  whisper.cpp median > 1 s on the scripted-phrase bench. Both are
  non-Chinese-authored alternatives.
- [ ] **v1.1 streaming mic** (~1–1.5 s) — after V1 playtest facts exist.
- [ ] **R3′ planning** (openWakeWord hands-free, true barge-in, custom
  voices, TLS on the LAN hop) — plan only after V1 exit tests are recorded.

## Completed

- **LICENSE decision** (carried from 2026-08-25): MIT, decided 2026-09-02 in
  the foundation sprint review; the file lands with that sprint.
