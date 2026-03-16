#!/bin/sh
set -e

echo "[entrypoint] args=$# | NODE=$(node --version) | CWD=$(pwd)"
echo "[entrypoint] PORT=${PORT:-NOT_SET} | NODE_ENV=${NODE_ENV:-NOT_SET}"
ls dist/main.js 2>/dev/null && echo "[entrypoint] dist/main.js OK" || echo "[entrypoint] dist/main.js MISSING"

if [ $# -gt 0 ]; then
  echo "[entrypoint] forwarding to: $@"
  exec "$@"
fi

echo "[entrypoint] starting node dist/main.js"
exec node dist/main.js
