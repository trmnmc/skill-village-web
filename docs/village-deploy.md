# Deploying the village (village.fenley.ai)

The interactive game — the one with the villagers, the sky and the ground.
Distinct from `showroom-deploy.md`, which deploys the **read-only spectator**
bundle on port 8263. The spectator scene is its own painter and does *not*
share `scene/weather-layer.ts` or `scene/ground.ts`, so weather and ground
work only ever shows up through *this* deploy. Both can run side by side.

Decisions taken by the owner on 2026-08-25, recorded so a later reader does
not "fix" them:

- **Fully public, LLM voice included.** `/v1/chat/completions` reaches the
  robot and spends real API budget for anyone with the URL. The **server**
  rate-limits it to 6 r/min per client (burst 3) — armed by `VILLAGE_LLM_RPM`
  in the systemd unit; that is the only guard. (The guard moved out of the
  proxy on 2026-08-26: the droplet runs stock Caddy, which has no rate-limit
  module. `village.nginx.conf` keeps the nginx equivalent for reference.)
- **Real state is published.** The droplet serves a copy of the owner's local
  `~/.skill-village/state.json`, so villager names — derived from their Claude
  skills and agents — are world-readable.

## Prerequisites

- DNS: an **A record** `village.fenley.ai → 68.183.99.200` (added 2026-08-26,
  DNS-only / grey cloud, matching swarm.fenley.ai).
- Node 20+ on the droplet, and a `village` service user.

## Build (local)

    npm ci
    npm run build:web          # → packages/web/dist/

`build:web` is the main-app build; `build:spectator` is the showroom's. The
main build needs `target: 'esnext'` (top-level await in `main.ts`) — already
set in `packages/web/vite.config.ts`.

## Droplet layout

- Static bundle: rsync `packages/web/dist/` → `/var/www/village-game/`
- Server: repo checked out at `/srv/skill-village`, run by
  `deploy/skill-village.service` with `VILLAGE_HOST=127.0.0.1
  VILLAGE_PORT=8262`. Process manager confirmed 2026-08-26: systemd (the
  swarm services set the pattern).
- Proxy: the droplet runs **Caddy**, not nginx. Append the
  `deploy/village.Caddyfile` block to `/etc/caddy/Caddyfile`, then
  `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.
- TLS: automatic — Caddy provisions the certificate itself; no certbot.

## Seeding the village state

The server writes `state.json` continuously, so **stop it before copying** or
the running process will overwrite what you push:

    ssh <user>@68.183.99.200 'sudo systemctl stop skill-village'
    rsync ~/.skill-village/state.json <user>@68.183.99.200:/tmp/state.json
    ssh <user>@68.183.99.200 'sudo install -o village -g village -m 600 \
        /tmp/state.json /home/village/.skill-village/state.json && \
        sudo systemctl start skill-village'

The droplet has none of the owner's skill or agent *files*, only this state
snapshot — and reconciling against that empty disk would release every
villager. This is not just an `/api/refresh` hazard: **boot runs the same
reconcile** (learned the hard way on the first deploy, 2026-08-26, which
released all 75 on arrival). The unit therefore sets `VILLAGE_SNAPSHOT=1`:
no reconcile at boot, no file watcher, and the public `POST /api/refresh`
route answers 409 instead of wiping the village. Treat the deployed village
as a snapshot, and re-seed it the same way whenever it should catch up.

Project villagers (M5) never reach the droplet by scanning. Snapshot mode
skips the transcript scan whole — `scanProjects()` returns without touching
the disk — so the droplet never reads `~/.claude/projects`, which it does not
have. Projects arrive only inside a re-seeded `state.json`, and a project's
`sourcePath` is a real folder path from the owner's machine: seeding publishes
those path strings, the same posture helper `sourcePath`s already carry (names
world-readable, contents never). Re-seeding also overwrites whatever live
visitors have done — bonds, care, the robot resident — so it is a deliberate
act, not routine maintenance.

**Rolling back the server releases every project.** A state file from M5
loads fine on an older build (`STATE_VERSION` is still 4 and every new field
is optional), but that build's `reconcile` has no project guard: the helper
scan says nothing about projects, so its first pass auto-releases all of
them. Pair any rollback below M5 with a re-seed of a matching state file.

## Redeploying the web bundle

    npm run build:web
    rsync -a --delete packages/web/dist/ <user>@68.183.99.200:/var/www/village-game/

No rsync on the Windows box: scp the dist folder and copy it into place —
then `chmod -R a+rX /var/www/village-game`, because scp carries Windows
permissions over as 700 and caddy (which runs as its own user) answers 403
on everything it cannot traverse. Bitten on the first deploy.

`index.html` is served `no-store` and `/assets/*` immutable, so a redeploy
takes effect on the next load without stale-asset pinning.

## Smoke test

    curl -s https://village.fenley.ai/api/health     # {"ok":true,"creatures":N}
    curl -s -o /dev/null -w '%{http_code}\n' https://village.fenley.ai/

Then open it: villagers render, the status chip shows the socket connected,
and the gear menu changes the weather. Check `creatures` matches the count
you seeded (75 at the time of writing) — a `0` means the state copy landed in
the wrong home directory or with the wrong owner.
