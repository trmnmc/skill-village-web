# Session Handoff: The village went live, the mystery got solved, and the night sky got fixed
**Date:** 2026-08-26 at 19:43
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no (this handoff file is the only new thing; `.claude/launch.json` untracked by design)
**Stale if:** `main` moves past `d4efce0` · `https://village.fenley.ai/api/health` stops reporting `{"ok":true,"creatures":75}` · the live bundle stops being `index-CC7JZXjz.js` · the droplet's `claude` CLI gets logged in (the "silent-movie" claims below expire)
**Transcript:** (current session)

## What Was Accomplished

**1. SKILL VILLAGE IS LIVE: https://village.fenley.ai** — deployed end-to-end this session. The user added the `village_deploy` SSH key via the DO web console (I drove their Chrome to the droplet console at `/terminal/ui/?os_user=root` and, with their confirmation, appended the key). Then: checkout at `/srv/skill-village`, `npm ci`, systemd unit, Caddy vhost, state seeded, TLS auto-provisioned, smoke tests green. A real visitor already moved a villager ("Bran") into the robot house.

**2. Three deploy-blocking discoveries, each fixed test-first:**
- **The droplet runs Caddy, not nginx** — and stock Caddy has no rate-limit module. The 6 r/min + burst 3 guard on public `/v1/` moved INTO the server (`f5481b6`): per-client token bucket in `createApp` (`AppOptions`), off by default, armed via `VILLAGE_LLM_RPM=6`/`VILLAGE_LLM_BURST=3` in the unit; `trustProxy` keys clients by X-Forwarded-For. Verified live: 4 pass, 5th gets 429. `deploy/village.Caddyfile` is the vhost; nginx conf kept as reference.
- **First boot released all 75 villagers**: `createVillage` runs the same reconcile as `/api/refresh` at boot, and the droplet has none of the creatures' files — worse, `/api/refresh` is publicly reachable. Snapshot mode (`7d2f3d4`): `VILLAGE_SNAPSHOT=1` skips boot reconcile + watcher; public refresh answers 409. State reseeded, health = 75.
- **Windows scp perms**: files arrive mode 700, caddy 403s everything → `chmod -R a+rX /var/www/village-game`. In the runbook now.

**3. The "data loss" was never a loss.** Forensics agent found the exact commands in another session's transcript: the 13:19 deletion was the final wave of the user-sanctioned OneDrive→`C:\Users\truman\Projects\` migration (session `823e7866`). The full original repo sits intact at `C:\Users\truman\Projects\skill-village-web` (HEAD `81f0d24` — the "dead" SHA — 24 branches, 12 worktrees). The deploy session then re-cloned into OneDrive at 13:31, creating TWO diverged repos. Ruled out: Defender, Storage Sense, OneDrive sync, scheduled tasks, disk faults. OneDrive account is `hleonhard22@outlook.com`, last auth June 2022 — the path truly has no cloud backup. Memory file `onedrive-data-loss.md` corrected.

**4. Sky playtest ran (pixel-playtester, headless), and its top two findings are FIXED and deployed (`9ba2a85`):**
- **Night storm contrast**: body `#242C34` sat 1.16:1 against the night storm sky — invisible (floating caps, detached shafts). Now `#3E4A5C`, pinned by WCAG-contrast invariants in `weather-layer.test.ts` across all six palettes (near ≥1.3, mid ≥1.12, day ≥1.5, monotonic haze ladder). `stormLayerTones()` extracted + exported; `relLuminance`/`contrast` added to `theme/palettes.ts`.
- **HUD readability**: new cream ink-outlined chip (`scene/hud-chip.ts`, nameplate chrome) hugs the three HUD lines. Sized from character count × 9px mono advance — KAPLAY's text `.width` getter fluctuates across frames (font swap/supersampling/dpr) and must not be measured.
- Redeployed: live bundle is now `index-CC7JZXjz.js`.

**5. Playtest verdicts delivered to the user** (screenshots in scratchpad `sky-playtest/` + `sky-fix/`): day storm/bolts/anchored shafts/parallax/seams/creature readability all good; remaining findings are theirs to judge (see Remaining Work).

## Decisions Made

