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
| Creature art | Procedurally generated **pixel grids defined in code** — hand-authored archetypes with feature variants and a locked palette (§4). No third-party art assets. |
| Visual reference | The animated trailer in `reference/animation-trailer/` is the visual bible for art, typography, and motion |

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
- **Nickname** — a short given name distinct from the filename (Sparky for `brainstorming/`, Nit for `code-review/`). Written once by Haiku with the personality card; shown above the filename on the creature's sign. The player can rename it.
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

> **Reference implementation:** `reference/animation-trailer/skill-village-scene.jsx` — an animated trailer built as a Claude Design canvas that already realizes this system. It is the visual bible; constants below come from it, and the implementation should copy rather than reinvent them.

**Creatures are pixel grids, not image assets.** A body archetype is an array of strings, one character per pixel, where each character is a *color role* rather than a color:

```js
bean: {
  rows: ['.X...X.', '.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX',
         'XXXKXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.DD.DD.'],
  eyes: [{ c: 1, r: 3 }, { c: 4, r: 3 }], w: 7, h: 10,
}
```

`X` body · `D` feet · `W` eye white · `K` mouth · `A` light accent · `.` transparent. Rendered as one rect per pixel at a unit size `U` (12px in the trailer) with `shapeRendering: crispEdges`.

This replaces the earlier plan to composite Kenney PNG parts, and is better on every axis that matters: **no downloads, no licensing, no part-tagging pass**; a creature is ~10 strings plus three hex colors, so it is trivially serializable and diffable; and because archetype grids are hand-authored, a generated creature cannot come out anatomically wrong.

**Pipeline:** name → SHA-256 seed → archetype → feature variants → palette → a `CreatureAppearance` record (archetype id, variant ids, three hex colors, species markers). Core computes that record and stops; the web package turns it into pixels. Keeping the decision separate from the drawing is what makes the generator unit-testable — the golden-set check below runs on records, not screenshots.

**Anatomy.** Eyes are **not** baked into the grid; they are overlaid at the archetype's `eyes` anchor coordinates so they can blink (lid = a body-colored rect with a dark lash line) and track a target (pupil offset ±3.5px). Everything else — mouth, feet — is grid pixels. This split is what lets one archetype carry every expression.

**The four hard rules** (the fifth, part tagging, is now obsolete):

1. **Hand-authored archetypes.** ~6 grids (`bean`, `mound`, `boxy`, + three more to author), each already a complete, good-looking creature. Generation varies features *within* an archetype; it never assembles a body from loose parts.
2. **Feature variants, not free parts.** Each archetype ships a small set of alternate mouth rows, feet rows, and eye anchor pairs, authored against that grid. A variant is only ever drawn on the archetype it was authored for.
3. **Palette lock.** Body hue from the agent's `color` frontmatter when present, else from DNA. `dark` and `lite` derive from it by fixed lightness offsets, and all three are clamped to the warm band the trailer uses (see §4.1). Two inks are shared and never vary: `#FFF9EE` eye white, `#33241C` pupil and mouth. Clashing colors are unrepresentable.
4. **Golden-set eyeball test.** Because generation is deterministic, the build renders every catalog creature plus 500 random names to a contact-sheet grid for human review before ship.

**Species markers.** Agents fly and get **wings** (`['XXX.', 'XXXX', '.XX.']`, flapping) and **antennae** (a `dark` stalk topped with a `lite` bulb, swaying); skills stay grounded and get a contact shadow. Skills use the rounder archetypes (`bean`, `mound`), agents the angular `boxy`.

**Names.** Every creature has a **nickname** distinct from its filename — Sparky for `brainstorming/`, Nit for `code-review/`, Gus for `debugger.md`. The nickname is written once by Haiku alongside the personality card; the filename is shown beneath it in mono. Skills display with a trailing slash (they are folders), agents with `.md`, which is how a glance tells the two apart.

**Breeding visuals:** offspring inherit archetype from one parent and each feature variant from one parent (chosen by the child-name hash), with a palette interpolated between the two. Family resemblance is real and still deterministic.

### 4.1 Visual identity

| | |
|---|---|
| **Type** | **Pixelify Sans** for creature names, signs, and headings; **IBM Plex Mono** for filenames, dialogue, and UI. |
| **Ground** | `#171310` deep brown-black (letterbox/night), `#3A2E22` ink and outlines, `#F2E5C4` sign cream, `#FFFDF4` bubble white, `#8A6B4A` wood. |
| **Accent** | `#D97757` clay — the one warm highlight; used sparingly. |
| **Nature** | `#7FA85F` / `#8FB86B` foliage, `#9DBA77` moss. |
| **Creature hues** | Mid-saturation warm pastels: `#E58C68` coral, `#B79FD6` lilac, `#9DBA77` sage, `#7FBF8A` mint, `#E2B45E` gold, `#E0A3B2` rose, `#7FB6D9` sky, `#6FBCAD` teal. |

Village props (houses, trees, grass tufts, signs) are **flat colored rectangles**, not sprites — the trailer builds every one of them from plain divs. No tileset is required, which removes the last reason to ship third-party art.

### 4.2 Motion vocabulary

Motion is where the personality lives, and the trailer's constants are tuned. Implement these in KAPLAY rather than inventing new ones:

