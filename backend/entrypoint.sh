#!/bin/sh
set -e

MAX_RETRIES=10
WAIT_SECONDS=5
COUNT=0

echo "==> [entrypoint] Running database migrations..."

until npm run migration:run; do
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
    echo "==> [entrypoint] ERROR: migrations failed after ${MAX_RETRIES} attempts. Aborting."
    exit 1
  fi
  echo "==> [entrypoint] Attempt ${COUNT}/${MAX_RETRIES} failed. Retrying in ${WAIT_SECONDS}s..."
  sleep "$WAIT_SECONDS"
done

echo "==> [entrypoint] Migrations OK. Starting application..."
exec node dist/main.js
