#!/usr/bin/env bash
set -euo pipefail
fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT
scheme="$(printf '%b' '\\x70\\x6f\\x73\\x74\\x67\\x72\\x65\\x73')"
separator="$(printf '%b' '\\x3a\\x2f\\x2f')"
at_sign="$(printf '%b' '\\x40')"
fixture_user="$(printf '%s%s' fixture user)"
fixture_password="$(openssl rand -hex 24)"
fixture_host="$(printf '%s%s' local host)"
fixture_port="$(printf '%s%s' 54 32)"
fixture_db="$(printf '%s%s' fixture _db)"
printf '%s%s%s:%s%s%s/%s\n' "$scheme" "$separator" "$fixture_user" "$fixture_password" "$at_sign" "$fixture_host:$fixture_port" "$fixture_db" > "$fixture_dir/disposable.txt"
set +e
docker run --rm -v "$fixture_dir:/scan:ro" ghcr.io/trufflesecurity/trufflehog:3.96.0 filesystem --detectors Postgres --json --no-update --fail /scan > "$fixture_dir/result.json" 2> "$fixture_dir/stderr.log"
status=$?
set -e
if [ "$status" -eq 0 ]; then
  echo "TruffleHog inversion failed: disposable fixture was not detected."
  exit 1
fi
echo "TruffleHog inversion passed: disposable fixture was detected and removed."
