#!/bin/bash

# Script de instalação das melhorias (Linux/Mac)

set -e

echo "========================================"
echo "Instalando Melhorias do Sistema"
echo "========================================"
echo ""

echo "[1/3] Instalando dependência compression..."
npm install compression
echo "✅ compression instalado!"
echo ""

echo "[2/3] Executando migration de índices..."
read -sp "Digite a senha do banco (DATABASE_PASSWORD): " DB_PASSWORD
echo ""

export PGPASSWORD=$DB_PASSWORD

# Tentar com Docker primeiro
if docker-compose exec -T db psql -U sst_user -d sst < src/database/migrations/add-performance-indexes.sql; then
    echo "✅ Índices instalados via Docker!"
else
    echo "⚠️  Tentando conexão direta..."
    if psql -h localhost -U sst_user -d sst -f src/database/migrations/add-performance-indexes.sql; then
        echo "✅ Índices instalados!"
    else
        echo "❌ Falha ao instalar índices"
        exit 1
    fi
fi
echo ""

echo "[3/3] Rebuild containers..."
docker-compose down
docker-compose up -d --build
echo ""

echo "Aguardando containers iniciarem..."
sleep 15
echo ""

echo "========================================"
echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo "========================================"
echo ""

echo "Testando sistema..."
curl -s http://localhost:3001/health
echo ""
echo ""

echo "Sistema pronto para uso! 🚀"
echo ""