- **Idle breathing** — `sy = 1 + sin(T·2.0 + φ)·0.028`, with `sx = 1 − (sy−1)·0.7` so volume is preserved. Flyers breathe shallower and faster (`·3.1`, `0.02`).
- **Blink** — `(T·1000 + φ·1700) mod 3400 < 130`: a 130ms blink roughly every 3.4s.
- **Gaze** — a slow sine picks left/centre/right; when the player interacts, creatures look at the cursor or speaker instead.
- **Hop** — a 2.6s cycle: anticipation squash to 0.84 over 0.18s, an arc of `−sin(q·π)·64px` while stretched to 1.07, then a landing squash that recovers over 0.23s.
- **Shadow** — width scales with height (`clamp(1 + dy/130, 0.55, 1)`), which is what sells the hop as real.
- **Wings** — `sin(T·16 + φ·3)·26 − 8` degrees, mirrored per side. **Antennae** — `sin(T·2.3 + φ)·12` degrees.
- **Phase offset `φ`** — every creature carries one, so the village never moves in lockstep. This single detail is most of the "living community" feeling.
- **Punctuation** — `PuffBurst` (five cream squares on an expanding ring) on landing; floating `z` glyphs for sleep; speech bubbles that pop in on `easeOutBack` over 0.38s and shrink out over 0.28s.

**Behaviours are data,** not code paths: a creature carries flags like `hopper`, `asleep`, `fly: 'roam' | 'hover'`, and the renderer reads them. Mood and energy (§2.2) select which flags are active, so a well-cared-for skill hops and a neglected one dozes.

### 4.3 First-run sequence

The trailer doubles as the game's cold open, and it is worth building: a terminal types `ls skills/ agents/`, then `npx skill-village`; the terminal blooms outward and fades as the ground rises; each filename flies out of the listing and lands as a creature's sign. Tagline: *"your skills folder… is alive."* Played once on first run — and replayable from the About screen — it teaches the core premise in fifteen seconds without a word of instruction.

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

**`@village/web`** — Vite + TypeScript + **KAPLAY** (MIT). Renders the scrollable pixel-art village from state streamed over WebSocket and posts player intents over REST. Draws each creature from its `CreatureAppearance` by painting the archetype grid a pixel at a time, then animates it with the §4.2 vocabulary. It holds no game truth: everything it shows came from the server, and everything the player does goes back as an intent.

- **Repo layout:**

```
packages/
  core/       shared brain — types, DNA→appearance, sim rules, file-format
              parsers/validators, personality prompt assembly. Pure logic.
  server/     sim engine, LLM service, file bridge, hook ingest, scheduler,
              state store. Depends on core only.
  web/        KAPLAY browser game + grid renderer + motion vocabulary.
reference/    the animation trailer — visual bible for art and motion.
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
| Ido-Levi/claude-code-tamagotchi | MIT | Reference/lift: stat-decay engine patterns |
| siegerts/tama96 | MIT | Reference: lifecycle/care state machine |
| KAPLAY | MIT | Client game framework |
| Pixelify Sans, IBM Plex Mono | OFL | Typography |
| anthropics/skills (Apache-2.0 entries only) | Apache-2.0 | Catalog seed (document skills excluded) |
| obra/superpowers | MIT | Catalog seed |
| wshobson/agents | MIT | Catalog seed |
| VoltAgent/awesome-claude-code-subagents | MIT | Catalog seed |

**No third-party art is shipped.** Every creature, prop, and effect is drawn from grids and rectangles defined in this repo (§4), which removes an entire class of licensing and attribution obligation. The earlier plan to use Kenney and sparklinlabs CC0 packs — and the vscode-pets sprites before them — is dropped as unnecessary.

Rules: preserve upstream LICENSE/attribution in the catalog metadata and installed files; an in-game "About" credits screen lists the catalog sources and the recycled engine references.

## 13. Testing

- **Unit:** DNA→parts determinism (fixed vectors), palette-lock math (property test: no output outside the band), XP/decay math, frontmatter validators against fixture files copied from the real repos (valid + broken).
- **Integration:** fake `claude` binary (scripted JSON responses) driving LLMService — routing, ledger, cap fallback; File bridge against a sandbox fake `$HOME` — import, adopt, hatch-install, release/restore, watcher sync; hook ingest endpoint.
- **Grid integrity:** a test asserts every archetype grid is rectangular, uses only known color-role characters, has in-bounds eye anchors, and that every feature variant the generator can emit was authored for the archetype it lands on — so a valid creature can never fail to draw.
- **E2E smoke:** boot server + headless browser: village renders, an adoption completes into the sandbox `~/.claude`, the new creature appears.
- **Golden set:** the §4 contact-sheet render script, run as a build step; failures are reviewed by a human, not asserted.

## 14. Milestones (one plan, ordered)

1. **M1 Core** — `@village/core`: types, DNA→appearance, authoring the ~6 archetype grids and their feature variants, sim rules, file-format parsers/validators. Pure logic, fully unit-tested, no server or client yet.
2. **M2 Server** — state store, file bridge + first-run import, sim ticking, REST + WebSocket API. Verified with API calls only.
3. **M3 Web village** — KAPLAY scene, grid renderer, the §4.2 motion vocabulary, four zones, founding villagers visibly alive. *The bar for this milestone is the trailer: if the village doesn't feel like `reference/animation-trailer/`, it isn't done.*
4. **M4 Voice** — LLM service, personality cards + nicknames, chat, canned pools, budget meter, silent-movie mode.
5. **M5 Adoption** — catalog build script + snapshot, Adoption Center, install/release/restore.
6. **M6 Hatchery** — interview flow, draft/validate/review/install, export.
7. **M7 Lineage** — breed (incl. DNA splicing), train (diff flow).
8. **M8 Live reactions** — hook consent flow, ingest, XP/friendship from real sessions.
9. **M9 Autonomous life** — headless ticking, scheduler, sub-budget, notice board.
10. **M10 Polish** — golden-set pass, the §4.3 cold-open sequence, sounds/FX, About/credits.

## 15. Out of scope (v1)

- Plugin-provided skills as creatures; marketplace publishing from in-game; multiplayer/shared villages; mobile; Electron/tray packaging; creature death (by design, not scope).
