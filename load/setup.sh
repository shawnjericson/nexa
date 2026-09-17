#!/usr/bin/env bash
#
# Prepares a load test on the server (load/README.md): a checkout of its own in ~/nexa-load -
# never the one serving production - an API on 127.0.0.1:4200 against nexa_test, a company of
# 20,000 people, k6, and access tokens.
#
#   load/setup.sh <commit> [--reseed]
#
# Running it again with another commit rebuilds the API and keeps the data, unless --reseed.
#
set -euo pipefail

COMMIT=${1:?commit to test}
RESEED=${2:-}
DIR=$HOME/nexa-load
PROD_ENV=$HOME/nexa.anhdlttech.io.vn/apps/api/.env
PORT=4200
K6_VERSION=v2.2.0
say() { printf '\n==> %s\n' "$*"; }

say "Checkout $COMMIT"
[ -d "$DIR/.git" ] || git clone --quiet https://github.com/shawnjericson/nexa.git "$DIR"
cd "$DIR"
git fetch --quiet origin
git checkout --quiet --detach "$COMMIT"
git log -1 --oneline

say "Install and build"
pnpm install --frozen-lockfile --reporter=silent
cd apps/api
if [ ! -f .env ]; then
  # Same database role as production, pointed at nexa_test; its own JWT secret, kept across runs
  # so minted tokens stay valid. No Redis: its Socket.IO adapter would join production's channel.
  test_url=$(PROD_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV" | cut -d= -f2- | tr -d '"') node -e '
    const url = new URL(process.env.PROD_URL); url.pathname = "/nexa_test"; console.log(url.toString());')
  umask 077
  cat >.env <<EOF
NODE_ENV=production
PORT=$PORT
LOG_LEVEL=warn
CORS_ORIGINS=http://127.0.0.1
TRUST_PROXY=0
RATE_LIMIT_ENABLED=false
DATABASE_URL=$test_url
DATABASE_SSL=false
JWT_ACCESS_SECRET=$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')
BCRYPT_ROUNDS=12
DEFAULT_ORG_SLUG=load
DEFAULT_ORG_NAME=Load test
SIGNUP_MODE=open
EOF
fi
pnpm db:generate >/dev/null
pnpm db:deploy >/dev/null
pnpm build >/dev/null

url=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
if [ "$RESEED" = "--reseed" ]; then
  say "Empty nexa_test"
  psql "$url" -X -q -c 'TRUNCATE TABLE organizations, users, processed_events, pending_audit_events CASCADE'
fi

say "Start the API on $PORT"
if pm2 describe nexa-load >/dev/null 2>&1; then
  pm2 restart nexa-load --update-env >/dev/null
else
  # Not saved to PM2's dump: after a reboot the load-test API stays off.
  pm2 start dist/server.js --name nexa-load --cwd "$DIR/apps/api" >/dev/null
fi
for attempt in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$PORT/ready"; echo

if [ "$(psql "$url" -X -t -A -c "SELECT count(*) FROM organizations WHERE slug = 'load'")" = "0" ]; then
  say "Seed"
  # The first account creates the organization with its roles, the way it happens for real.
  curl -fsS -o /dev/null -X POST "http://127.0.0.1:$PORT/api/v1/auth/register" \
    -H 'Content-Type: application/json' \
    -d '{"email":"owner@load.nexa.local","username":"loadowner","password":"loadtest123"}'
  hash=$(node -e 'require("bcryptjs").hash("loadtest123", 12).then(console.log)' 2>/dev/null ||
    node -e 'import("@node-rs/bcrypt").then((b) => b.hash("loadtest123", 12)).then(console.log)')
  psql "$url" -X -q -v users=20000 -v posts=200000 -v password_hash="$hash" -f "$DIR/load/seed.sql"
fi

if [ ! -x "$HOME/tools/k6" ]; then
  say "k6 $K6_VERSION"
  mkdir -p "$HOME/tools" && cd "$HOME/tools"
  base=https://github.com/grafana/k6/releases/download/$K6_VERSION
  curl -fsSLO "$base/k6-$K6_VERSION-linux-amd64.tar.gz"
  curl -fsSL "$base/k6-$K6_VERSION-checksums.txt" | grep "linux-amd64.tar.gz" | sha256sum -c -
  tar -xzf "k6-$K6_VERSION-linux-amd64.tar.gz" --strip-components=1 "k6-$K6_VERSION-linux-amd64/k6"
  rm "k6-$K6_VERSION-linux-amd64.tar.gz"
fi

say "Tokens"
cd "$DIR/apps/api"
npx tsx scripts/load-tokens.ts "$DIR/load/out"
