# @village/core

The shared brain. Everything that is true about the village regardless of who is asking.

**Owns:**

- **Types** — `Creature`, `Stats`, `PersonalityCard`, `VillageState`, `GameEvent`, wire-protocol types.
- **Bodies and crowns** — the hand-authored art, as data. Six body grids (`pip`, `round`, `lanky`, `bean`, `mound`, `boxy`) as string arrays of color-role characters with eye anchors and tapered flight undersides; five crowns (`none`, `ears`, `crest`, `tuft`, `horns`) defined parametrically from body width so one definition fits every body; and `lanky`'s four flight postures.
- **DNA & appearance** — `SHA-256(kind + name)` → seed → body, crown (re-rolled if the pair is denied), feature variants, palette. Emits a `CreatureAppearance` (body id, crown id, variant ids, hex colors, species flag). Core decides what a creature looks like; it never draws it.
- **Sim rules** — mood/energy drift, XP/level curves, stage transitions, friendship affinity, care-verb effects.
- **File formats** — `SKILL.md` / agent `.md` parsers, serializers, and validators (name rules, required frontmatter, portability-safe field set).
- **Personality prompt assembly** — builds the system prompts used for chat/interview/train from a creature's card.

**Depends on:** Node stdlib (`node:crypto` for hashing) and `yaml` for frontmatter parsing. Nothing else.

**Must never import:** `server`, `web`, KAPLAY, Fastify, or anything DOM- or filesystem-specific.

Why the boundary is worth keeping: everything here is a pure function of its inputs, so the appearance generator, the sim math, and the file validators can all be tested without booting a server or a browser. The golden-set check that keeps creatures from looking cursed runs against these functions directly.
