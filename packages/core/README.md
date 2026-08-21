# @village/core

The shared brain. Everything that is true about the village regardless of how you look at it.

**Owns:**

- **Types** — `Creature`, `Stats`, `PersonalityCard`, `VillageState`, `GameEvent`, wire-protocol types.
- **DNA & appearance** — `SHA-256(kind + name)` → seed → body archetype, part slot choices, palette. Emits a **renderer-neutral `CreatureAppearance`** (archetype id, part ids per slot, two hex colors, species markers). Core never draws anything.
- **Sim rules** — mood/energy drift, XP/level curves, stage transitions, friendship affinity, care-verb effects.
- **File formats** — `SKILL.md` / agent `.md` parsers, serializers, and validators (name rules, required frontmatter, portability-safe field set).
- **Personality prompt assembly** — builds the system prompts used for chat/interview/train from a creature's card.

**Depends on:** nothing but Node stdlib + a hashing lib.

**Must never import:** `server`, `web`, `terminal`, KAPLAY, Fastify, any TUI lib, or anything DOM/terminal-specific.

The rule that makes two front-ends possible: **core decides *what* a creature is; each client decides how to draw it.** `dataviz` has one DNA and one appearance record — the web client composites it from Kenney pixel parts, the terminal client renders the same archetype and palette as ASCII with ANSI color. Both are looking at the same creature.
