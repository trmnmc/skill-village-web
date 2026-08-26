# Session Handoff: Data-loss recovery, cumulus storm rework, and a droplet deploy blocked on SSH
**Date:** 2026-08-26 at 14:56
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web
**Branch:** main
**Uncommitted changes:** no (working tree clean; `.claude/launch.json` is untracked by design)
**Stale if:** `main` moves past `e50402f` · `origin/main` diverges from `e50402f` · `village.fenley.ai` stops resolving to `68.183.99.200` · an SSH key for `68.183.99.200` appears (unblocks the deploy — the "blocked" claims below expire)
**Transcript:** (current session)

## What Was Accomplished

A long arc: ground texture shipped → storm sky reworked twice on live playtest → deploy prep → **catastrophic local data loss** → full recovery. In order:

**1. Ground texture shipped and pushed (`c33355a`).** Preset `b` (Quiet Meadow mottling + a soft blending path) is the default; `?ground=a|c|off` are comparison overrides. Every texture colour is a `mix()` of already-weather-tinted tokens. This commit was already safe on GitHub before the data loss.

**2. The sky rework (`44157ad`), driven by three storm-playtest findings.** (a) Clouds were 15%-height slabs — now every cluster (fair/overcast/storm) generates through `puffRects`: belly + slab + lobes doming over up to 5 convex-profile steps, near-deck storm clouds 170 ref px wide. (b) The storm deck had NO parallax — now rides `driftedClusterRects` with per-layer haze toward the sky (`STORM_HAZE [0.45, 0.22, 0]`). (c) Lightning was born in clear air — `strikeOrigin()` now snaps each bolt to the nearest near/mid cloud's body slab. Also: rain shafts hang from the far clusters (they used to drift *rightward* against leftward clouds — that was my regression, caught by the user as "light bars"), strike cadence doubled to ~60s (`STRIKE_SLOT_S 64`), tone steps softened 0.3→~0.15 ("gradients too extreme"), drift window widened 700/160 → 820/260 with a named-constant seam test.

**3. Deploy prep (`7da1a4b`, `e50402f`).** `build:web` now exists (the main app had NO production build; needed `target: 'esnext'` for top-level await). `deploy/village.nginx.conf` + `deploy/skill-village.service` + `docs/village-deploy.md` runbook. Tailscale remote viewing fixed en route (`tailscale serve` → `localhost:5173`, vite `allowedHosts: ['.ts.net']`).

**4. The data loss and recovery.** ~13:19 on 2026-08-26 a local deletion event hollowed out the repo (`.git` + all source gone; only `.claude` husks + `node_modules` survived) and emptied sibling projects `AI`, `Claude-Connect`, `oLLAMA-hand`. Windows Recycle Bin: not there. OneDrive web recycle bin: empty — and the cloud account shows **the OneDrive folder was never syncing** (cloud Documents last modified 2014). Recovery: re-cloned `c33355a` from GitHub, rebuilt the three then-unpushed commits from session context, pushed each immediately. Fidelity proof: **955 passed + 1 skipped** (exact pre-loss count) and the built bundle hash `index-CVHXoMam.js` byte-identical to the pre-loss build. Stale dev-server processes (esbuild.exe + two node) were holding `node_modules` locks and had to be killed by command-line match before `npm ci` would run.

**5. Environment restored.** Dev server up (5173 → 200, API v4, 75 creatures), `.claude/launch.json` recreated, six empty worktree husk dirs removed, repo-local git identity restored (`truman <tfenley23@gmail.com>`).

**6. User added the DNS record.** `village.fenley.ai → A 68.183.99.200, DNS only` — verified resolving.

## Decisions Made

