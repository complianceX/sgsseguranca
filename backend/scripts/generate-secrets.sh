#!/bin/bash

# Script para gerar secrets seguros para produção
# Data: 25/02/2026

echo "🔐 Gerando secrets seguros para produção..."
echo ""

# JWT Secret (64 caracteres)
echo "JWT_SECRET (64 caracteres):"
openssl rand -base64 48
echo ""

# Database Password (32 caracteres)
echo "DATABASE_PASSWORD (32 caracteres):"
openssl rand -base64 24
echo ""

# Redis Password (32 caracteres)
echo "REDIS_PASSWORD (32 caracteres):"
openssl rand -base64 24
echo ""

# API Key (32 caracteres)
echo "API_KEY (32 caracteres):"
openssl rand -hex 32
echo ""

echo "✅ Secrets gerados com sucesso!"
echo ""
echo "⚠️  IMPORTANTE:"
echo "1. Copie estes valores para o arquivo .env"
echo "2. NUNCA commite o arquivo .env"
echo "3. Use secrets manager em produção (Railway Secrets, AWS Secrets Manager)"
echo "4. Rotacione estes secrets regularmente (a cada 90 dias)"
