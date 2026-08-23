# Voice Investigation: why playtest 2 felt slow, mid, and nonsensical

**Date:** 2026-08-22 (evening session, following the M4 merge)
**Verdicts under investigation:** personalities "mid" · responses "take forever" · dialogue "doesn't make sense" (player: "hello how can u assist me" → design-review: "Hierarchy is broken. Let's fix it. (canned)")

## Method

Systematic debugging: evidence before fixes. The three handoff hypotheses
(timeout, budget, queue contention) were each tested against artifacts the
game already had — the ledger, `~/.skill-village/events.jsonl`, state.json —
plus live calls against the real CLI (2.1.241; the pinned 2.1.239 contract
was re-verified as part of this).

## Evidence and verdicts

1. **Budget exhaustion — refuted.** The ledger showed ~6.3k tokens spent of
   the 500k interactive cap.
2. **"(canned)" = LLM failure — confirmed by arithmetic.** `pickCannedLine`
   picks `(bond + xp) % pool.length` = `(16 + 5) % 20` = index 1 of Finch's
   pool, which is exactly the observed line. The model never wrote it.
3. **The 30s timeout — refuted for the observed failure.** events.jsonl:
   `persona-written` (Finch) at 02:22:28, canned chat at 02:22:47. `chat()`
   awaits the persona flight before dispatching, so the chat call failed in
   ≤18.7s — under the timeout. The real reason was unknowable: `service.ts`
   discarded `reason`/`detail` and nothing logged. **The blindness itself was
   the top defect.**
4. **Preamble cost — confirmed on 2.1.241.** A one-word probe: ~9.6k
   cache-creation + 22.2k cache-read input tokens, 7.5s wall, $0.023 —
   because every `-p` call ships the full Claude Code system prompt and tool
   schemas, with the persona card buried in the user turn.
5. **New: default extended thinking.** 365 thinking tokens for "READY";
   118–228 for a two-sentence quip. A latency/cost tax on every line.
6. **New: silent persona failures.** office-hours and unfreeze chatted with
   **no persona card at all** (their `generatePersona` flights failed
   silently; `ensurePersona` swallows the null). Two of the four creatures
   in the playtest spoke from a bare generic prompt — the core of "mid".
7. **New: nested-session block is just env vars.** With `CLAUDECODE`,
   `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT` stripped from the child
   env, a `claude` spawned inside a Claude Code session authenticates fine.
8. **New: the ledger undercounts.** It records `usage.input_tokens` (~9 per
   preamble call) and never the ~32k cache tokens. With the slim transport
   below, input_tokens ≈ true cost, so the books straighten themselves.

## Fixes shipped (TDD, one cycle per behavior)

- **Slim transport** in `cli.ts`: `--tools=`, `--setting-sources=`,
  `--no-session-persistence`, `MAX_THINKING_TOKENS=0`, and the system prompt
  via `--system-prompt-file` (a temp file — argv stays quoting-safe under
  shell:true; the `=` forms survive Node's space-join). Measured on the real
  CLI: **7.5s/$0.023 → 2.3–2.5s/$0.0016 per chat, ~32k → ~500 input tokens.**
- **Nested-env scrub** in the child env: the village now finds its voice even
  when the server runs inside a Claude Code session.
- **The card became the actual system prompt** (`village.ts` chat,
  `persona.ts` casting call) instead of a footnote under the CLI preamble.
- **Failure observability**: `service.ts` takes a `log` sink (wired to the
  server console in `main.ts`) — one line per failed probe/request with
  reason, detail, duration; plus a `persona-failed` event in events.jsonl so
  card-less creatures are visible.

533 tests + typecheck green. Verified end-to-end through the production
`runCli` against the live CLI from inside a nested session.

## Left open

- Re-playtest (user gate): personalities, latency, and no unexplained
  "(canned)".
- Canned-reply UX: style a failure fallback differently ("lost in
  thought…")? Still the user's design call.
- The 30s timeout is now generous (calls run ~2.5s); revisit only if the
  log shows real timeouts.
