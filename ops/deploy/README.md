# Production Deployment

This repository includes a release-based deployment flow for `mmo.christiansmith.live`.

## Files

- `ops/deploy/build-release.sh`: build client/server and package `dist/mmo-release.tgz`
- `ops/deploy/remote-install.sh`: one-time VM bootstrap (user, systemd, nginx)
- `ops/deploy/remote-deploy.sh`: deploy one release artifact on the VM with rollback on health failure
- `ops/deploy/deploy-vm.sh`: local helper that builds, uploads, and deploys over SSH
- `.github/workflows/deploy-prod.yml`: CD deploy on merge/push to `main`

## One-Time VM Bootstrap

Run from repo root:

```bash
ssh vm 'CERTBOT_EMAIL="you@example.com" bash -s' < ops/deploy/remote-install.sh
```

If you want to skip certificate issuance for now:

```bash
ssh vm 'bash -s' < ops/deploy/remote-install.sh
```

Then set the production env file:

```bash
ssh vm 'editor /etc/mmo/mmo.env'
```

Required values:

- `JWT_SECRET` (32+ chars)
- `PORT` (defaults to `3101`)
- `AUTH_DB_PATH` (defaults to `/var/lib/mmo/auth.sqlite`)

## Promote Admin Account

After your account exists, promote it from the VM shell:

```bash
ssh vm 'set -a && source /etc/mmo/mmo.env && set +a && /usr/local/bin/bun /opt/mmo/current/server/index.js admin promote --email you@example.com'
```

The command only promotes existing accounts and is safe to run repeatedly.

## Manual Deploy

From repo root:

```bash
./ops/deploy/deploy-vm.sh --host vm --install --certbot-email you@example.com
```

After the first bootstrap, deploy without `--install`:

```bash
./ops/deploy/deploy-vm.sh --host vm
```

## GitHub CD Setup

Set these repository secrets:

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_PORT` (optional, defaults to `22`)
- `PROD_SSH_PRIVATE_KEY`

CD will run on `main` pushes and execute the same artifact deploy flow.
