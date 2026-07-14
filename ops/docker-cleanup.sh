#!/usr/bin/env bash
set -Eeuo pipefail

# Safe host-side Docker cleanup for the VPS running Dokploy.
#
# This script NEVER removes Docker volumes, so MongoDB data volumes are not
# touched. Run it on the VPS host through SSH, not inside the pinball container.
#
# Usage:
#   bash ops/docker-cleanup.sh --report
#   bash ops/docker-cleanup.sh --apply
#   bash ops/docker-cleanup.sh --apply --aggressive
#   sudo bash ops/docker-cleanup.sh --install-weekly
#
# Optional:
#   PRUNE_AGE=336h bash ops/docker-cleanup.sh --apply

PRUNE_AGE="${PRUNE_AGE:-168h}"
MODE="report"
AGGRESSIVE=false
INSTALL_WEEKLY=false

usage() {
  cat <<'EOF'
Pinball VPS Docker cleanup

Options:
  --report          Show disk usage only (default).
  --apply           Remove safe unused Docker resources.
  --aggressive      With --apply, also remove unused images older than PRUNE_AGE.
                    This can remove old rollback images, but never active images.
  --install-weekly  Install a weekly safe cleanup cron job at Sunday 03:30.
  -h, --help        Show this help.

Environment:
  PRUNE_AGE          Minimum age for stopped containers, networks and build cache.
                     Default: 168h (7 days).

The script never runs docker volume prune and never deletes MongoDB volumes.
EOF
}

while (($# > 0)); do
  case "$1" in
    --report)
      MODE="report"
      ;;
    --apply)
      MODE="apply"
      ;;
    --aggressive)
      AGGRESSIVE=true
      ;;
    --install-weekly)
      INSTALL_WEEKLY=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI was not found. Run this script on the Dokploy VPS host." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Cannot access Docker. Use sudo or add the current user to the docker group." >&2
    exit 1
  fi
}

install_weekly() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "--install-weekly requires sudo/root." >&2
    exit 1
  fi

  local install_path="/usr/local/sbin/pinball-docker-cleanup"
  local cron_path="/etc/cron.d/pinball-docker-cleanup"

  install -m 0755 "$0" "$install_path"
  cat >"$cron_path" <<EOF
# Safe weekly Dokploy host cleanup. Volumes are intentionally never pruned.
30 3 * * 0 root PRUNE_AGE=${PRUNE_AGE} ${install_path} --apply >> /var/log/pinball-docker-cleanup.log 2>&1
EOF
  chmod 0644 "$cron_path"

  echo "Installed: $install_path"
  echo "Installed: $cron_path"
  echo "Schedule: every Sunday at 03:30 server time"
  echo "Log: /var/log/pinball-docker-cleanup.log"
}

show_report() {
  log "Filesystem usage"
  df -h / /var/lib/docker 2>/dev/null | awk '!seen[$0]++' || df -h /

  log "Docker disk usage"
  docker system df

  log "Largest container JSON logs (read-only report)"
  if [[ -d /var/lib/docker/containers ]]; then
    find /var/lib/docker/containers -type f -name '*-json.log' -print0 2>/dev/null \
      | xargs -0 -r du -h 2>/dev/null \
      | sort -h \
      | tail -n 10 || true
  else
    echo "Docker log directory is not readable by the current user."
  fi
}

safe_cleanup() {
  log "Removing stopped containers older than ${PRUNE_AGE}"
  docker container prune --force --filter "until=${PRUNE_AGE}"

  log "Removing dangling images"
  docker image prune --force

  if [[ "$AGGRESSIVE" == true ]]; then
    log "Aggressive mode: removing all unused images older than ${PRUNE_AGE}"
    docker image prune --all --force --filter "until=${PRUNE_AGE}"
  fi

  log "Removing unused networks older than ${PRUNE_AGE}"
  docker network prune --force --filter "until=${PRUNE_AGE}"

  log "Removing build cache older than ${PRUNE_AGE}"
  if docker buildx version >/dev/null 2>&1; then
    docker buildx prune --all --force --filter "until=${PRUNE_AGE}"
  else
    docker builder prune --all --force --filter "until=${PRUNE_AGE}"
  fi

  log "Volumes were NOT pruned"
}

if [[ "$INSTALL_WEEKLY" == true ]]; then
  install_weekly
  exit 0
fi

require_docker

if command -v flock >/dev/null 2>&1; then
  lock_file="${XDG_RUNTIME_DIR:-/tmp}/pinball-docker-cleanup.lock"
  exec 9>"$lock_file"
  if ! flock -n 9; then
    echo "Another cleanup process is already running." >&2
    exit 0
  fi
fi

show_report

if [[ "$MODE" == "report" ]]; then
  log "Report only; nothing was deleted"
  echo "Run with --apply after reviewing the report."
  exit 0
fi

safe_cleanup
show_report
log "Cleanup completed"
