#!/usr/bin/env bash
#
# Runs every scenario against the load-test API, one after the other, and keeps what each one
# measured - k6's summary and the server's CPU and memory - under load/results/<label>.
#
#   load/run.sh before [scenario...]
#
set -euo pipefail

LABEL=${1:?label, e.g. before or after}
shift
SCENARIOS=${*:-login browse chat directory}
DIR=$HOME/nexa-load
OUT=$DIR/load/results/$LABEL
K6=$HOME/tools/k6
mkdir -p "$OUT"
cd "$DIR/load/k6"
git -C "$DIR" log -1 --format='%h %s' >"$OUT/commit.txt"

for scenario in $SCENARIOS; do
  # A fresh API for every scenario: work a previous one left queued - requests k6 gave up on keep
  # running on the server - would otherwise be measured as part of this one.
  pm2 restart nexa-load >/dev/null
  for attempt in $(seq 1 30); do
    curl -fsS http://127.0.0.1:4200/ready >/dev/null 2>&1 && break
    sleep 2
  done
  echo "==> $scenario ($(date -u +%T))"
  extra=()
  [ "$scenario" = directory ] && extra=(-e "MODE=${DIRECTORY_MODE:-all-pages}")
  "$K6" run --quiet --no-color -e LOAD_OUT="$DIR/load/out" -e RESULTS="$OUT" "${extra[@]}" \
    "$scenario.js" >"$OUT/$scenario.txt" 2>&1 &
  k6_pid=$!
  "$DIR/load/monitor.sh" "$k6_pid" >"$OUT/$scenario-host.csv"
  wait "$k6_pid" || true
  tail -n 12 "$OUT/$scenario.txt"
  # And a pause, so PostgreSQL has finished what the last one asked of it.
  sleep 30
done
