#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_PATH="${1:-$ROOT_DIR/dist/mmo-release.tgz}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$(dirname "$ARTIFACT_PATH")"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "[build-release] Installing dependencies"
  (cd "$ROOT_DIR" && bun install --frozen-lockfile)
fi

echo "[build-release] Building client and server"
(cd "$ROOT_DIR" && bun run --filter @mmo/client build)
(cd "$ROOT_DIR" && bun run --filter @mmo/server build)

CLIENT_DIST="$ROOT_DIR/packages/client/dist"
SERVER_BUNDLE="$ROOT_DIR/packages/server/dist/index.js"

if [[ ! -d "$CLIENT_DIST" ]]; then
  echo "Client build output missing: $CLIENT_DIST" >&2
  exit 1
fi
if [[ ! -f "$SERVER_BUNDLE" ]]; then
  echo "Server build output missing: $SERVER_BUNDLE" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR/client" "$STAGE_DIR/server"
cp -R "$CLIENT_DIST"/. "$STAGE_DIR/client/"
cp "$SERVER_BUNDLE" "$STAGE_DIR/server/index.js"

COMMIT_SHA="unknown"
if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  COMMIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
fi

cat > "$STAGE_DIR/BUILD_INFO" <<INFO
built_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
git_commit=$COMMIT_SHA
INFO

rm -f "$ARTIFACT_PATH"
tar -C "$STAGE_DIR" -czf "$ARTIFACT_PATH" .

echo "[build-release] Release artifact created: $ARTIFACT_PATH"
