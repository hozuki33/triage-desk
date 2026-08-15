#!/usr/bin/env bash
set -euo pipefail

# Run on the Ubuntu 22.04 ECS as root:
#   bash /opt/triage-desk/deploy/setup-server.sh
#
# Expects the project already unpacked at /opt/triage-desk
# and apps/web/dist already built (or this script builds it).

APP_DIR=/opt/triage-desk
API_DIR="$APP_DIR/apps/api"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"

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

read_dotenv_value() {
  ENV_FILE="$API_DIR/.env" ENV_KEY="$1" node -e '
    const fs = require("fs");
    const file = process.env.ENV_FILE;
    if (!fs.existsSync(file)) process.exit(0);
    const key = process.env.ENV_KEY;
    const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
    if (!line) process.exit(0);
    let value = line.slice(key.length + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("\u0027") && value.endsWith("\u0027"))) value = value.slice(1, -1);
    console.log(value);
  '
}

DATABASE_URL="${DATABASE_URL:-$(read_dotenv_value DATABASE_URL)}"
DB_PASS="${DB_PASS:-$(read_dotenv_value DB_PASS)}"
JWT_SECRET="${JWT_SECRET:-$(read_dotenv_value JWT_SECRET)}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-$(read_dotenv_value PUBLIC_ORIGIN)}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-$(read_dotenv_value DEEPSEEK_API_KEY)}"
OPENAI_API_KEY="${OPENAI_API_KEY:-$(read_dotenv_value OPENAI_API_KEY)}"
LLM_PROVIDER="${LLM_PROVIDER:-$(read_dotenv_value LLM_PROVIDER)}"
LLM_BASE_URL="${LLM_BASE_URL:-$(read_dotenv_value LLM_BASE_URL)}"
LLM_MODEL="${LLM_MODEL:-$(read_dotenv_value LLM_MODEL)}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://8.136.44.223}"

if [[ -z "${DB_PASS:-}" && -n "${DATABASE_URL:-}" ]]; then
  DB_PASS=$(node -e 'console.log(new URL(process.env.DATABASE_URL).password)')
fi
DB_PASS="${DB_PASS:-$(openssl rand -hex 12)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
if [[ -z "${LLM_PROVIDER:-}" ]]; then
  if [[ -n "${DEEPSEEK_API_KEY:-}" && -n "${OPENAI_API_KEY:-}" ]]; then
    echo "LLM_PROVIDER is required when both provider keys are configured." >&2
    exit 1
  elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
    LLM_PROVIDER=openai
  else
    LLM_PROVIDER=deepseek
  fi
fi
if [[ "$LLM_PROVIDER" == "openai" ]]; then
  LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai.com/v1}"
  LLM_MODEL="${LLM_MODEL:-gpt-4o-mini}"
else
  LLM_BASE_URL="${LLM_BASE_URL:-https://api.deepseek.com}"
  LLM_MODEL="${LLM_MODEL:-deepseek-chat}"
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='triage'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER triage WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='triage_desk'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE triage_desk OWNER triage;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE triage_desk TO triage;"
sudo -u postgres psql -d triage_desk -c "GRANT ALL ON SCHEMA public TO triage;"
sudo -u postgres psql -d triage_desk -c "ALTER SCHEMA public OWNER TO triage;"

cat > "$API_DIR/.env" <<EOF
DATABASE_URL="postgresql://triage:${DB_PASS}@127.0.0.1:5432/triage_desk?schema=public"
DB_PASS="${DB_PASS}"
JWT_SECRET="${JWT_SECRET}"
PORT=3001
PUBLIC_ORIGIN="${PUBLIC_ORIGIN}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
LLM_PROVIDER="${LLM_PROVIDER}"
LLM_BASE_URL="${LLM_BASE_URL}"
LLM_MODEL="${LLM_MODEL}"
EOF
chmod 600 "$API_DIR/.env"

cd "$APP_DIR"
export NODE_OPTIONS=--max-old-space-size=512
pnpm install --frozen-lockfile || pnpm install
pnpm --filter @triagedesk/web build
cd "$API_DIR"
pnpm exec prisma generate
pnpm exec prisma db push
pnpm db:seed
pnpm db:repair

id -u triage-desk >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin triage-desk
chown -R root:root "$APP_DIR"
chmod -R go-w "$APP_DIR"
chown root:triage-desk "$API_DIR/.env"
chmod 640 "$API_DIR/.env"

cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/triage-desk
ln -sfn /etc/nginx/sites-available/triage-desk /etc/nginx/sites-enabled/triage-desk
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cp "$APP_DIR/deploy/triage-desk-api.service" /etc/systemd/system/triage-desk-api.service
systemctl daemon-reload
systemctl enable triage-desk-api
systemctl restart triage-desk-api
systemctl is-active --quiet triage-desk-api

echo
echo "Up at ${PUBLIC_ORIGIN}"
echo "Accounts are seeded once as admin / agent / user with password desk-2026."
echo "Existing account passwords are preserved; change first-run passwords immediately."
