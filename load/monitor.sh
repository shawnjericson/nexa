#!/usr/bin/env bash
#
# Samples the server every 5 seconds while a scenario runs: CPU use, load, memory, and the
# resident memory of the load-test API and of PostgreSQL. Stops when the given PID exits.
#
#   load/monitor.sh <pid-to-follow> > results/<scenario>-host.csv
#
set -euo pipefail
follow=${1:?pid to follow}

echo "time,cpu_busy_pct,load1,mem_used_mb,api_rss_mb,postgres_rss_mb"
read -r _ u n s i w q sq st _ < /proc/stat
prev_busy=$((u + n + s + q + sq + st)); prev_total=$((prev_busy + i + w))
while kill -0 "$follow" 2>/dev/null; do
  sleep 5
  read -r _ u n s i w q sq st _ < /proc/stat
  busy=$((u + n + s + q + sq + st)); total=$((busy + i + w))
  cpu=$(( (busy - prev_busy) * 100 / (total - prev_total) ))
  prev_busy=$busy; prev_total=$total
  load=$(cut -d' ' -f1 /proc/loadavg)
  mem=$(free -m | awk '/^Mem:/ {print $3}')
  api=$(ps -o rss= -p "$(pgrep -f 'nexa-load/apps/api/dist/server.js' | head -1)" 2>/dev/null | awk '{print int($1/1024)}')
  pg=$(ps -C postgres -o rss= 2>/dev/null | awk '{s+=$1} END {print int(s/1024)}')
  echo "$(date -u +%T),$cpu,$load,$mem,${api:-0},${pg:-0}"
done