- **The LLM guard lives in the server, not the proxy** — Caddy can't rate-limit; the 2026-08-25 "fully public with one guard" posture survives any proxy. Off by default so local play never throttles.
- **Snapshot mode over seeding skill files** — copying the user's real skill/agent files to the droplet would expose more than the decided posture (names world-readable, not contents).
- **Deploy fixes shipped without waiting for the visual verdict** — live had the strictly-worse version; the user's eyes still own final tuning.
- **HUD width from char count, never engine measure** — deterministic, dpr-independent, testable.
- **Committed and pushed every commit immediately** (standing data-loss rule).
- Repo reconciliation recommendation made (GitHub lineage canonical, salvage migrated repo's unique branches, move work out of OneDrive) — **user has not yet decided**.

## Files Created or Modified

| File | Action | Why |
|------|--------|-----|
| `packages/server/src/api/app.ts` | modified (`f5481b6`, `7d2f3d4`) | token-bucket LLM guard + trustProxy; `/api/refresh` 409 on snapshot |
| `packages/server/src/village.ts` | modified (`7d2f3d4`) | `snapshot` option: no boot reconcile, refresh() rejects |
| `packages/server/src/main.ts` | modified (both) | env wiring `VILLAGE_LLM_RPM`/`VILLAGE_SNAPSHOT`; watcher skipped on snapshot |
| `deploy/skill-village.service` | modified | Caddy note + `VILLAGE_LLM_RPM=6` `VILLAGE_LLM_BURST=3` `VILLAGE_SNAPSHOT=1` |
| `deploy/village.Caddyfile` | created (`f5481b6`) | the actual vhost (droplet runs Caddy) |
| `docs/village-deploy.md` | modified | Caddy steps, boot-reconcile trap, scp-perms trap |
| `packages/web/src/scene/weather-layer.ts` | modified (`9ba2a85`) | `stormLayerTones()` export; night body `#3E4A5C` |
| `packages/web/src/scene/hud-chip.ts` + test | created (`9ba2a85`) | HUD backing chip geometry (char-count sizing) |
| `packages/web/src/scene/village.ts` | modified (`9ba2a85`) | chip wiring + `layoutHudChip()` on text change |
| `packages/web/src/theme/palettes.ts` + test | modified (`9ba2a85`) | `relLuminance` + `contrast` (WCAG) |
| server+web test files | modified | 973 passed + 1 skipped; all new behavior test-first |
| memory `onedrive-data-loss.md` + `MEMORY.md` | corrected | migration truth, two-diverged-repos warning |
| droplet (not in repo) | configured | `/srv/skill-village` @ `d4efce0`-lineage, `/var/www/village-game`, Caddy block, unit enabled, state seeded |

## Git State
```
(clean — main == origin/main == d4efce0, all pushed)
```

## Checklist
<!-- snapshot of the TodoWrite list — resume rebuilds TodoWrite from these boxes -->
- [x] Droplet deploy — LIVE at https://village.fenley.ai (75 creatures, TLS, rate limit proven, snapshot mode)
- [x] Deletion mystery SOLVED (sanctioned migration; nothing lost; memory corrected)
- [x] Sky playtest run + findings 1 (night contrast) and 2 (HUD) fixed and deployed (`9ba2a85`)
- [ ] **Sky verdict — owner's eyes**: judge the deployed night storm + HUD chip (screenshots delivered in-session; or `village.fenley.ai/?weather=storm&at=00:00`); then call finding 3 — storm thins at 1280 wide (768 is the target look) — and minors: base-slab tray edges, olive far-haze cast, strike-glow z-order, `fy()` unclamped <256px
- [ ] **Droplet voice decision**: `claude` CLI on droplet not logged in → silent-movie mode. Logging in = real API spend on a public endpoint (rate limit live). User's call + user's action
- [ ] **Reconcile the two diverged repos** (user decision): OneDrive copy = GitHub lineage; `C:\Users\truman\Projects\skill-village-web` = original `81f0d24` + 24 branches/12 worktrees that exist NOWHERE else (backup stash was deleted — sole copies). Recommend: push unique branches, keep GitHub canonical, move future work out of OneDrive
- [ ] M5 implementation plan — writing-plans against `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`
- [ ] LICENSE decision (user's call; MIT suggested)
- [ ] Housekeeping: droplet wants a reboot (kernel update; drops swarm+chunks+village briefly); droplet memory tight (5.6/7.8 Gi, past OOM-kill of a 12.9 GB claude process); 8 fully-merged remote branches deletable
- [ ] Optional: Pages landing refresh · M4 leftovers (bubble occlusion, meter granularity, trackpad taps) · project breeding (parked)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

## Self-Critique
<!-- Honest end-of-session gaps — least-confident, missing, fragile, not-done, + how to check each. -->
- **Least confident:**
  1. **`HUD_CHAR_W = 9` is empirical from one environment** (headless Chromium, dpr 1). On the user's dpr-2 Chrome the atlas advance could differ and the chip could over/under-hug.
  2. **`#3E4A5C` passed the contrast math and my screenshots, not the user's eyes** — Berry Dusk / Toasted Oat night storms were never eyeballed, only asserted.
  3. **HUD layout constants are duplicated**: village.ts places text at (12,12)/(12,32)/(12,52); hud-chip.ts hardcodes the same 12/20/14 geometry. Moving one without the other silently mis-fits the chip.
  4. **Live-state semantics**: visitors mutate the droplet's state (Bran moved in). A future re-seed from local overwrites their care/bond/resident — documented as "snapshot, reseed to catch up", but the user may not want to wipe real visitors now that they exist.
- **Biggest thing being missed:** the site is genuinely public with real visitors and NO monitoring beyond `journalctl`/caddy logs — no alert if the service dies, OOMs, or the LLM budget drains once voice is enabled.
- **If it breaks in 3 months:** the droplet reboots (kernel update pending) and something in the boot order or the tight 7.8 Gi (Minecraft + swarm + village) fails silently; or someone re-seeds state and wipes months of visitor bonds.
- **Did NOT do:** playtest finding 3 + all minors; voice login; repo reconciliation/branch salvage; LICENSE; M5 plan; droplet reboot; monitoring; did not check the silent-movie banner overlapping the HUD chip area on the live site (banner is dismissable, but first impression stacks them).
- **How to check:** chip fit on dpr 2 → open village.fenley.ai in the user's own browser and look at top-left. Night palettes → `?weather=storm&at=00:00` + gear→palette cycling. Constants drift → change any HUD pos in village.ts and watch no test fail (that's the gap). Sole-copy branches → `git -C C:\Users\truman\Projects\skill-village-web branch -a` and `git log origin/main..<branch>`. Reboot risk → `ssh -i ~/.ssh/village_deploy root@68.183.99.200 'systemctl is-enabled skill-village caddy chunksmp swarm-web'`. Rate limit still live → 5 rapid POSTs to `/v1/chat/completions` → 429.

## Remaining Work

1. **User's sky verdict** (screenshots already in their chat): approve or re-tune `#3E4A5C` night body + HUD chip; then decide finding 3 (1280 storm density — cluster count doesn't scale with width; `STORM_CLOUD_CLUSTERS` in `weather-layer.ts`) and the minors.
2. **Voice on the droplet** (user action): SSH in, log the `claude` CLI in as the service user, restart `skill-village` — or explicitly decide to stay silent.
3. **Branch salvage** from `C:\Users\truman\Projects\skill-village-web` — sole copies until pushed.
4. Then the backlog: M5 plan, LICENSE, housekeeping, Chunks restart.

