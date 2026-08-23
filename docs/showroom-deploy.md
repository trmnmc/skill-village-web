# Deploying the Swarm Showroom

## Build
    npm ci
    npm run build:spectator        # → packages/web/dist-spectator/

## Droplet layout
- Static bundle: rsync `packages/web/dist-spectator/` → `/var/www/village/`
- Server: the repo checked out on the droplet; run with
  `SHOWROOM_HOST=127.0.0.1 SHOWROOM_PORT=8263 npx tsx packages/server/src/showroom/main.ts`
  under the droplet's process manager (same pattern as the swarm services).
- Config: `~/.swarm-showroom/showroom.config.json` (spec §7 shape). The server
  logs config warnings on boot — read them after every edit.

## nginx (village.fenley.ai)
    server {
      server_name village.fenley.ai;
      root /var/www/village;
      location /api/ { proxy_pass http://127.0.0.1:8263; }
      location /ws {
        proxy_pass http://127.0.0.1:8263;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
      }
      location / { try_files $uri /spectator.html; }
    }

DNS + TLS follow the existing fenley.ai certbot setup.

## Smoke test after deploy
    curl -s https://village.fenley.ai/api/health   # {"ok":true,"villagers":N}
Open the page; confirm the village renders and the socket connects (status chip).
