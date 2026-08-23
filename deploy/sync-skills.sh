#!/usr/bin/env bash
#
# Put your own skills and agents in the droplet's village. Run from your
# laptop, not the droplet:
#
#   ./deploy/sync-skills.sh root@village.example.com
#
# Copies ~/.claude/skills and ~/.claude/agents to the service user's home.
# The server watches those directories, so villagers appear within seconds —
# no restart, and nothing on your machine is modified.
#
# Anything you send is readable by anyone who has the village password: the
# panel shows each creature's name and description, and the API reports the
# file path it came from. Leave anything with a secret in it at home.
set -euo pipefail

# The header comment above is the help text; it runs to the first line of code.
usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
}

main() {
  local target="" app_home="/srv/skill-village" app_user="village" mirror="no" dry="no"

  while [ $# -gt 0 ]; do
    case "$1" in
      --home) app_home="${2:?}"; shift 2 ;;
      --user) app_user="${2:?}"; shift 2 ;;
      --mirror) mirror="yes"; shift ;;
      --dry-run) dry="yes"; shift ;;
      -h|--help) usage; return 0 ;;
      -*) echo "unknown option: $1" >&2; return 2 ;;
      *) target="$1"; shift ;;
    esac
  done

  [ -n "$target" ] || { echo "usage: $0 [user@]droplet [--mirror] [--dry-run]" >&2; return 2; }

  local tool
  for tool in ssh rsync; do
    command -v "$tool" >/dev/null 2>&1 || { echo "$tool is not installed on this machine" >&2; return 1; }
  done

  local flags=(-az --info=stats1)
  # Default is additive: a skill you delete locally stays a villager on the
  # droplet. --mirror deletes it there too, which the game reads as the file
  # being gone and archives the creature.
  [ "$mirror" = "yes" ] && flags+=(--delete)
  [ "$dry" = "yes" ] && flags+=(--dry-run --itemize-changes)

  local sent=0 dir
  for dir in skills agents; do
    if [ ! -d "$HOME/.claude/$dir" ]; then
      echo "    no ~/.claude/$dir — skipping"
      continue
    fi
    printf '==> %s\n' "$dir"
    ssh "$target" "mkdir -p '$app_home/.claude/$dir'"
    rsync "${flags[@]}" "$HOME/.claude/$dir/" "$target:$app_home/.claude/$dir/"
    sent=$((sent + 1))
  done

  [ "$sent" -gt 0 ] || { echo "nothing to sync: ~/.claude has neither skills nor agents" >&2; return 1; }

  if [ "$dry" = "yes" ]; then
    echo '==> dry run, nothing was copied'
    return 0
  fi

  # rsync ran as whoever you ssh'd in as; the village can only read what it
  # owns once the service's ProtectHome/ReadWritePaths sandbox is in play.
  ssh "$target" "chown -R '$app_user':'$app_user' '$app_home/.claude'"
  echo '==> synced — the watcher picks them up within a few seconds'
}

main "$@"
