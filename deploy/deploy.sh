#!/usr/bin/env bash
#
# Update a village that bootstrap.sh has already set up. Run as root, on the
# droplet, from inside the checkout:
#
#   /srv/skill-village/app/deploy/deploy.sh
#
# Pulls the branch, reinstalls, rebuilds the bundle, republishes it and
# restarts the service — then checks the village actually answered.
set -euo pipefail

APP_USER=""
APP_HOME=""
NODE_DIR=""

# Everything lives inside main() on purpose: bash reads a script in chunks as
# it runs, and this one git-resets the file out from under itself halfway
# through. A function body is parsed in full before its first line runs.
main() {
  local branch="" web_root="/var/www/skill-village" port="8262" skip_pull="no"

  while [ $# -gt 0 ]; do
    case "$1" in
      --branch) branch="${2:?}"; shift 2 ;;
      --web-root) web_root="${2:?}"; shift 2 ;;
      --port) port="${2:?}"; shift 2 ;;
      --no-pull) skip_pull="yes"; shift ;;
      -h|--help) usage; return 0 ;;
      *) echo "unknown option: $1" >&2; usage >&2; return 2 ;;
    esac
  done

  [ "$(id -u)" -eq 0 ] || { echo "run this as root: sudo $0" >&2; return 1; }

  local repo_dir; repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  # Whoever owns the checkout is the service user: asking the filesystem beats
  # asking the operator to keep a flag in sync with bootstrap.sh.
  APP_USER="$(stat -c '%U' "$repo_dir")"
  APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
  NODE_DIR="$(dirname "$(command -v node)")"
  [ -n "$branch" ] || branch="$(as_app_user git -C "$repo_dir" rev-parse --abbrev-ref HEAD)"

  printf '==> deploying %s (branch %s, user %s)\n' "$repo_dir" "$branch" "$APP_USER"

  if [ "$skip_pull" = "yes" ]; then
    echo "    --no-pull: building the working tree as it stands"
  else
    as_app_user git -C "$repo_dir" fetch --prune origin "$branch"
    # Hard reset, not merge: the droplet is a deploy target, not a place
    # anyone edits. Local changes here are accidents, and losing them loudly
    # beats a half-merged checkout serving a village.
    as_app_user git -C "$repo_dir" reset --hard "origin/$branch"
  fi
  # As the owner, not as root: git refuses to read a repo owned by someone
  # else without an explicit safe.directory.
  printf '    at %s\n' "$(as_app_user git -C "$repo_dir" log --oneline -1)"

  echo '==> build'
  as_app_user sh -c "cd '$repo_dir' && npm ci --include=dev && npm run build:web"

  echo '==> publish'
  install -d -m 755 "$web_root"
  rsync -a --delete "$repo_dir/packages/web/dist/" "$web_root/"

  echo '==> restart'
  systemctl restart skill-village

  echo '==> smoke test'
  local i
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
      printf '    health: %s\n' "$(curl -fsS "http://127.0.0.1:$port/api/health")"
      echo '    deployed.'
      return 0
    fi
    sleep 1
  done
  echo "the server did not answer on 127.0.0.1:$port within 20s" >&2
  echo "logs: journalctl -u skill-village -n 50 --no-pager" >&2
  return 1
}

# The header comment above is the help text; it runs to the first line of code.
usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
}

# runuser hands the command the caller's environment, so HOME would still be
# /root — and git and npm both write there. See bootstrap.sh's copy.
as_app_user() {
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" \
    PATH="$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" "$@"
}

main "$@"
