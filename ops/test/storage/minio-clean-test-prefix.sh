#!/bin/sh
set -eu

mc alias set test http://minio-loadtest:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc rm --recursive --force test/sgs-loadtest-dds-test/quarantine/ >/dev/null 2>&1 || true
mc rm --recursive --force test/sgs-loadtest-dds-test/documents/ >/dev/null 2>&1 || true
remaining="$(mc ls --recursive test/sgs-loadtest-dds-test 2>/dev/null | wc -l | tr -d ' ')"
echo "STORAGE_TEST_OBJECT_COUNT=${remaining}"
