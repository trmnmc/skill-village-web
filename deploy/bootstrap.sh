#!/usr/bin/env bash
#
# First-run setup for the droplet. Run once, as root:
#
#   ./deploy/bootstrap.sh --domain village.example.com
#
# It creates the service user, checks out the repo, builds the bundle, wires
# up nginx and systemd, and asks for the password your friend will type. It is
# idempotent: re-running reuses the existing user, checkout and password file
# instead of clobbering them, so it doubles as a repair tool.
#
# Afterwards: deploy/deploy.sh for updates, deploy/sync-skills.sh to put your
# own skills in the village.
set -euo pipefail

# Set once in main, read by the helpers below. Upper case because they outlive
# the function that assigns them.
APP_USER="village"
APP_HOME="/srv/skill-village"
NODE_DIR=""

main() {
  local domain="" branch="main" port="8262" auth_user="village"
  local repo="https://github.com/trmnmc/skill-village-web.git"
  local web_root="/var/www/skill-village" force_password="no"

  while [ $# -gt 0 ]; do
    case "$1" in
      --domain) domain="${2:?--domain needs a hostname}"; shift 2 ;;
      --user) APP_USER="${2:?}"; shift 2 ;;
      --home) APP_HOME="${2:?}"; shift 2 ;;
      --repo) repo="${2:?}"; shift 2 ;;
      --branch) branch="${2:?}"; shift 2 ;;
      --web-root) web_root="${2:?}"; shift 2 ;;
      --port) port="${2:?}"; shift 2 ;;
      --auth-user) auth_user="${2:?}"; shift 2 ;;
      --reset-password) force_password="yes"; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "unknown option: $1" >&2; usage >&2; return 2 ;;
    esac
  done

  [ -n "$domain" ] || { echo "--domain is required (e.g. --domain village.example.com)" >&2; return 2; }
  [ "$(id -u)" -eq 0 ] || { echo "run this as root: sudo $0 --domain $domain" >&2; return 1; }

  local repo_dir="$APP_HOME/app"
  local htpasswd="/etc/nginx/skill-village.htpasswd"
  local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  require_tools
  NODE_DIR="$(require_node)"

  step "service user and directories"
  if id -u "$APP_USER" >/dev/null 2>&1; then
    say "user $APP_USER already exists"
  else
    useradd --system --user-group --home-dir "$APP_HOME" --create-home --shell /usr/sbin/nologin "$APP_USER"
    say "created system user $APP_USER"
  fi
  # ~/.claude is where the village looks for villagers; ~/.skill-village is
  # the only place it ever writes. Both exist before the first boot, so it
  # finds an empty field rather than an error.
  install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_HOME" \
    "$APP_HOME/.claude" "$APP_HOME/.claude/skills" "$APP_HOME/.claude/agents" \
    "$APP_HOME/.skill-village"

  step "checkout"
  if [ -d "$repo_dir/.git" ]; then
    say "reusing the checkout at $repo_dir"
  else
    as_app_user git clone --branch "$branch" "$repo" "$repo_dir"
  fi

  step "build"
  # NODE_ENV is deliberately not production here: with it set npm skips
  # devDependencies, and the two things this deploy runs — tsx (the server)
  # and vite (the bundle) — both live there.
  as_app_user sh -c "cd '$repo_dir' && npm ci --include=dev && npm run build:web"

  step "static bundle"
  install -d -m 755 "$web_root"
  # --delete so a renamed hashed asset does not linger forever; the bundle is
  # the only thing that has ever lived under this root.
  rsync -a --delete "$repo_dir/packages/web/dist/" "$web_root/"
  say "published $(find "$web_root" -type f | wc -l) files to $web_root"

  step "password"
  write_htpasswd "$htpasswd" "$auth_user" "$force_password"

  step "nginx"
  local site="/etc/nginx/sites-available/skill-village"
  sed -e "s|__DOMAIN__|$domain|g" -e "s|__WEB_ROOT__|$web_root|g" \
      -e "s|__HTPASSWD__|$htpasswd|g" -e "s|__PORT__|$port|g" \
      "$here/nginx.conf" > "$site"
  ln -sfn "$site" /etc/nginx/sites-enabled/skill-village
  nginx -t
  systemctl reload nginx
  say "serving $domain from $web_root"

  step "service"
  sed -e "s|__APP_USER__|$APP_USER|g" -e "s|__APP_HOME__|$APP_HOME|g" -e "s|__PORT__|$port|g" \
      "$here/skill-village.service" > /etc/systemd/system/skill-village.service
  systemctl daemon-reload
  systemctl enable skill-village
  systemctl restart skill-village

  step "smoke test"
  smoke_test "$port"

  cat <<DONE

The village is up on http://$domain — log in as "$auth_user".

Next:
  1. TLS:     certbot --nginx -d $domain
  2. Skills:  from your laptop, ./deploy/sync-skills.sh root@$domain
              (an empty ~/.claude on the droplet is an empty field)
  3. Updates: ssh in and run $repo_dir/deploy/deploy.sh
DONE
}

# The header comment above is the help text; it runs to the first line of code.
usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
}

say() { printf '    %s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

# runuser hands the command the *caller's* environment, so HOME would still be
# /root — and git, npm and the build all write there. Everything that runs as
# the service user goes through here so it writes inside its own home instead.
as_app_user() {
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" \
    PATH="$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" "$@"
}

require_tools() {
  local missing=() tool
  for tool in git rsync nginx systemctl runuser openssl curl; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "missing: ${missing[*]}" >&2
    echo "on a fresh droplet: apt-get update && apt-get install -y git rsync nginx curl" >&2
    return 1
  fi
}

# The village needs Node 20+. Prints the directory holding node, so the build
# can put it on the service user's PATH — a root-only nvm install is the usual
# reason `runuser -u village -- npm` cannot find it.
require_node() {
  local node_path major
  node_path="$(command -v node || true)"
  if [ -z "$node_path" ]; then
    echo "node is not installed. Node 20+ is required:" >&2
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs" >&2
    return 1
  fi
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 20 ]; then
    echo "node $major is too old; the village needs 20+." >&2
    return 1
  fi
  dirname "$node_path"
}

write_htpasswd() {
  local file="$1" user="$2" force="$3" password=""
  if [ -f "$file" ] && [ "$force" != "yes" ]; then
    say "keeping the existing password ($file) — re-run with --reset-password to change it"
    return 0
  fi
  if [ -n "${VILLAGE_PASSWORD:-}" ]; then
    password="$VILLAGE_PASSWORD"
  elif [ -t 0 ]; then
    read -rsp "    password for \"$user\": " password; echo
    [ -n "$password" ] || { echo "empty password" >&2; return 1; }
  else
    # No terminal to ask at (piped install, cloud-init): make one up and say
    # it once, rather than leaving the village wide open.
    password="$(openssl rand -base64 12)"
    say "no terminal to prompt at — generated password: $password"
  fi
  # openssl rather than htpasswd: apr1 is a format nginx reads natively, and
  # this skips a dependency on apache2-utils.
  printf '%s:%s\n' "$user" "$(openssl passwd -apr1 "$password")" > "$file"
  chmod 640 "$file"
  chgrp www-data "$file" 2>/dev/null || true
  say "password written to $file"
}

smoke_test() {
  local port="$1" i
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
      say "health: $(curl -fsS "http://127.0.0.1:$port/api/health")"
      return 0
    fi
    sleep 1
  done
  echo "the server did not answer on 127.0.0.1:$port within 20s" >&2
  echo "logs: journalctl -u skill-village -n 50 --no-pager" >&2
  return 1
}

main "$@"
