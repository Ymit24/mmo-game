#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "remote-install must run as root." >&2
  exit 1
fi

DOMAIN="${MMO_DOMAIN:-mmo.christiansmith.live}"
SERVICE_NAME="${MMO_SERVICE_NAME:-mmo}"
APP_USER="${MMO_APP_USER:-mmo}"
APP_GROUP="${MMO_APP_GROUP:-mmo}"
APP_PORT="${MMO_APP_PORT:-3101}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

APP_ROOT="/opt/mmo"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
SHARED_DIR="$APP_ROOT/shared"
DATA_DIR="/var/lib/mmo"
ENV_DIR="/etc/mmo"
ENV_FILE="$ENV_DIR/mmo.env"

if [[ -x /usr/local/bin/bun ]]; then
  BUN_BIN="/usr/local/bin/bun"
elif [[ -x /root/.bun/bin/bun ]]; then
  install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun
  BUN_BIN="/usr/local/bin/bun"
elif command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
else
  echo "bun was not found. Install bun before running remote-install." >&2
  exit 1
fi

echo "[remote-install] Using bun at $BUN_BIN"

if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
  groupadd --system "$APP_GROUP"
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --gid "$APP_GROUP" --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$RELEASES_DIR" "$SHARED_DIR" "$DATA_DIR" "$ENV_DIR"
chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT" "$DATA_DIR"
# nginx (www-data) must traverse app directories to serve static client assets.
chmod 755 "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR"
chmod 750 "$DATA_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  GENERATED_SECRET="$(openssl rand -hex 32 2>/dev/null || LC_ALL=C head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$ENV_FILE" <<ENV
PORT=$APP_PORT
JWT_SECRET=$GENERATED_SECRET
AUTH_DB_PATH=$DATA_DIR/auth.sqlite
JWT_EXPIRES_IN_SECONDS=86400
# JWT_ISSUER=
# JWT_AUDIENCE=
ENV
  chown root:"$APP_GROUP" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  echo "[remote-install] Created $ENV_FILE with generated JWT secret."
fi

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=MMO Game Server
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_ROOT/current/server
EnvironmentFile=$ENV_FILE
ExecStart=$BUN_BIN $APP_ROOT/current/server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null

NGINX_SITE="/etc/nginx/sites-available/$DOMAIN"
cat > "$NGINX_SITE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $CURRENT_LINK/client;
    index index.html;

    access_log /var/log/nginx/$DOMAIN.access.log;
    error_log /var/log/nginx/$DOMAIN.error.log;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /api/ws {
        proxy_pass http://127.0.0.1:$APP_PORT/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

if [[ -n "$CERTBOT_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
  systemctl reload nginx
  echo "[remote-install] TLS configured for $DOMAIN"
elif [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo "[remote-install] TLS cert already exists for $DOMAIN."
else
  echo "[remote-install] CERTBOT_EMAIL not set; skipping TLS issuance."
fi

echo "[remote-install] Bootstrap complete for $DOMAIN"
