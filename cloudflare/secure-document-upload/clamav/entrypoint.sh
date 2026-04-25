#!/bin/sh
set -eu

SIGNATURE_MAX_AGE_HOURS="${CLAMAV_SIGNATURE_MAX_AGE_HOURS:-24}"
CLAMD_PORT="${CLAMD_PORT:-3310}"
SCAN_API_PORT="${SCAN_API_PORT:-${PORT:-8080}}"

sed -i "s/^TCPSocket .*/TCPSocket ${CLAMD_PORT}/" /etc/clamav/clamd.conf
sed -i "s/^TCPAddr .*/TCPAddr 0.0.0.0/" /etc/clamav/clamd.conf

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

(
  while true; do
    freshclam --config-file=/etc/clamav/freshclam.conf || true
    sleep 3600
  done
) &
FRESHCLAM_LOOP_PID=$!

until nc -z 127.0.0.1 "$CLAMD_PORT"; do sleep 1; done

PORT="$SCAN_API_PORT" CLAMD_PORT="$CLAMD_PORT" node /app/scan-server.mjs &
API_PID=$!

cleanup() {
  kill "$API_PID" "$FRESHCLAM_LOOP_PID" "$CLAMD_PID" 2>/dev/null || true
}

trap 'cleanup; exit 0' INT TERM

while kill -0 "$API_PID" 2>/dev/null; do
  if ! nc -z 127.0.0.1 "$CLAMD_PORT"; then
    echo "[boot] clamd stopped responding; exiting fail-closed"
    cleanup
    exit 1
  fi
  sleep 5
done

echo "[boot] scanner api stopped; exiting fail-closed"
cleanup
exit 1
