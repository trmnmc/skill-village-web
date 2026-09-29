# Checklist

- [x] R1+R2 robot embodiment software executed via SDD (14 tasks, reviews, fix waves, final review clean)
- [x] Rebase over main drift: STATE_VERSION 4 chain, token repaint, wander porch (`79bca20`)
- [x] Merged to main (`842ca08`) and pushed
- [ ] Web playtest verdict from the user (stack RUNNING at http://localhost:65347 — drag villager onto robot-house, swap, evict, click-chat/pan still work)
- [ ] Task 13 hardware bring-up, user present: Docker gateway (xiaozhi-esp32-server, local ASR, OpenAI TTS + key) → flash XiaoZhi-compatible firmware pointed at PC → first conversation → commit fixtures → SETUP.md + PLAYTEST.md (incl. VILLAGE_HOST firewall, /v1 api_key check, save-migration note) → exit tests (privacy traffic check, latency baseline, mid-conversation swap) — do repo work on a fresh branch off current main
- [ ] After fixtures land: `npx vitest run packages/server/src/robot` (replay auto-un-skips); adjust parseChatRequest only if a real fixture fails
- [ ] R3 plan (greeting on swap, idle canned lines, per-creature voices, mood→face) once push-channel/TTS facts are known
- [ ] Delete SDD workspace `.superpowers/sdd/2026-08-23-r1-r2-robot-embodiment/` after Task 13
- [ ] Carry-overs: LICENSE decision (still undecided); optional Pages landing refresh

_Updated: 2026-08-25 — robot-embodiment_
