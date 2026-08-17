#!/bin/sh
set -eu

mc alias set test http://minio-loadtest:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing test/sgs-loadtest-dds-test >/dev/null
mc anonymous set none test/sgs-loadtest-dds-test >/dev/null
mc anonymous get test/sgs-loadtest-dds-test
