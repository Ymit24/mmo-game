#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_ARTIFACT="$ROOT_DIR/dist/mmo-release.tgz"

SSH_HOST="vm"
SSH_USER=""
SSH_PORT="22"
REMOTE_ARTIFACT="/tmp/mmo-release.tgz"
ARTIFACT_PATH="$DEFAULT_ARTIFACT"
RUN_INSTALL=0
SKIP_BUILD=0
CERTBOT_EMAIL=""

usage() {
  cat <<USAGE
Usage: deploy-vm.sh [options]

Options:
  --host <host>            SSH host or alias (default: vm)
  --user <user>            SSH user (optional if host alias sets it)
  --port <port>            SSH port (default: 22)
  --artifact <path>        Local release tarball path (default: dist/mmo-release.tgz)
  --remote-path <path>     Remote tarball path (default: /tmp/mmo-release.tgz)
  --install                Run remote-install.sh before deploying
  --certbot-email <email>  Email used by certbot during --install
  --skip-build             Skip build-release and deploy existing --artifact
  -h, --help               Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      SSH_HOST="$2"
      shift 2
      ;;
    --user)
      SSH_USER="$2"
      shift 2
      ;;
    --port)
      SSH_PORT="$2"
      shift 2
      ;;
    --artifact)
      ARTIFACT_PATH="$2"
      shift 2
      ;;
    --remote-path)
      REMOTE_ARTIFACT="$2"
      shift 2
      ;;
    --install)
      RUN_INSTALL=1
      shift
      ;;
    --certbot-email)
      CERTBOT_EMAIL="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SSH_TARGET="$SSH_HOST"
if [[ -n "$SSH_USER" ]]; then
  SSH_TARGET="$SSH_USER@$SSH_HOST"
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  "$ROOT_DIR/ops/deploy/build-release.sh" "$ARTIFACT_PATH"
fi

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Artifact not found: $ARTIFACT_PATH" >&2
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT")
SCP_OPTS=(-P "$SSH_PORT")

if [[ "$RUN_INSTALL" == "1" ]]; then
  echo "[deploy-vm] Running remote install on $SSH_TARGET"
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "CERTBOT_EMAIL='$CERTBOT_EMAIL' bash -s" < "$ROOT_DIR/ops/deploy/remote-install.sh"
  else
    ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'bash -s' < "$ROOT_DIR/ops/deploy/remote-install.sh"
  fi
fi

echo "[deploy-vm] Uploading artifact to $SSH_TARGET:$REMOTE_ARTIFACT"
scp "${SCP_OPTS[@]}" "$ARTIFACT_PATH" "$SSH_TARGET:$REMOTE_ARTIFACT"

echo "[deploy-vm] Running remote deploy"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- '$REMOTE_ARTIFACT'" < "$ROOT_DIR/ops/deploy/remote-deploy.sh"

echo "[deploy-vm] Done"
