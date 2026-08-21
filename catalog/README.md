# catalog

The adoption pool: a snapshot of skills and agents from permissively-licensed GitHub collections, shipped with the game and refreshable in-game.

- **`catalog.json`** — the snapshot. One entry per adoptable skill/agent: name, kind, description, source repo, license, author, and the raw file URL(s) to download on adoption.
- **`build-catalog.ts`** — regenerates the snapshot from the source repos.

**Sources** (all MIT or Apache-2.0): [anthropics/skills](https://github.com/anthropics/skills) — Apache-2.0 entries only, the four source-available document skills (docx, pdf, pptx, xlsx) are excluded — [obra/superpowers](https://github.com/obra/superpowers), [wshobson/agents](https://github.com/wshobson/agents), [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents).

License and author travel with every entry and are preserved in the installed files and the creature's metadata.
