# @village/core

The shared brain. Everything that is true about the village regardless of who is asking.

**Owns:**

- **Types** — `Creature`, `Stats`, `PersonalityCard`, `VillageState`, `GameEvent`, wire-protocol types.
- **Archetype grids** — the hand-authored pixel-grid bodies (`bean`, `mound`, `boxy`, …) as string arrays with color-role characters, their eye anchors, and their feature variants. The art itself lives here, as data.
- **DNA & appearance** — `SHA-256(kind + name)` → seed → archetype, feature variants, palette. Emits a `CreatureAppearance` (archetype id, variant ids, three hex colors, species markers). Core decides what a creature looks like; it never draws it.
- **Sim rules** — mood/energy drift, XP/level curves, stage transitions, friendship affinity, care-verb effects.
- **File formats** — `SKILL.md` / agent `.md` parsers, serializers, and validators (name rules, required frontmatter, portability-safe field set).
- **Personality prompt assembly** — builds the system prompts used for chat/interview/train from a creature's card.

**Depends on:** nothing but Node stdlib + a hashing lib.

**Must never import:** `server`, `web`, KAPLAY, Fastify, or anything DOM- or filesystem-specific.

Why the boundary is worth keeping: everything here is a pure function of its inputs, so the appearance generator, the sim math, and the file validators can all be tested without booting a server or a browser. The golden-set check that keeps creatures from looking cursed runs against these functions directly.
