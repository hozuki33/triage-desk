#!/usr/bin/env bash
set -euo pipefail

# Run on the Ubuntu 22.04 ECS as root:
#   bash /opt/triage-desk/deploy/setup-server.sh
#
# Expects the project already unpacked at /opt/triage-desk
# and apps/web/dist already built (or this script builds it).

APP_DIR=/opt/triage-desk
API_DIR="$APP_DIR/apps/api"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://8.136.44.223}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y nginx postgresql postgresql-contrib curl ca-certificates gnupg

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

npm config set registry https://registry.npmmirror.com

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm
fi

# Keep Postgres small on a 2G box.
PG_CONF=$(find /etc/postgresql -name postgresql.conf | head -n 1)
if [[ -n "$PG_CONF" ]]; then
  sed -i "s/^#*shared_buffers.*/shared_buffers = 128MB/" "$PG_CONF"
  systemctl restart postgresql
fi

DB_PASS="${DB_PASS:-$(openssl rand -hex 12)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='triage'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER triage WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='triage_desk'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE triage_desk OWNER triage;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE triage_desk TO triage;"
sudo -u postgres psql -d triage_desk -c "GRANT ALL ON SCHEMA public TO triage;"
sudo -u postgres psql -d triage_desk -c "ALTER SCHEMA public OWNER TO triage;"

cat > "$API_DIR/.env" <<EOF
DATABASE_URL="postgresql://triage:${DB_PASS}@127.0.0.1:5432/triage_desk?schema=public"
JWT_SECRET="${JWT_SECRET}"
PORT=3001
PUBLIC_ORIGIN="${PUBLIC_ORIGIN}"
DEEPSEEK_API_KEY=
LLM_BASE_URL="https://api.deepseek.com"
LLM_MODEL="deepseek-chat"
EOF
chmod 600 "$API_DIR/.env"

cd "$APP_DIR"
export NODE_OPTIONS=--max-old-space-size=512
pnpm install --frozen-lockfile || pnpm install
if [[ ! -f "$APP_DIR/apps/web/dist/index.html" ]]; then
  pnpm --filter @triagedesk/web build
fi
cd "$API_DIR"
pnpm exec prisma generate
pnpm exec prisma db push
pnpm db:seed

chown -R www-data:www-data "$APP_DIR"
chmod 600 "$API_DIR/.env"

cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/triage-desk
ln -sfn /etc/nginx/sites-available/triage-desk /etc/nginx/sites-enabled/triage-desk
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cp "$APP_DIR/deploy/triage-desk-api.service" /etc/systemd/system/triage-desk-api.service
systemctl daemon-reload
systemctl enable --now triage-desk-api

echo
echo "Up at ${PUBLIC_ORIGIN}"
echo "Accounts: admin / agent / user   password: desk-2026"
echo "Change the password after the first login."