## Open Questions

- Does the rebuilt night storm pass the user's eye? Is the HUD chip's always-on cream box acceptable in fair weather too (it matches the gear buttons), or storm-only?
- Enable the robot's real voice on the public droplet (spends API budget; 6 r/min guard live), yes or no?
- Which repo is canonical going forward — and does future work move out of the OneDrive path (the migration's whole point)?
- Re-seed policy now that real visitors exist: is the droplet still a disposable snapshot, or does its state now matter?

## Coordinate Closet
<!-- Exact ids/paths/SHAs/PR-refs/key=value pairs scraped VERBATIM from this session. Newest-first, deduped. -->
- `d4efce0` (docs/checklist) · `9ba2a85` (sky+HUD fix) · `0324771` (runbook) · `7d2f3d4` (snapshot mode) · `f5481b6` (rate limiter + Caddyfile) — all pushed
- live bundle `index-CC7JZXjz.js` (281.01 kB) · pre-fix bundle `index-CVHXoMam.js` (280.41 kB)
- night storm body `#3E4A5C` (was `#242C34`) · day `#525C64` · night storm sky1 (palette 1a) computed `#2F3641` · old night contrast 1.16
- `HUD_CHAR_W = 9` · `HUD_CHIP_PAD = 6` · HUD lines x=12, y=12/32/52, pitch 20, glyph 14 · `TEXT_SS = 2`
- droplet: id `592277447` · `68.183.99.200` · console `https://cloud.digitalocean.com/droplets/592277447/terminal/ui/?os_user=root` · Ubuntu 24.04 · node v24.19.0 · systemd + Caddy (no rate-limit module) · mem 7.8Gi (5.6 used)
- droplet paths: `/srv/skill-village` (checkout) · `/var/www/village-game` (bundle; needs `chmod -R a+rX` after scp) · `/home/village/.skill-village/state.json` (seed target, 600 village:village)
- unit env: `VILLAGE_LLM_RPM=6` · `VILLAGE_LLM_BURST=3` · `VILLAGE_SNAPSHOT=1` · `VILLAGE_HOST=127.0.0.1` · `VILLAGE_PORT=8262`
- `~/.ssh/village_deploy` → `ssh -i ~/.ssh/village_deploy root@68.183.99.200` (works)
- migrated repo `C:\Users\truman\Projects\skill-village-web` (HEAD `81f0d24`, 24 branches, 12 worktrees; migration session `823e7866-82a4-4089-9996-33c446ddc40a`, transcript under `.claude/projects/C--Users-truman-Projects-Claude-Connect/`)
- OneDrive account `hleonhard22@outlook.com` (last auth June 2022 — no sync)
- URL overrides: `?weather=storm|rain|snow|fog|cloudy|…` · `?at=12:00` (clock time, NOT phase names) · `?day=…` · `?ground=a|b|c|off`
- test counts: **973 passed + 1 skipped** (77 files) · typecheck green
- screenshots: scratchpad `sky-fix/` (night/day/fair/live after) · `sky-playtest/` (before, 21 shots)
- headless shots: `~/.claude/skills/gstack/browse/dist/browse` (Browser pane doesn't composite while hidden)
- Chrome extension deviceId `7442a948-e448-4d1d-8bdc-9012f6556498` (user's real Chrome, connected this session)
- robot resident on live: "Bran" (set by a visitor ~19:40)

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.
Environment facts: the dev server dies with the Browser pane (`preview_start {name:"dev"}`
restarts it); the pane only composites while displayed — use the gstack `browse` daemon
for screenshots when it won't. Standing rule: **push every commit immediately.**
Present the rebuilt checklist + Remaining Work and ask whether to continue or do
something else.
