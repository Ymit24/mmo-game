#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "remote-deploy must run as root." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: remote-deploy.sh <release-tarball-path>" >&2
  exit 1
fi

ARTIFACT_PATH="$1"
SERVICE_NAME="${MMO_SERVICE_NAME:-mmo}"
APP_USER="${MMO_APP_USER:-mmo}"
APP_GROUP="${MMO_APP_GROUP:-mmo}"
APP_PORT="${MMO_APP_PORT:-3101}"
APP_ROOT="/opt/mmo"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Release artifact not found: $ARTIFACT_PATH" >&2
  exit 1
fi

mkdir -p "$RELEASES_DIR"

STAMP="$(date -u +%Y%m%d%H%M%S)"
RANDOM_SUFFIX="$(date +%s%N | sha256sum | cut -c1-6)"
RELEASE_DIR="$RELEASES_DIR/$STAMP-$RANDOM_SUFFIX"
STAGE_DIR="$(mktemp -d /tmp/mmo-release.XXXXXX)"
PREVIOUS_TARGET=""

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

tar -xzf "$ARTIFACT_PATH" -C "$STAGE_DIR"

if [[ ! -f "$STAGE_DIR/client/index.html" ]]; then
  echo "Release archive is missing client/index.html" >&2
  exit 1
fi
if [[ ! -f "$STAGE_DIR/server/index.js" ]]; then
  echo "Release archive is missing server/index.js" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/client" "$RELEASE_DIR/server"
cp -R "$STAGE_DIR/client"/. "$RELEASE_DIR/client/"
cp -R "$STAGE_DIR/server"/. "$RELEASE_DIR/server/"
if [[ -f "$STAGE_DIR/BUILD_INFO" ]]; then
  cp "$STAGE_DIR/BUILD_INFO" "$RELEASE_DIR/BUILD_INFO"
fi

chown -R "$APP_USER:$APP_GROUP" "$RELEASE_DIR"
chmod -R u=rwX,go=rX "$RELEASE_DIR"

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

systemctl daemon-reload
systemctl restart "$SERVICE_NAME"

HEALTH_OK=0
for _ in {1..20}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:$APP_PORT/health" >/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "$HEALTH_OK" != "1" ]]; then
  echo "Health check failed after restart; rolling back." >&2
  if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
    ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
    systemctl restart "$SERVICE_NAME" || true
  fi
  exit 1
fi

mapfile -t RELEASE_LIST < <(ls -1dt "$RELEASES_DIR"/* 2>/dev/null || true)
if (( ${#RELEASE_LIST[@]} > 10 )); then
  for OLD_RELEASE in "${RELEASE_LIST[@]:10}"; do
    rm -rf "$OLD_RELEASE"
  done
fi

echo "[remote-deploy] Deploy successful: $RELEASE_DIR"
