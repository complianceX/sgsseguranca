#!/bin/bash

# Script de validação de segurança para produção
# Data: 25/02/2026

echo "🔒 Validando configurações de segurança..."
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contadores
ERRORS=0
WARNINGS=0
PASSED=0

# Função para verificar variável
check_var() {
    local var_name=$1
    local var_value=$2
    local min_length=$3
    local required=$4

    if [ -z "$var_value" ]; then
        if [ "$required" = "true" ]; then
            echo -e "${RED}❌ $var_name não configurado${NC}"
            ((ERRORS++))
        else
            echo -e "${YELLOW}⚠️  $var_name não configurado (opcional)${NC}"
            ((WARNINGS++))
        fi
        return 1
    fi

    if [ ! -z "$min_length" ] && [ ${#var_value} -lt $min_length ]; then
        echo -e "${RED}❌ $var_name muito curto (mínimo: $min_length caracteres)${NC}"
        ((ERRORS++))
        return 1
    fi

    echo -e "${GREEN}✅ $var_name configurado${NC}"
    ((PASSED++))
    return 0
}

# Carregar .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${RED}❌ Arquivo .env não encontrado${NC}"
    exit 1
fi

echo "📋 Verificando variáveis de ambiente..."
echo ""

# 1. Ambiente
echo "1️⃣  AMBIENTE"
check_var "NODE_ENV" "$NODE_ENV" "" "true"
if [ "$NODE_ENV" != "production" ] && [ "$NODE_ENV" != "development" ]; then
    echo -e "${RED}❌ NODE_ENV deve ser 'production' ou 'development'${NC}"
    ((ERRORS++))
fi
echo ""

# 2. JWT
echo "2️⃣  JWT"
check_var "JWT_SECRET" "$JWT_SECRET" "32" "true"
check_var "JWT_EXPIRES_IN" "$JWT_EXPIRES_IN" "" "true"
echo ""

# 3. Banco de Dados
echo "3️⃣  BANCO DE DADOS"
if [ ! -z "$DATABASE_URL" ]; then
    check_var "DATABASE_URL" "$DATABASE_URL" "" "true"
else
    check_var "DATABASE_HOST" "$DATABASE_HOST" "" "true"
    check_var "DATABASE_PORT" "$DATABASE_PORT" "" "true"
    check_var "DATABASE_USER" "$DATABASE_USER" "" "true"
    check_var "DATABASE_PASSWORD" "$DATABASE_PASSWORD" "16" "true"
    check_var "DATABASE_NAME" "$DATABASE_NAME" "" "true"
fi

if [ "$NODE_ENV" = "production" ]; then
    if [ "$DATABASE_SSL" != "true" ]; then
        echo -e "${RED}❌ DATABASE_SSL deve ser 'true' em produção${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✅ DATABASE_SSL habilitado${NC}"
        ((PASSED++))
    fi
fi
echo ""

# 4. Redis
echo "4️⃣  REDIS"
if [ "$NODE_ENV" = "production" ]; then
    check_var "REDIS_HOST" "$REDIS_HOST" "" "true"
    check_var "REDIS_PORT" "$REDIS_PORT" "" "true"
    check_var "REDIS_PASSWORD" "$REDIS_PASSWORD" "16" "true"
else
    check_var "REDIS_HOST" "$REDIS_HOST" "" "false"
    check_var "REDIS_PORT" "$REDIS_PORT" "" "false"
fi
echo ""

# 5. Email
echo "5️⃣  EMAIL"
check_var "MAIL_HOST" "$MAIL_HOST" "" "true"
check_var "MAIL_PORT" "$MAIL_PORT" "" "true"
check_var "MAIL_USER" "$MAIL_USER" "" "true"
check_var "MAIL_PASS" "$MAIL_PASS" "" "true"
check_var "MAIL_FROM_EMAIL" "$MAIL_FROM_EMAIL" "" "true"
echo ""

# 6. AWS/R2
echo "6️⃣  AWS/R2 (OPCIONAL)"
check_var "AWS_ACCESS_KEY_ID" "$AWS_ACCESS_KEY_ID" "" "false"
check_var "AWS_SECRET_ACCESS_KEY" "$AWS_SECRET_ACCESS_KEY" "" "false"
check_var "AWS_S3_BUCKET" "$AWS_S3_BUCKET" "" "false"
echo ""

# 7. Verificações de Segurança Adicionais
echo "7️⃣  VERIFICAÇÕES DE SEGURANÇA"

# Verificar se há senhas fracas
if [ ! -z "$DATABASE_PASSWORD" ]; then
    if [[ "$DATABASE_PASSWORD" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}⚠️  DATABASE_PASSWORD contém apenas números (fraca)${NC}"
        ((WARNINGS++))
    elif [ ${#DATABASE_PASSWORD} -lt 16 ]; then
        echo -e "${RED}❌ DATABASE_PASSWORD muito curta (mínimo: 16 caracteres)${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✅ DATABASE_PASSWORD forte${NC}"
        ((PASSED++))
    fi
fi

# Verificar JWT_SECRET
if [ ! -z "$JWT_SECRET" ]; then
    if [ "$JWT_SECRET" = "dev_secret_key_change_in_production_min_32_chars" ]; then
        echo -e "${RED}❌ JWT_SECRET usando valor de exemplo (INSEGURO)${NC}"
        ((ERRORS++))
    elif [ ${#JWT_SECRET} -lt 32 ]; then
        echo -e "${RED}❌ JWT_SECRET muito curto (mínimo: 32 caracteres)${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✅ JWT_SECRET forte${NC}"
        ((PASSED++))
    fi
fi

echo ""

# 8. Resumo
echo "📊 RESUMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Passou: $PASSED${NC}"
echo -e "${YELLOW}⚠️  Avisos: $WARNINGS${NC}"
echo -e "${RED}❌ Erros: $ERRORS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Resultado final
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ VALIDAÇÃO FALHOU - Corrija os erros antes de fazer deploy${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  VALIDAÇÃO PASSOU COM AVISOS - Revise antes de fazer deploy${NC}"
    exit 0
else
    echo -e "${GREEN}✅ VALIDAÇÃO PASSOU - Sistema pronto para deploy${NC}"
    exit 0
fi
