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
  echo "==> $scenario ($(date -u +%T))"
  extra=()
  [ "$scenario" = directory ] && extra=(-e "MODE=${DIRECTORY_MODE:-all-pages}")
  "$K6" run --quiet --no-color -e LOAD_OUT="$DIR/load/out" -e RESULTS="$OUT" "${extra[@]}" \
    "$scenario.js" >"$OUT/$scenario.txt" 2>&1 &
  k6_pid=$!
  "$DIR/load/monitor.sh" "$k6_pid" >"$OUT/$scenario-host.csv"
  wait "$k6_pid" || true
  tail -n 12 "$OUT/$scenario.txt"
  # Let the server settle, so one scenario's backlog isn't measured in the next.
  sleep 30
done
