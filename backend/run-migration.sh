#!/bin/bash

# Script para rodar migration de checklists no Railway
# Data: 24/02/2026

echo "🚀 Rodando migration: add-template-fields-to-checklists"

# Executar migration SQL
psql $DATABASE_URL -f migrations/add-template-fields-to-checklists.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration executada com sucesso!"
else
    echo "❌ Erro ao executar migration"
    exit 1
fi
