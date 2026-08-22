# Roadmap Reconciliation — Projects-Village Remap × M4-M10

**Date:** 2026-08-22
**Status:** approved in brainstorm; supersedes §14 of `2026-08-21-skill-village-web-design.md`
**Inputs:** the projects-village remap brainstorm (branch `claude/skills-projects-agents-mechanics-36973e`, handoff `docs/summaries/pause-2026-08-22-projects-village-remap.md`) and the original design spec.
**Feeds:** the remap design spec (to be written at `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`).

## 1. The cast

Two roles:

- **Projects** are the villagers. Each real folder under `~/.claude/projects`
  becomes one (worktree checkouts fold into their parent). They are the
  tamagotchi: they have health, they need real work, they are never finished.
- **Helpers** are skills and agents folded into one winged role. A helper is
  not a villager — it is a project's visible power. Helpers appear beside
  **every** project that uses them, copies and all; the project is the living
  thing, its helpers are its aura. A project is a genie, and the more skills
  and agents it commands, the larger its presence in the village.

Under the hood `kind` keeps distinguishing skill from agent (the file bridge
needs it: `SKILL.md` folder vs agent `.md`), and agents keep their subtle
visual tell. A new role layer sits above kind.

## 2. The zones

All four zones survive; each now serves both roles.

| Zone | Was | Becomes |
|---|---|---|
| Homes | skills wander | projects live here; their helpers appear beside them |
| Hatchery | skill eggs | eggs of both kinds: helper eggs and project eggs |
| Adoption Center | catalog skills | helper catalog + retired projects ("formerly active") + starters |
| Notice Board | away-digest | unchanged |

## 3. The verbs

Every builder verb has a meaning per role.

| Verb | Helper | Project |
|---|---|---|
| Hatch | interview → SKILL.md / agent file | interview → real folder (player picks the parent dir): CLAUDE.md, README stub, `git init`. Nothing written until approved. |
| Adopt | download from the GitHub catalog | three sources: (a) take back a retired project, (b) starter templates that pre-fill the hatch interview, (c) an arbitrary GitHub repo cloned into a folder the player chooses |
| Breed | remix two helpers' files | **backlog, not v1** — spinoff-from-two-projects is parked |
| Train | diff to its SKILL.md, applied on explicit yes | same flow, diff to the project's CLAUDE.md |
| Release | files moved to the game archive (unchanged) | **status only — the folder is never touched.** Moves to the Adoption Center, stops decaying, stops nagging. Re-adopt flips it back. |
| Export | zip its files | charter zip by default (CLAUDE.md + the hatch-interview brief + stats); whole-folder zip on request |

**The safety line, stated once:** the game touches real project folders in
exactly three places — hatch (creates one), train (edits CLAUDE.md), and
adopt-from-GitHub (creates one by cloning). All three show exactly what will
be written and wait for an explicit yes. Release never moves
project files. The never-lose-anything rule is unchanged.

## 4. Voice: who talks

You chat with the **project**. Each project gets its own personality card and
voice, written from its CLAUDE.md, README, and recent work. Helpers drop to
flavor lines only — short canned chirps, no full chat.

M4 executes unchanged on today's cast; its chat machinery (CLI runner, budget
ledger, queue, chat panel, speech bubble) is role-agnostic and is reused
wholesale. When projects move in, new cards are generated for them; the
helpers' M4 cards live on as their flavor-line pools.

## 5. The work signal

The game reads Claude Code's own session logs (`~/.claude/projects/**/*.jsonl`,
read-only) to learn what you worked on. That feeds everything: project health,
XP, and which helpers belong to which project. It needs no setup and sees work
done while the game was closed.

The live ping (hooks in `settings.json` that POST events instantly) is demoted
to an optional add-on in M8: it adds only immediacy — a creature reacting the
moment its skill fires — on top of numbers the log scanner already owns. If
hooks are off, nothing is lost but the instant.

## 6. Milestones (supersedes §14 of the original spec)

| # | Milestone | Ships |
|---|---|---|
| M4 | Voice | Runs now, per the existing plan (`docs/superpowers/plans/2026-08-22-m4-voice.md`). Chat, cards, canned pools, budget meter, silent-movie mode — on today's cast. |
| M5 | The projects move in | Discovery from `~/.claude/projects` (worktree folding, name resolution), log scanning as the work signal, projects in Homes with helpers beside every project that uses them. |
| M6 | Care | Health and mood from work recency; signs say why ("last worked 12 days ago"); petting builds bond; project personality cards + chat-with-the-project; retire/re-adopt. |
| M7 | Builders | Project eggs (full scaffold), train-a-project (CLAUDE.md diff), three-source Adoption Center, export (charter default, whole-folder option). |
| M8 | Live wire + hard mode | Optional instant-ping hooks; the full-consequence decay toggle (off by default). |
| M9 | Autonomous life | Unchanged from the original spec. |
| M10 | Polish | Unchanged from the original spec. |

**Backlog (explicitly parked):** breeding two projects into a spinoff.

## 7. Handed to the remap spec (M5/M6 design work, not decided here)

- Helper name resolution: transcripts contain plugin-prefixed skills
  (`anthropic-skills:xlsx`) and built-in subagent types with no file on disk.
- Whether plain git commits made outside Claude Code count toward health, or
  the framing is "the village sees what Claude sees".
- Motion design for multi-presence helpers (same helper drawn at several
  projects) and what friendship means when villagers are projects.
- Transcript-parse cost: incremental scanning with cached per-file results.
