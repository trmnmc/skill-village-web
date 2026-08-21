# @village/server

The one process that is both game server and daemon. Holds all game truth; clients render and send intents.

**Owns:**

- **Sim engine** — ticks core's rules (2s with a client attached, 60s headless). Broadcasts state diffs.
- **LLM service** — the single door for every model call: shells out to the local `claude` CLI (auth inherited from the user's Claude Code login), routes Haiku vs. session-default model, enforces the daily budget ledger and caps, queues calls, falls back to canned lines.
- **File bridge** — import/adopt/install/release/export against `~/.claude` (and project `.claude`), plus a watcher so manual installs and external edits show up live. Uses core's validators; never writes without a confirmed intent.
- **Hook ingest** — `POST /events` endpoint for Claude Code hook events (skill invoked, session start/end).
- **Autonomous scheduler** — the slow LLM heartbeat for while-you're-away scenes, on its own sub-budget.
- **State store** — atomic JSON writes + rolling backup + append-only event log in `~/.skill-village/`.

**API surface (identical for both clients):** REST for actions (`/api/creatures`, `/api/chat`, `/api/hatch`, `/api/adopt`, …) and a WebSocket for live state.

**Depends on:** `@village/core`.

**Must never import:** `web` or `terminal`. If the server needs to know how something looks, the design is wrong.
