# @village/server

The one process that is both game server and daemon. Holds all game truth; clients render and send intents.

**Owns:**

- **State store** — atomic JSON writes with a rolling backup and corrupt-file recovery, plus an append-only JSONL event log, all under `~/.skill-village/`.
- **File bridge** — scans `~/.claude/skills` and `~/.claude/agents` (and the project's `.claude/` when launched inside one), turns valid files into creatures, and keeps a shadow copy of each so an externally deleted file still has a last-known copy to archive.
- **Sim engine** — ticks the rules from `@village/core`: mood and energy drift, stage transitions, friendship. Every tick is a pure function of state and a timestamp.
- **API** — Fastify REST for player intents, WebSocket for live state.

**Depends on:** `@village/core`.

**Must never import:** `@village/web`. If the server needs to know how something looks, the design is wrong.

**Safety:** M2 never writes to `~/.claude`. It reads that directory and writes only inside its own data directory. Installing and releasing real files arrives in M5.

**Determinism:** no module here reads the clock. `now` is a parameter, supplied at the edge, which is what makes decay and tick behaviour testable.
