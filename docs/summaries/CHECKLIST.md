# Checklist

_Updated: 2026-08-28 — main_

- [x] M5 implemented, merged, pushed (projects as villagers, auras, presence, work signal)
- [x] Save-collision root-caused (v4/v5 across two sessions); personas restored from backup
- [x] This session's village isolated (own data dir, 8263/5175) and verified live
- [x] Isolation wiring committed + pushed (`a9c4e69`) — checked first: no other session had landed its own version
- [x] M5 visual verdict given (2026-08-30): presence arbitrary · auras noise · distribution uneven · storm clouds raw rectangles — all four fixed same day (`a1b5bd3` layout crowd+ghosts, `b571d88` presence=work signal, `1046ccc` one-body cloud billow)
- [ ] **Re-judge the fixes** — http://localhost:5175 — plus the still-unjudged: all-instances-speak, porch-alone read, HUD chip
- [ ] **Session hygiene decision (the "focus" ask)**: one checkout + two sessions caused all of today's chaos — decide: one session at a time, or worktrees with isolated saves per session
- [ ] State-file lock or version handshake so an older server can never wipe a newer save (isolation only protects THIS session)
- [ ] Branch salvage: `C:\Users\truman\Projects\skill-village-web` still holds 24 sole-copy branches
- [ ] Droplet: still pre-M5 (deploy M5 + reseed decision — reseed publishes real folder paths, wipes visitor state); voice login decision; LICENSE; M6 plan
- [ ] Housekeeping (carried): droplet reboot pending, memory tight; 8 merged remote branches deletable; Chunks server restart
