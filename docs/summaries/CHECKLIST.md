## Checklist
- [x] M3 executed, reviewed, merged, pushed
- [x] Playtest fixes (ground/signs/text) shipped
- [x] Public repo + Pages landing page live
- [x] M4 plan written, self-reviewed, pushed (`c6f0dbc`)
- [ ] Execute M4 plan via subagent-driven development (12 tasks; branch `m4-voice` off main)
- [ ] After M4 Task 8: real-terminal smoke test (`npm run dev` from a PLAIN terminal, not inside Claude Code — chat must return `source: "llm"`)
- [ ] Playtest M4 with the user (voice quality, bubble sizes — boxes must hug text)
- [x] M4.5 Peddler spec + plan written, committed (`69a0fca`, `1109f29` on `claude/art-direction-minigame-c0e07b`)
- [ ] Execute M4.5 plan via subagent-driven development (12 tasks; ONLY after M4 merges — it consumes M4's `LLMService`, `dayOf`, `migrateState`)
- [ ] Playtest M4.5 with the user (peddler reads as a stranger and stands grounded; case overlay; frames hug sketches)
- [ ] LICENSE decision (user's call; MIT suggested if reuse/PRs wanted)
- [ ] Optional: refresh Pages landing page after M4 (nickname signs, chat screenshot)

_Updated: 2026-08-25 — claude/art-direction-minigame-c0e07b_
