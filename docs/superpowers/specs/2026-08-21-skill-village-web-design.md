# Skill Village — Design Spec

**Date:** 2026-08-21
**Status:** Approved design, pending implementation plan
**Working title:** "Skill Village" (placeholder — rename freely)
**Platform:** Local web app (this project). A terminal TUI variant of the same concept is designed separately in `Claude-Projects/agent-skills-tamagotchi` — independent codebase, independent decisions.

## 1. Overview

A Tamagotchi-style game, running locally, where every Claude Code **skill** and **agent** on your machine is a living creature with a personality, living in a shared pixel-art village. Caring for creatures is fun on its own, but the game is also a real builder: playing it yields genuine, installable Claude Code skills (`SKILL.md` folders) and agents (frontmatter `.md` files).

The core loop nobody has built (verified by a GitHub scan on 2026-08-21): **the creature IS the exportable skill/agent.** Everything else — pet mechanics, sprites, seed content — is recycled from permissively-licensed open source (see §12).

### Decisions log (from brainstorming)

| Decision | Choice |
|---|---|
| Where creatures come from | Both: adopt existing (GitHub collections) **and** raise/breed new ones |
| Form factor | Local web app: one Node server (also the daemon) + a KAPLAY browser game, split into `core` / `server` / `web` packages |
| Personality engine | ~80% LLM / 20% procedural; Haiku for fast chatter; auth inherited from the user's existing Claude Code login (no login screen) |
| Stakes | Gentle liveness + growth: moods/needs evolve with absence, creatures never die, levels never decay, no work is ever lost |
| Scope | Full "Living World" (village + live session reactions + autonomous life), built in one implementation push with ordered milestones |
| Creature art | Full mix-and-match generation from Kenney Monster Builder parts (CC0), governed by five anti-cursed rules (§4) |

## 2. Game design

### 2.1 The fantasy

Your Claude Code setup is a living village. Using your tools feeds their creatures; neglect makes them scruffy (never dead); building new tooling means hatching new villagers.

### 2.2 Creatures

Two species, visually distinct:

- **Skills** — grounded, rounder critters. Source of truth: a `skills/<name>/SKILL.md` folder.
- **Agents** — winged or antenna'd (they go off and do things). Source of truth: an `agents/<name>.md` file.

Each creature has:

- **DNA** — deterministic: `SHA-256(kind + canonical name)` seeds all appearance choices. Same skill → same creature on any machine.
- **Appearance** — generated from DNA per §4.
- **Personality card** — written once at import by Haiku after reading the skill/agent content: archetype, voice, quirks, 2–3 likes/dislikes. Stored in game state; used as the system prompt for everything this creature ever says. Stable across re-syncs (external file edits update knowledge, not identity).
- **Stats** — `mood`, `energy` (drift down with absence; care restores), `bond` (with the player; only rises), `xp`/`level` (only rise), `friendships` (per-creature affinity scores).
- **Stage** — Egg → Hatchling → Adult → Elder. Hatchling→Adult happens the moment its file is installed and valid. Adult→Elder at a level threshold. Visual growth per stage (size, accessories).

**Gentle liveness rules:** mood/energy decay toward "scruffy/sleepy" over ~3 days of absence and bottom out there — visual and dialogue consequences only. Nothing dies, nothing is deleted, levels never drop.

**XP sources:** its skill/agent used in a real session (largest, via hooks §9), being talked to, care actions, training sessions.

### 2.3 The village

One scrollable pixel-art screen with four zones:

1. **Homes** — installed creatures wander, idle, nap, and chat in speech bubbles.
2. **Adoption Center** — catalog creatures (from GitHub collections, §6.2) waiting for homes; also where released creatures return.
3. **Hatchery** — eggs and in-progress hatchlings (§6.3).
4. **Notice board** — the "while you were away" digest, composed from the event log.

