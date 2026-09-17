#!/usr/bin/env bash
#
# Rotates NEXA's PM2 logs: compresses each one into a dated copy, empties it in place, and deletes
# copies older than KEEP_DAYS. Run daily from cron (README, "Backups and logs").
#
# Only nexa-* logs: PM2 on this server also runs other people's apps, whose logs are not ours to
# rotate - which is why this isn't the global pm2-logrotate module.
#
set -euo pipefail

LOG_DIR=${PM2_LOG_DIR:-$HOME/.pm2/logs}
KEEP_DAYS=${KEEP_DAYS:-14}
stamp=$(date -u +%Y%m%d)

for log in "$LOG_DIR"/nexa-*.log; do
  [ -s "$log" ] || continue
  # Copy, then truncate: PM2 keeps the file open and appends, so it carries on in the empty file.
  gzip -c "$log" >"$log.$stamp.gz"
  : >"$log"
done

find "$LOG_DIR" -maxdepth 1 -name 'nexa-*.log.*.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) rotated nexa logs in $LOG_DIR"
