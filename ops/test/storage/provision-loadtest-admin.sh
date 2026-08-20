#!/usr/bin/env sh
set -eu

env_file=/opt/sgs-loadtest/infra/load-test/.env.loadtest
admin_env_file=/opt/sgs-loadtest/infra/load-test/.env.admin
postgres_container=sgs-loadtest-postgres-loadtest-1

test -f "$env_file"
db_user="$(docker exec "$postgres_container" printenv POSTGRES_USER)"
admin_password="$(openssl rand -hex 32)"

docker exec "$postgres_container" psql \
  -v ON_ERROR_STOP=1 \
  -U "$db_user" \
  -d sgs_loadtest \
  -c "GRANT sgs_rls_bypass TO sgs_admin; ALTER ROLE sgs_admin LOGIN PASSWORD '$admin_password';" \
  >/dev/null

temporary_env="$(mktemp)"
trap 'rm -f "$temporary_env"; unset admin_password' EXIT
printf 'DATABASE_ADMIN_URL=postgresql://sgs_admin:%s@postgres-loadtest:5432/sgs_loadtest\n' \
  "$admin_password" >> "$temporary_env"
install -m 600 "$temporary_env" "$admin_env_file"

echo 'loadtest-admin=provisioned-without-printing-credentials'