- **Deploy is fully public, LLM voice included** (user's explicit choice over my recommendation of basic auth): `/v1/chat/completions` reachable by anyone; nginx rate-limit 6 r/min per IP (burst 3) is the only guard. Recorded in the runbook so nobody "fixes" it.
- **Real state gets seeded to the droplet** (user's choice): the 75 villagers, with skill/agent names world-readable.
- **Deploy the MAIN app, not the spectator** — `docs/showroom-deploy.md` describes a `village.fenley.ai` spectator deploy, but the spectator is a separate painter that imports neither `weather-layer.ts` nor `ground.ts`. Deploying it would show none of this work.
- **Never run `POST /api/refresh` on the droplet** — it rescans skills/agents from disk; the droplet has none, so it would reconcile the village to nothing.
- **Push every commit immediately** — the data loss turned three finished-but-unpushed commits into a rebuild job. Saved to memory as a standing rule.
- **Rebuilt, not restored**: recovery used exact replay of session edits with count-asserted replacements, not memory-paraphrase. Two escape-collapse slips (`\'` in Python strings) were caught by the test run.
- Storm cadence "maybe 2x slower" read as: make strikes ~60s apart.

## Files Created or Modified

| File | Action | Why |
|------|--------|-----|
| `packages/web/src/scene/ground.ts` + test | created (`c33355a`) | ground texture, preset b default |
| `packages/web/src/scene/weather-layer.ts` | rewritten (`44157ad`) | puffRects clouds, storm parallax/haze, strikeOrigin, 60s cadence |
| `packages/web/src/scene/weather-layer.test.ts` | rewritten (`44157ad`) | 105 tests: puff invariants, strikeOrigin suite, derived (not hardcoded) bounds |
| `package.json` | modified (`7da1a4b`) | `build:web` script |
| `packages/web/vite.config.ts` | modified (`7da1a4b`) | `target: 'esnext'`, `allowedHosts: ['.ts.net']` |
| `deploy/village.nginx.conf` | created (`e50402f`) | public vhost, LLM rate-limit, SPA fallback, ws upgrade |
| `deploy/skill-village.service` | created (`e50402f`) | systemd unit, VILLAGE_HOST=127.0.0.1 |
| `docs/village-deploy.md` | created (`e50402f`) | runbook incl. state-seeding trap and refresh warning |
| `.claude/launch.json` | recreated (untracked) | dev server launch entry |
| memory: `onedrive-data-loss.md` | created | the incident + push-immediately rule |

## Git State
```
(clean — main == origin/main == e50402f)
```

## Checklist
<!-- snapshot of the TodoWrite list — resume rebuilds TodoWrite from these boxes -->
- [x] Ground texture: preset b shipped as default (`c33355a`, pushed pre-loss)
- [x] Sky rework: cumulus + storm parallax + bolts-from-clouds (`44157ad`)
- [x] `build:web` + vite prod fixes (`7da1a4b`)
- [x] Deploy runbook + nginx + systemd unit (`e50402f`)
- [x] Data-loss recovery: repo restored, all commits pushed, env running
- [x] DNS: `village.fenley.ai → 68.183.99.200` (user added, verified)
- [ ] **Droplet deploy — blocked on SSH access.** Public key `~/.ssh/village_deploy.pub` was generated for the user to add via the DigitalOcean console; not yet authorized. Then: follow `docs/village-deploy.md` end-to-end; verify `/api/health` reports 75 creatures before calling it live
- [ ] Confirm droplet process manager (systemd vs pm2 — swarm services set the pattern) before installing the unit
- [ ] **Visual verdict on the rebuilt sky** — the user never SAW the second cloud iteration (huge clouds, shafts fixed) before the data loss interrupted; storm is ⚙ → Pick → storm
- [ ] Remaining sky playtest: clouds at all phases, two window sizes
- [ ] Deferred visual minors: strike glow draws over near deck (z 5 vs creatures z 4–7); `fy()` unclamped under ~256px viewports
- [ ] Investigate the deletion event — `AI`, `Claude-Connect`, `oLLAMA-hand` still empty; OneDrive folder has NO cloud backup (account shows 2014-era empty Documents)
- [ ] M5 implementation plan — writing-plans against `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`
- [ ] LICENSE decision (user's call; MIT suggested)
- [ ] Optional: Pages landing refresh · M4 playtest leftovers (bubble occlusion, meter granularity, trackpad taps) · project breeding (parked)
- [ ] Housekeeping: 8 fully-merged remote branches are deletion candidates; 3 stashes were LOST with the old .git (they were on main: superseded CHECKLIST draft, stale sky README draft, showroom debris — all marked superseded, so nothing of value)
- [ ] Non-repo: restart/reload the Chunks Minecraft server so the chunks.games.place rebrand shows

## Self-Critique
<!-- Honest end-of-session gaps — least-confident, missing, fragile, not-done, + how to check each. -->
- **Least confident:**
  1. **The rebuilt sky has never been seen by a human.** Rebuild fidelity is proven (identical bundle hash), but the *second iteration itself* (huge clouds, anchored shafts) was never visually approved — the loss interrupted exactly at "worth a look with a pan."
  2. **The nginx/systemd configs are untested against the real droplet** — written from the showroom doc's conventions; the droplet may run pm2, a different nginx layout, or an old Node.
  3. **The tailscale serve → localhost:5173 fix survives reboots?** Serve config persists, but the dev server does not; after a desktop reboot the URL 502s until `preview_start {name:"dev"}` runs.
  4. **`STORM_ALPHA`/haze tuning** — chosen by reasoning, not by eye; the far deck could still read washed-out at night.
- **Biggest thing being missed:** the deletion cause is unidentified and the machine still runs whatever did it. Everything this session rebuilt lives on the same disk, in the same OneDrive path, protected only by the push-immediately habit.
- **If it breaks in 3 months:** someone deploys the *spectator* to village.fenley.ai following the older `showroom-deploy.md` (it names the same domain) and concludes the sky/ground work "didn't ship" — the two runbooks now cross-reference each other, but the DNS record satisfies both.
- **Did NOT do:** the actual droplet deploy (blocked); any visual verification of the rebuilt sky; state seeding; certbot; the deletion investigation; did not commit `.claude/launch.json` (untracked by convention).
- **How to check:**
  - Rebuild fidelity: `npm test` → 955 passed + 1 skipped; `npm run build:web` → `dist/assets/index-CVHXoMam.js`.
  - Sky verdict: dev server up → ⚙ → Pick → storm; pan the camera; bolt lands ~every 60s from a cloud belly.
  - Droplet readiness: `ssh -i ~/.ssh/village_deploy <user>@68.183.99.200 'systemctl list-units | grep -i swarm'` (works only once the key is authorized).
  - DNS: `nslookup village.fenley.ai` → includes `68.183.99.200`.
  - Deletion recurrence: `ls C:/Users/truman/OneDrive/Documents/Claude-Projects/Civil-War/.git` — if THAT vanishes too, the process is still active.

## Remaining Work

1. **The droplet deploy** — the moment SSH access exists: build → rsync `packages/web/dist/` → checkout at `/srv/skill-village` → confirm process manager → nginx vhost + certbot → **stop server, seed `~/.skill-village/state.json`, start** → smoke test `https://village.fenley.ai/api/health` shows 75 creatures. Everything scripted in `docs/village-deploy.md`.
2. **Playtest the rebuilt sky** — the user has not seen the huge-clouds iteration at all.
3. **Investigate the deletion** and decide what to do about the not-actually-backed-up OneDrive folder.
4. Then the backlog: M5 plan, LICENSE, minors.

## Open Questions

- SSH access to `68.183.99.200`: will the user add `~/.ssh/village_deploy.pub` via the DO console (the Settings→Security page only applies at droplet creation — must use the console)?
- Is the sky right now? (huge clouds, anchored shafts, 60s bolts — never seen.)
- What deleted the files? And should the projects move out of the OneDrive path entirely?

## Coordinate Closet
<!-- Exact ids/paths/SHAs/PR-refs/key=value pairs scraped VERBATIM from this session. Newest-first, deduped. -->
- `e50402f` (deploy runbook) · `7da1a4b` (build:web) · `44157ad` (sky rework) — the three REBUILT commits, all pushed; originals `2cfc771`/`c2f07e5`/`81f0d24` are dead SHAs that exist nowhere
- `c33355a1cf6c78c8411e030de2a39efc88bd16ec` (ground texture; recovery clone base)
- `village.fenley.ai` → A `68.183.99.200` (DNS only, added 2026-08-26; droplet also hosts swarm.fenley.ai + chunks)
- `~/.ssh/village_deploy` / `village_deploy.pub` = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM51/3ZwVAUMvVndr78wm4FzMcBfT8LexNSHbRVoqR/K skill-village-deploy@desktop-cfvtif1`
- `https://desktop-cfvtif1.tail10fb81.ts.net/` (tailnet-only URL; serve → `http://localhost:5173`; off: `tailscale serve --https=443 off`)
- dist bundle hash `index-CVHXoMam.js` (280.41 kB / gzip 104.11 kB — byte-identical pre- and post-rebuild)
- Test counts: weather-layer 105 · full suite **955 passed + 1 skipped** (76 files)
- New exports in `weather-layer.ts`: `puffRects` · `PuffLobe` · `STORM_CLOUD_CLUSTERS` · `strikeOrigin` · `driftedClusterRects` · `CloudBlob` · `CLOUD_DRIFT_PERIOD = 820` · `CLOUD_DRIFT_LEFT_MARGIN = 260` · `CLOUD_MAX_EXTENT = 170` · `BILLOW_CEILING = 1.35`
- Strike: `STRIKE_SLOT_S = 64` · `STRIKE_WINDOW_MIN_S = 2` · `STRIKE_WINDOW_SPAN_S = 56` · duration 0.7s
- `STORM_HAZE = [0.45, 0.22, 0]` · `STORM_ALPHA = [0.75, 0.9, 1]` · storm body day `#525C64` night `#242C34`
- Ground: preset default `b` · recipes path `mix(ground, wood, 0.3)` edge `0.15` · `?ground=a|b|c|off`
- nginx: root `/var/www/village-game` · zone `village_llm:10m rate=6r/m burst=3` · unit user `village` · checkout `/srv/skill-village`
- Server env: `VILLAGE_HOST=127.0.0.1` · `VILLAGE_PORT=8262` (empty VILLAGE_HOST also loopback, see `18b5f4b`)
- Local state: `~/.skill-village/state.json` = 145407 bytes, save `version: 4`, 75 creatures (outside OneDrive, safe)
- Deletion event: 2026-08-26 ~13:19 · victims `AI` `Claude-Connect` `oLLAMA-hand` `DUNGEONS`(1 entry) `Chunks`(no .git) · survivors `Civil-War` `creature-engine` · OneDrive cloud Documents empty since 2014 · `skill-village-web.rar` 143544212 bytes (Aug 25 05:31) still in parent dir
- Stale-lock recovery: kill node/esbuild by command-line match `*skill-village-web*` (PIDs that session: 31356 esbuild, 33240 concurrently, 23460 vite)
- git identity restored: `truman <tfenley23@gmail.com>` (repo-local)
- Dev server: `preview_start {name:"dev"}` · dies with Browser pane · serverId this session `52090e64-509e-4b0f-a390-a0fb88a0d48d`
- localStorage keys: `sv-weather-mode` · `sv-weather-pick` · `sv-time-pin` · `sv-palette-pin`

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.
Two environment facts: the dev server **dies with the Browser pane** (restart
with `preview_start {name:"dev"}`), and the pane only composites while displayed,
so screenshots fail while it is hidden. One safety rule now in force: **push
every commit immediately** — see the data-loss memory.
The deploy is the lead item and is blocked ONLY on SSH: ask whether the
`village_deploy.pub` key has been added to the droplet yet. Also offer the
sky playtest — the user has never seen the rebuilt clouds.
