#!/usr/bin/env bash
set -euo pipefail

SRC=/tmp/rivethub-cloud-deploy
APP=/opt/rivethub-cloud
ETC=/etc/rivethub-cloud
PORT=8790

id rivethub-cloud >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin rivethub-cloud

install -d -m 755 "$APP"
rm -rf "$APP/lib" "$APP/migrations"
cp -r "$SRC/lib" "$SRC/migrations" "$SRC/package.json" "$APP/"
chown -R root:root "$APP"
chmod -R a+rX "$APP"

install -d -m 750 -o root -g rivethub-cloud "$ETC"
if [ ! -f "$ETC/env" ]; then
  DBPASS=$(openssl rand -hex 24)
  SALT=$(openssl rand -hex 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rivethub_cloud') THEN
    CREATE ROLE rivethub_cloud LOGIN PASSWORD '${DBPASS}';
  ELSE
    ALTER ROLE rivethub_cloud LOGIN PASSWORD '${DBPASS}';
  END IF;
END \$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='rivethub_cloud'" | grep -q 1 \
    || sudo -u postgres createdb -O rivethub_cloud rivethub_cloud
  sudo -u postgres psql -q -d rivethub_cloud -c "CREATE EXTENSION IF NOT EXISTS pgcrypto"
  umask 077
  cat > "$ETC/env" <<ENV
NODE_ENV=production
DATABASE_URL=postgres://rivethub_cloud:${DBPASS}@127.0.0.1:5432/rivethub_cloud
PUBLIC_URL=https://rivethub.cloud
EMAIL_FROM=RivetHub <hello@rivethub.io>
PORT=${PORT}
HOST=127.0.0.1
TRUST_PROXY=1
TELEMETRY_SALT=${SALT}
TELEMETRY_RETENTION_DAYS=90
ENV
  chown root:rivethub-cloud "$ETC/env"
  chmod 640 "$ETC/env"
fi

cat > /etc/systemd/system/rivethub-cloud.service <<UNIT
[Unit]
Description=rivethub.cloud sign-in, telemetry and updates
After=network.target postgresql.service

[Service]
User=rivethub-cloud
Group=rivethub-cloud
WorkingDirectory=${APP}
EnvironmentFile=${ETC}/env
ExecStart=/usr/bin/node lib/bundle/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now rivethub-cloud.service
systemctl restart rivethub-cloud.service
sleep 2
systemctl is-active rivethub-cloud.service
curl -fsS "http://127.0.0.1:${PORT}/healthz"
echo
