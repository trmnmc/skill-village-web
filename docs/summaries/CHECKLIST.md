## Checklist
- [x] Ground texture: preset b shipped as default (`c33355a`, pushed pre-loss)
- [x] Sky rework: cumulus + storm parallax + bolts-from-clouds (`44157ad`)
- [x] `build:web` + vite prod fixes (`7da1a4b`)
- [x] Deploy runbook + nginx + systemd unit (`e50402f`)
- [x] Data-loss recovery (2026-08-26): repo restored from GitHub + session-context rebuild, all commits pushed, env running — see memory `onedrive-data-loss.md`
- [x] DNS: `village.fenley.ai → 68.183.99.200` (user added, verified)
- [ ] **Droplet deploy — blocked on SSH access.** Public key `~/.ssh/village_deploy.pub` needs adding to the droplet via the DigitalOcean console (Settings→Security only applies at creation). Then follow `docs/village-deploy.md` end-to-end; verify `/api/health` reports 75 creatures before calling it live
- [ ] Confirm droplet process manager (systemd vs pm2 — swarm services set the pattern) before installing the unit
- [ ] **Visual verdict on the rebuilt sky** — the user never SAW the second cloud iteration (huge clouds, anchored shafts, 60s bolts); storm is ⚙ → Pick → storm
- [ ] Remaining sky playtest: clouds at all phases, two window sizes
- [ ] Deferred visual minors: strike glow draws over near deck (z 5 vs creatures z 4–7); `fy()` unclamped under ~256px viewports
- [ ] Investigate the deletion event — `AI`, `Claude-Connect`, `oLLAMA-hand` still empty; the OneDrive folder has NO cloud backup (account's cloud Documents empty since 2014)
- [ ] M5 implementation plan — writing-plans against `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`
- [ ] LICENSE decision (user's call; MIT suggested)
- [ ] Optional: Pages landing refresh · M4 playtest leftovers (bubble occlusion, meter granularity, trackpad taps) · project breeding (parked)
- [ ] Housekeeping: 8 fully-merged remote branches are deletion candidates; the 3 stashes were lost with the old .git (all were marked superseded — nothing of value)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

_Updated: 2026-08-26 — main · verified against `e50402f`; 955 passed + 1 skipped, typecheck green_
