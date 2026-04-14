#!/bin/sh
set -eu

SIGNATURE_MAX_AGE_HOURS="${CLAMAV_SIGNATURE_MAX_AGE_HOURS:-24}"

signature_is_fresh() {
  if [ ! -f /var/lib/clamav/freshclam.dat ]; then
    return 1
  fi

  now_epoch="$(date +%s)"
  freshclam_epoch="$(stat -c %Y /var/lib/clamav/freshclam.dat 2>/dev/null || echo 0)"
  max_age_seconds="$((SIGNATURE_MAX_AGE_HOURS * 3600))"

  [ $((now_epoch - freshclam_epoch)) -le "$max_age_seconds" ]
}

echo "[boot] updating signatures"
if ! freshclam --config-file=/etc/clamav/freshclam.conf; then
  if ! signature_is_fresh; then
    echo "[boot] signatures unavailable or stale; exiting fail-closed"
    exit 1
  fi
fi

clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

freshclam -d --foreground=true --config-file=/etc/clamav/freshclam.conf &
FRESHCLAM_PID=$!

until nc -z 127.0.0.1 3310; do sleep 1; done

node /app/scan-server.mjs &
API_PID=$!

trap 'kill $API_PID $FRESHCLAM_PID $CLAMD_PID' INT TERM
wait -n $API_PID $FRESHCLAM_PID $CLAMD_PID
exit 1
