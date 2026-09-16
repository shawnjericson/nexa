#!/usr/bin/env bash
#
# Updates the running server to a commit and restarts it (see README, "Deploying").
#
# This is what the CI deploy key is allowed to run, and nothing else: the key in
# ~/.ssh/authorized_keys carries command="…/scripts/deploy.sh", so a leaked key can
# deploy but cannot open a shell. The commit to deploy is read from the forced
# command's arguments, so CI deploys exactly the revision it tested.
#
# Run by hand with:  scripts/deploy.sh [<commit-ish>]
#
set -euo pipefail

APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BRANCH=${DEPLOY_BRANCH:-master}
LOCK=/tmp/nexa-deploy.lock
API_READY=http://127.0.0.1:4100/ready
WEB_URL=http://127.0.0.1:3100/login

# Arguments come either from the command line or, over SSH, from the original command.
read -r -a ARGS <<<"${1:-${SSH_ORIGINAL_COMMAND:-}}"
TARGET=${ARGS[0]:-}

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# One deploy at a time: two pushes in a row must not build over each other.
exec 9>"$LOCK"
if ! flock -w 600 9; then
  echo "another deploy is still running (waited 10 minutes)" >&2
  exit 1
fi

cd "$APP_DIR"
PREVIOUS=$(git rev-parse HEAD)

say "Fetching $BRANCH"
git fetch --prune --quiet origin "$BRANCH"
if [ -z "$TARGET" ]; then
  TARGET=origin/$BRANCH
elif ! [[ $TARGET =~ ^[0-9a-f]{40}$ ]]; then
  echo "refusing to deploy '$TARGET': pass a full commit SHA" >&2
  exit 2
fi
git reset --hard --quiet "$TARGET"
echo "$PREVIOUS -> $(git rev-parse HEAD)  $(git log -1 --pretty=%s)"

say "Installing dependencies"
pnpm install --frozen-lockfile

# The generated Prisma client is not in the repository: without this the server would
# keep a client built from an older schema, and new models would be undefined at runtime.
say "Generating the Prisma client"
pnpm --filter @nexa/api db:generate

say "Applying migrations"
pnpm --filter @nexa/api db:deploy

say "Building"
pnpm --filter @nexa/api build
pnpm --filter @nexa/web build

say "Restarting"
pm2 restart nexa-api nexa-web --update-env

# A failed check leaves the new code in place on purpose: migrations have already run,
# so rolling the code back automatically could be worse than stopping for a human.
say "Checking"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$API_READY" | grep -q '"status":"ready"'; then
    api_ok=1
    break
  fi
  sleep 2
done
if [ "${api_ok:-}" != 1 ]; then
  echo "the API did not become ready" >&2
  pm2 logs nexa-api --lines 40 --nostream >&2 || true
  exit 1
fi
curl -fsS --max-time 10 -o /dev/null "$WEB_URL" || {
  echo "the web app did not answer" >&2
  pm2 logs nexa-web --lines 40 --nostream >&2
  exit 1
}

say "Deployed $(git rev-parse --short HEAD)"