**Community dynamics:** creatures used together in the same real session gain friendship affinity; friends hang out spatially, gossip (Haiku one-liners), and occasionally get LLM-authored scenes (§10) the player can eavesdrop on.

### 2.4 Care verbs

- **Pet / play** — free, procedural; small mood/bond gains.
- **Chat** — the main verb; the creature converses in its personality-card voice (Haiku).
- **Train** — a deeper conversation (session-default model) that ends in proposed edits to the creature's real skill/agent file, shown as a diff, applied only on explicit confirmation. The creature literally gets better at its job.

No care verb ever modifies files without the confirm step; only Train touches files at all.

## 3. Modes and degradation ladder

The game must be playable at every rung:

1. **Full** — CLI authed, budget available: everything works.
2. **Budget exhausted** — LLM verbs fall back to canned lines drawn from the personality card; sim/care/adopt-install all still work. UI shows the meter at zero.
3. **Silent-movie mode** — `claude` CLI missing or unauthenticated: procedural wandering, canned speech, import/adopt/export still work (they're file operations). Persistent banner explains how to sign in to Claude Code. Hatch/breed/train are disabled with an explanatory tooltip (they require the LLM).

## 4. Creature generation (anti-cursed by construction)

**Pipeline:** name → SHA-256 seed → body archetype (1 of ~6) → parts (eyes, mouth, limbs, accessory — only tag-compatible ones) → palette (1 body hue + 1 accent) → a `CreatureAppearance` record (archetype id, part ids per slot, two hex colors, species markers).

Core computes that record and stops; the web package turns it into pixels. Keeping the decision separate from the drawing is what makes the generator unit-testable — the golden-set check below runs on records, not screenshots.

**Art source:** Kenney **Monster Builder Pack** (CC0, ~170 mix-and-match parts, one consistent pixel style/scale), supplemented by Kenney Tiny Dungeon and sparklinlabs/superpowers-asset-packs (both CC0) for village tiles/props/FX.

**The five hard rules:**

1. **Anatomy templates.** ~6 hand-made body archetypes with fixed part *slots* (anchor points). Randomness picks *which* part, never *where* it goes.
2. **Curated part sets.** A one-time tagging pass over every part (which archetypes/slots it fits, skill-vs-agent affinity). Untagged combinations cannot be generated. This tagging pass is an explicit build task.
3. **Palette lock.** Body hue from the agent's `color` frontmatter when present, else from DNA; accent hue offset by a fixed harmony rule; both clamped to a pastel saturation/lightness band. Clashing colors are unrepresentable.
4. **Symmetry & scale.** Paired parts mirror; all parts render at one pixel scale.
5. **Golden-set eyeball test.** Because generation is deterministic, the build includes a script that renders every catalog creature plus 500 random names to a contact-sheet grid for human review; bad combos get their tags fixed before ship.

**Species markers:** agents always receive a wings-or-antennae accessory slot; skills never do.

**Breeding visuals:** offspring DNA splices parent part choices (each slot inherits from one parent, chosen by the child-name hash), so family resemblance is real and still deterministic.

## 5. LLM layer

- **Transport:** shell out to the local `claude` CLI in headless mode (`-p`, `--output-format json`) via the Agent SDK pattern. Auth is inherited from the user's existing Claude Code login — no login screen, no API keys. Startup runs a probe call; failure → silent-movie mode.
- **Model routing:**
  - **Haiku** (`--model haiku`): chatter, greetings, gossip lines, autonomous scenes, personality cards.
  - **Session default model** (no override): hatching interviews, training edits, breeding remixes.
- **Budget ledger:** every call goes through one `LLMService` which records usage (from the CLI's JSON usage output) into a daily ledger. Two caps, both configurable in-game: interactive (default 500k tokens/day) and autonomous (default 100k tokens/day, master off-switch, default **off** until the player enables it). At cap: graceful canned-line fallback, never an error dialog.
- **Queue:** calls are serialized (small concurrency, e.g. 2) so a chatty village can't stampede the CLI.
- **Canned-line pools:** at personality-card creation, Haiku also writes ~20 idle/greeting/mood lines per creature, stored in game state. These power procedural chatter (the free 20%) and every fallback mode.

## 6. Builder mechanics

### 6.1 First-run import

Scan `~/.claude/skills/*/SKILL.md` and `~/.claude/agents/**/*.md` (plus the current project's `.claude/skills` and `.claude/agents` when launched inside a project). Each valid file becomes a founding villager. Personality cards are generated lazily (on first interaction) to keep first-run cost near zero. Invalid files (bad frontmatter) are listed in a quiet "couldn't move in" note, never blocking.

Plugin-provided skills are **out of scope** for v1 (future: read-only "visitors").

### 6.2 Adopt

- Ships with a **catalog snapshot** (JSON) built from MIT/Apache sources: anthropics/skills (Apache-2.0 entries only — the four source-available document skills docx/pdf/pptx/xlsx are **excluded**), obra/superpowers, wshobson/agents, VoltAgent/awesome-claude-code-subagents. Each entry: name, kind, description, source repo URL, license, file URL(s).
- Catalog entries render as creatures (same DNA pipeline) waiting in the Adoption Center.
- **Adopting**: downloads the real file(s) from the source repo, validates them (§8), asks user-level (`~/.claude/…`) vs project-level (`./.claude/…`), installs, and records source URL + license + author in the creature's metadata. Installed files are preserved verbatim.
- A "refresh catalog" action re-fetches the catalog index from GitHub raw URLs.

### 6.3 Hatch

1. Player starts an egg (choosing species: skill or agent).
2. Egg hatches into a Hatchling that **interviews the player in character**: what should I do? when should someone call me? walk me through an example? (3–6 questions, session-default model.)
3. The LLM drafts the real file: `SKILL.md` (folder) or agent `.md`.
4. The game validates it (§8), shows the full file in a review panel, and only installs on explicit approval. Name collisions prompt an in-character rename.
5. On install, the Hatchling becomes an Adult in Homes.

An egg can be abandoned mid-interview and resumed later; nothing is written to `~/.claude` until final approval.

### 6.4 Breed

Pick two Adults → session-default model remixes their two source files' purposes into an offspring concept → short interview-lite to confirm direction → same draft/validate/review/install flow as Hatch. Offspring appearance splices parent DNA (§4).

### 6.5 Train

Chat with a creature about improving it → the LLM proposes edits to its real file → diff view → explicit confirm → file updated (and the file watcher re-sync makes the creature "feel" it). Declining costs nothing.

### 6.6 Release & export

- **Release:** moves the creature's files out of `~/.claude` into the game's archive (`<data-dir>/archive/<kind>/<name>/`, content preserved verbatim) and returns the creature to the Adoption Center flagged "formerly yours" — re-adoptable anytime, restoring the archived files.
- **Export:** any creature → a zip (or folder copy) of its files, valid for sharing or claude.ai upload (§8 portability baseline).

## 7. Architecture

One **Node + TypeScript** process = game server + daemon:

| Component | Responsibility |
|---|---|
| **Sim engine** | Procedural heartbeat: movement targets, mood/energy drift, friendship updates, event scheduling. Tick every 2s with a client connected, 60s headless. All game truth lives server-side. |
| **LLM service** | §5. The single door for every model call: routing, ledger, queue, fallbacks. |
| **File bridge** | Import/export/validate for both formats; `chokidar` watcher on the `~/.claude` (and project `.claude`) skill/agent dirs — manual installs "move into town" live; external edits re-sync; external deletes auto-release the creature (its last-known copy goes to the archive; purgeable from settings). |
| **Hook ingest** | §9. Local HTTP endpoint for Claude Code hook events. |
| **Autonomous scheduler** | §10. |

- **Server:** Fastify + `ws`. Default port **8262** ("TAMA" on a phone keypad), configurable.
- **State:** single game-state JSON with atomic writes (write-temp-then-rename) + a rolling backup, plus an append-only JSONL event log, in `~/.skill-village/` — fully separate from `~/.claude`, so the game can never corrupt real config. Creature records store a *pointer* to their source file; the file remains the single source of truth for what the tool does.

### 7.1 The client

**`@village/web`** — Vite + TypeScript + **KAPLAY** (MIT). Renders the scrollable pixel-art village from state streamed over WebSocket and posts player intents over REST. Composites each creature at load from Kenney parts per its `CreatureAppearance`. It holds no game truth: everything it shows came from the server, and everything the player does goes back as an intent.

- **Repo layout:**

```
packages/
  core/       shared brain — types, DNA→appearance, sim rules, file-format
              parsers/validators, personality prompt assembly. Pure logic.
  server/     sim engine, LLM service, file bridge, hook ingest, scheduler,
              state store. Depends on core only.
  web/        KAPLAY browser game + Kenney sprite compositor.
assets/       Kenney parts + parts.manifest.json (tag curation), village tiles.
catalog/      adoption snapshot JSON + build script.
docs/         specs.
```

Each package carries a README stating what it owns and what it must never import; those boundaries are the design, not documentation of it. The payoff for keeping `core` free of both server and browser concerns is that the generator, sim math, and file validators are testable as plain functions — see §13.

## 8. File formats & validation (verified against docs 2026-08-21)

- **Skills:** `<location>/skills/<dir-name>/SKILL.md`; dir name = invocation name. All frontmatter optional; the game always emits `name` + `description` (+ `license` for adopted/bred content). **Portability baseline:** emitted skills use only `name, description, license, compatibility, metadata, allowed-tools` — the set accepted by claude.ai upload and `package_skill.py` — so exports never hit packaging errors.
- **Agents:** `<location>/agents/<name>.md`. Required: `name` (lowercase + hyphens, no leading `-`, no `:`), `description`. Optional passthrough: `tools`, `model`, `color`, etc. The game maps `color` ↔ creature palette (writing it on hatch, reading it on import).
- **Validator:** one shared module used by import, adopt, hatch, breed, and train. Invalid files are never installed; Claude Code silently skips bad agent files, so the game must catch problems before it writes.
- Docs: https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/sub-agents

## 9. Claude Code integration (live reactions)

- With **explicit in-game consent**, the game adds hook entries to `~/.claude/settings.json` that POST session events (skill invoked, subagent used, session start/end, tool results) to `http://localhost:8262/events`. Exact hook event names are confirmed against current docs at implementation time.
- The hook command is a fire-and-forget curl with a ~100ms timeout and always exits 0 — a closed village can never slow or break a real session.
- Effects: the creature whose skill/agent was used animates (beams on success, frets during error loops), gains XP, and co-used creatures gain friendship. Events also land in the log → notice board.
- Uninstalling the hooks is a single in-game toggle that edits settings.json back (with the same consent flow).

## 10. Autonomous life

- The server process keeps running headless (started manually or via optional launch-at-login the player can enable; out-of-the-box it simply runs while started).
- The **procedural** sim is always free: wandering, drift, friendship ticks, and templated micro-events ("Scout napped in the Hatchery").
- The **LLM** layer wakes on a slow scheduler: 2–5 moments/day (configurable), each a Haiku-authored scene between friends or a creature "discovery" (e.g., Scout suggests a catalog creature you might adopt, chosen from real catalog data). Charged to the autonomous sub-budget (default **off**; hard daily cap when on).
- Everything lands in the event log; opening the village composes the notice-board digest from real logged events — nothing is retroactively faked.

## 11. Error handling & safety rules

- **Never-lose-anything:** the game never destroys user content. Release = archive + move out. External delete = auto-release with archived last-known copy. Uninstall/purge of archives is an explicit settings action.
- **Nothing writes to `~/.claude` without a confirm step** (install, train diff, hook consent, release).
- **Atomicity:** state saves are atomic with rolling backup; a corrupt state file falls back to the backup with a notice.
- **Collisions:** install-time name collisions prompt rename (validated live against §8 rules).
- **Offline:** catalog refresh and adoption downloads fail soft (cached snapshot keeps working); LLM failures retry once then fall back to canned lines.
- **Multi-writer:** if a second server instance is launched, it detects the port/pidfile and opens the existing instance instead.

## 12. Recycled assets & licensing

| Asset | License | Use |
|---|---|---|
| Kenney Monster Builder / Tiny Dungeon (kenney.nl) | CC0 | Creature parts, tiles |
| sparklinlabs/superpowers-asset-packs | CC0 | Village tiles, props, FX, sounds |
| Ido-Levi/claude-code-tamagotchi | MIT | Reference/lift: stat-decay engine patterns |
| siegerts/tama96 | MIT | Reference: lifecycle/care state machine |
| KAPLAY | MIT | Client game framework |
| anthropics/skills (Apache-2.0 entries only) | Apache-2.0 | Catalog seed (document skills excluded) |
| obra/superpowers | MIT | Catalog seed |
| wshobson/agents | MIT | Catalog seed |
| VoltAgent/awesome-claude-code-subagents | MIT | Catalog seed |

Rules: preserve upstream LICENSE/attribution in the catalog metadata and installed files; an in-game "About" credits screen lists art + catalog sources. vscode-pets sprites are **not** used (cat-asset restriction; unnecessary given Kenney).

## 13. Testing

- **Unit:** DNA→parts determinism (fixed vectors), palette-lock math (property test: no output outside the band), XP/decay math, frontmatter validators against fixture files copied from the real repos (valid + broken).
- **Integration:** fake `claude` binary (scripted JSON responses) driving LLMService — routing, ledger, cap fallback; File bridge against a sandbox fake `$HOME` — import, adopt, hatch-install, release/restore, watcher sync; hook ingest endpoint.
- **Asset coverage:** a test asserts every archetype and part id the generator can emit has a corresponding file in `assets/parts/` and a manifest tag, so a valid creature can never fail to draw.
- **E2E smoke:** boot server + headless browser: village renders, an adoption completes into the sandbox `~/.claude`, the new creature appears.
- **Golden set:** the §4 contact-sheet render script, run as a build step; failures are reviewed by a human, not asserted.

## 14. Milestones (one plan, ordered)

1. **M1 Core** — `@village/core`: types, DNA→appearance, part-tagging pass over the Kenney set, sim rules, file-format parsers/validators. Pure logic, fully unit-tested, no server or client yet.
2. **M2 Server** — state store, file bridge + first-run import, sim ticking, REST + WebSocket API. Verified with API calls only.
3. **M3 Web village** — KAPLAY scene, sprite compositor, four zones, founding villagers visibly alive.
4. **M4 Voice** — LLM service, personality cards, chat, canned pools, budget meter, silent-movie mode.
5. **M5 Adoption** — catalog build script + snapshot, Adoption Center, install/release/restore.
6. **M6 Hatchery** — interview flow, draft/validate/review/install, export.
7. **M7 Lineage** — breed (incl. DNA splicing), train (diff flow).
8. **M8 Live reactions** — hook consent flow, ingest, XP/friendship from real sessions.
9. **M9 Autonomous life** — headless ticking, scheduler, sub-budget, notice board.
10. **M10 Polish** — golden-set pass, sounds/FX, About/credits, first-run experience.

## 15. Out of scope (v1)

- Plugin-provided skills as creatures; marketplace publishing from in-game; multiplayer/shared villages; mobile; Electron/tray packaging; creature death (by design, not scope).
