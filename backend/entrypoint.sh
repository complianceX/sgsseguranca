#!/bin/sh
set -e

# Migrations devem rodar fora do boot (Railway Job/CI) para evitar corridas e downtime.
# Este entrypoint apenas inicia a aplicação.
exec node dist/main.js
