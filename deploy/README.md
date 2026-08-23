# Hosting the village

Everything here puts **the game** — the village from the front-page README —
on a droplet behind nginx, so you can send someone a link and a password.
(`docs/showroom-deploy.md` covers a different thing: the read-only Swarm
Showroom, on its own port and its own nginx site. The two can share a droplet.)

## What you need

- A droplet running Debian or Ubuntu, with `nginx`, `git`, `rsync` and
  **Node 20+**. Node from your distro is usually too old:

      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

- A DNS A record pointing at the droplet — say `village.example.com`.

## Set it up

On the droplet, as root:

    git clone https://github.com/trmnmc/skill-village-web /tmp/sv && cd /tmp/sv
    ./deploy/bootstrap.sh --domain village.example.com

It asks for the password your friend will type, then does the rest: a
`village` system user, a checkout at `/srv/skill-village/app`, `npm ci`, the
bundle built and published, the nginx site, the systemd unit, and a health
check at the end. The `/tmp/sv` clone was only the delivery van — the real one
lives at `/srv/skill-village/app`, and that is where you run things afterwards.

Then, for TLS:

    certbot --nginx -d village.example.com

certbot rewrites the site in place. Re-running `bootstrap.sh` later would
overwrite that, so once TLS is on, use `deploy.sh` for updates.

## Send it some villagers

A fresh droplet has no `~/.claude`, so the village is an empty field. From
**your laptop**:

    ./deploy/sync-skills.sh root@village.example.com

That copies `~/.claude/skills` and `~/.claude/agents` to the service user's
home. The server watches those directories, so creatures appear within a few
seconds — no restart. `--mirror` also deletes what you have deleted locally,
which the game reads as the files being gone and archives; `--dry-run` shows
you what would move.

Nothing on your machine is touched, in either direction: the server only ever
reads `~/.claude`, and writes only inside `~/.skill-village`.

## Update it

    ssh root@village.example.com
    /srv/skill-village/app/deploy/deploy.sh

Fetches, hard-resets to the branch, reinstalls, rebuilds, republishes,
restarts, and checks the village answered. Game state survives: it lives in
`~/.skill-village`, which nothing here touches.

One wrinkle: a change to `deploy.sh` itself lands on the *next* run. The script
is fully parsed before it git-resets the file out from under itself, so the run
that pulls a new `deploy.sh` is still executing the old one.

## Where things end up

| Path | What |
|---|---|
| `/srv/skill-village/app` | The checkout the service runs from |
| `/srv/skill-village/.claude/{skills,agents}` | The villagers, read-only |
| `/srv/skill-village/.skill-village` | Game state, event log, archive |
| `/var/www/skill-village` | The built bundle nginx serves |
| `/etc/nginx/sites-available/skill-village` | The site |
| `/etc/nginx/skill-village.htpasswd` | The password |
| `/etc/systemd/system/skill-village.service` | The unit |

## The password guards the API too

That is the point of it. The game's routes are not a spectator view: they
accept intents, and a chat message spends a `claude` CLI call on the droplet.
The API also reports the path each creature's file came from, so anyone
through the door can read your directory layout. Send skills you would be
happy for your friend to read, and keep the password to people you mean.

Voices are off unless you install the `claude` CLI for the `village` user and
log it in. Without it the game runs in silent-movie mode — creatures still
live, they just do not talk — which is the sane default for a public box.

## When it does not work

    systemctl status skill-village
    journalctl -u skill-village -n 50 --no-pager   # what the server said
    nginx -t                                        # is the site valid
    curl -fsS http://127.0.0.1:8262/api/health      # is the server up at all

- **Page loads, village never appears.** The WebSocket is not getting through.
  Check the `/ws` block survived certbot's edit, and that nothing between you
  and nginx strips `Upgrade`.
- **The browser asks for the password twice, or the socket 401s.** Browsers
  normally reuse basic-auth credentials for the socket handshake. If yours does
  not, add `auth_basic off;` inside `location /ws` — the socket only ever sends
  state out, so it is the safe one to open.
- **`npm ci` fails on boot with a permissions error.** The npm cache under the
  service user's home is root-owned, usually from a build run with `sudo` by
  hand: `rm -rf /srv/skill-village/.npm` and deploy again.
