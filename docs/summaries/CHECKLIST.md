## Checklist
- [x] Ground texture: preset b shipped as default (`c33355a`, pushed pre-loss)
- [x] Sky rework: cumulus + storm parallax + bolts-from-clouds (`44157ad`)
- [x] `build:web` + vite prod fixes (`7da1a4b`)
- [x] Deploy runbook + nginx + systemd unit (`e50402f`)
- [x] Data-loss recovery (2026-08-26): repo restored from GitHub + session-context rebuild, all commits pushed, env running — see memory `onedrive-data-loss.md`
- [x] DNS: `village.fenley.ai → 68.183.99.200` (user added, verified)
- [x] **Droplet deploy — LIVE at https://village.fenley.ai** (2026-08-26 evening): 75 creatures, TLS auto via Caddy, ws connected, gear menu works. En route: LLM guard moved into the server (`f5481b6`, Caddy has no rate-limit module; verified live — 4 pass then 429) and snapshot mode (`7d2f3d4`, boot reconcile released all 75 on first start; `/api/refresh` now 409s on the deploy). Windows scp perms trap (700 → caddy 403) recorded in the runbook.
- [x] Process manager confirmed: systemd (swarm-web.service pattern) — and the droplet proxies with **Caddy, not nginx**
- [ ] **Droplet voice**: claude CLI on the droplet is not logged in → village is in silent-movie mode (canned lines). Owner's call whether to authenticate it (real API spend, public endpoint; rate limit is live)
- [x] Sky playtest findings 1+2 FIXED and deployed (`9ba2a85`): night storm body lifted #242C34→#3E4A5C, pinned by WCAG-contrast tests across all six palettes (near ≥1.3, mid ≥1.12, day ≥1.5, monotonic ladder); HUD got a cream ink-outlined chip hugging the text (char-count × 9px mono advance — KAPLAY .width fluctuates, don't measure)
- [ ] **Visual verdict on the rebuilt sky** — owner's eyes still owed: (3) storm thins at 1280 wide (768 is the target look — composition call), minors: base-slab "tray" edges, olive cast in far haze, strike glow z-order
- [ ] Remaining sky playtest: owner's own pan-around at all phases
- [ ] Deferred visual minors: strike glow draws over near deck (z 5 vs creatures z 4–7); `fy()` unclamped under ~256px viewports
- [x] Deletion event SOLVED: it was the sanctioned OneDrive→`C:\Users\truman\Projects` migration (session `823e7866`), not a loss — full original repo sits at `C:\Users\truman\Projects\skill-village-web` (HEAD `81f0d24`, 24 branches, 12 worktrees). OneDrive path confirmed unsynced (account `hleonhard22@outlook.com`, last auth 2022). Memory updated.
- [ ] **Reconcile the two diverged repos** (owner decision pending): recommend GitHub lineage stays canonical, push the migrated copy's unique branches, move future work out of OneDrive
- [ ] M5 implementation plan — writing-plans against `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`
- [ ] LICENSE decision (user's call; MIT suggested)
- [ ] Optional: Pages landing refresh · M4 playtest leftovers (bubble occlusion, meter granularity, trackpad taps) · project breeding (parked)
- [ ] Housekeeping: 8 fully-merged remote branches are deletion candidates; droplet wants a reboot (kernel update) — would briefly drop swarm + chunks + village; droplet memory is tight (5.6/7.8 Gi used, an OOM-killed 12.9 GB claude process in the tty log)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

_Updated: 2026-08-26 evening — main `7d2f3d4` · 963 passed + 1 skipped, typecheck green · village.fenley.ai live_
