#!/bin/sh
set -e

if [ $# -gt 0 ]; then
  exec "$@"
fi

exec node dist/main.js
