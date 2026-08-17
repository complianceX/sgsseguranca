#!/bin/sh
set -eu

target=/opt/sgs-loadtest/infra/load-test/.env.storage-test
umask 077
minio_user="sgsdds$(openssl rand -hex 8)"
minio_password="$(openssl rand -hex 32)"

{
  printf '%s\n' "MINIO_ROOT_USER=$minio_user"
  printf '%s\n' "MINIO_ROOT_PASSWORD=$minio_password"
  printf '%s\n' 'AWS_BUCKET_NAME=sgs-loadtest-dds-test'
  printf '%s\n' 'AWS_S3_BUCKET=sgs-loadtest-dds-test'
  printf '%s\n' "AWS_ACCESS_KEY_ID=$minio_user"
  printf '%s\n' "AWS_SECRET_ACCESS_KEY=$minio_password"
  printf '%s\n' 'AWS_ENDPOINT=http://minio-loadtest:9000'
  printf '%s\n' 'AWS_REGION=us-east-1'
  printf '%s\n' 'DDS_PDF_SIGNED_URL_EXPIRY_SECONDS=5'
  printf '%s\n' 'DOCUMENT_DOWNLOAD_TOKEN_SECRET=synthetic-loadtest-document-download-secret-20260817'
} | sudo -n tee "$target" >/dev/null

sudo -n chmod 0600 "$target"
