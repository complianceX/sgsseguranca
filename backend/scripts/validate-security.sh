#!/bin/bash

# Script de validação de segurança para produção
# Atualizado para Redis tier-aware / MFA / AV-CDR

echo "🔒 Validando configurações de segurança..."
echo ""

REQUESTED_ENV_FILE="${ENV_FILE:-}"

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

check_any_var() {
    local label=$1
    local min_length=$2
    local required=$3
    shift 3
    local keys=("$@")

    for key in "${keys[@]}"; do
        local value="${!key}"
        if [ -n "$value" ]; then
            check_var "$label" "$value" "$min_length" "true"
            return $?
        fi
    done

    if [ "$required" = "true" ]; then
        echo -e "${RED}❌ $label não configurado${NC}"
        ((ERRORS++))
        return 1
    fi

    echo -e "${YELLOW}⚠️  $label não configurado (opcional)${NC}"
    ((WARNINGS++))
    return 1
}

load_env_file() {
    local env_file=$1
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" != *=* ]] && continue

        local key="${line%%=*}"
        local value="${line#*=}"
        key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        if [ -n "${!key+x}" ] && [ -n "${!key}" ]; then
            continue
        fi

        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
            value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
            value="${value:1:${#value}-2}"
        fi

        export "$key=$value"
    done < "$env_file"
}

# Carregar .env
ENV_PATH=""
if [ -n "$REQUESTED_ENV_FILE" ] && [ -f "$REQUESTED_ENV_FILE" ]; then
    ENV_PATH="$REQUESTED_ENV_FILE"
elif [ -f .env ]; then
    ENV_PATH=".env"
elif [ -f .env.local ]; then
    ENV_PATH=".env.local"
elif [ -f test/.env ]; then
    ENV_PATH="test/.env"
fi

if [ -z "$ENV_PATH" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env/.env.local/test/.env não encontrado; usando variáveis do ambiente atual${NC}"
    ((WARNINGS++))
else
    load_env_file "$ENV_PATH"
fi

echo "📋 Verificando variáveis de ambiente..."
echo ""

# 1. Ambiente
echo "1️⃣  AMBIENTE"
check_var "NODE_ENV" "$NODE_ENV" "" "true"
if [ "$NODE_ENV" != "production" ] && [ "$NODE_ENV" != "development" ] && [ "$NODE_ENV" != "test" ]; then
    echo -e "${RED}❌ NODE_ENV deve ser 'production', 'development' ou 'test'${NC}"
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
if [ "${REDIS_DISABLED,,}" = "true" ]; then
    echo -e "${YELLOW}⚠️  REDIS_DISABLED=true — validação de Redis ignorada${NC}"
    ((WARNINGS++))
else
    if [ -n "$REDIS_URL$URL_REDIS$REDIS_PUBLIC_URL$REDIS_HOST" ]; then
        GENERIC_REDIS=true
    else
        GENERIC_REDIS=false
    fi

    if [ "$NODE_ENV" = "production" ]; then
        if [ "$GENERIC_REDIS" = "true" ]; then
            check_any_var "Fallback Redis genérico" "" "true" REDIS_URL URL_REDIS REDIS_PUBLIC_URL REDIS_HOST
            echo -e "${YELLOW}⚠️  Redis em produção está usando fallback genérico. Prefira REDIS_AUTH_URL/REDIS_CACHE_URL/REDIS_QUEUE_URL.${NC}"
            ((WARNINGS++))
        else
            check_any_var "REDIS_AUTH_URL" "" "true" REDIS_AUTH_URL
            check_any_var "REDIS_CACHE_URL" "" "true" REDIS_CACHE_URL
            check_any_var "REDIS_QUEUE_URL" "" "true" REDIS_QUEUE_URL
        fi
    else
        check_any_var "Redis AUTH" "" "false" REDIS_AUTH_URL REDIS_URL URL_REDIS REDIS_PUBLIC_URL REDIS_HOST
        check_any_var "Redis CACHE" "" "false" REDIS_CACHE_URL REDIS_URL URL_REDIS REDIS_PUBLIC_URL REDIS_HOST
        check_any_var "Redis QUEUE" "" "false" REDIS_QUEUE_URL REDIS_URL URL_REDIS REDIS_PUBLIC_URL REDIS_HOST
    fi
fi
echo ""

# 5. Email
echo "5️⃣  EMAIL"
EMAIL_REQUIRED=true
if [ "$NODE_ENV" = "test" ]; then
    EMAIL_REQUIRED=false
fi
check_var "MAIL_HOST" "$MAIL_HOST" "" "$EMAIL_REQUIRED"
check_var "MAIL_PORT" "$MAIL_PORT" "" "$EMAIL_REQUIRED"
check_var "MAIL_USER" "$MAIL_USER" "" "$EMAIL_REQUIRED"
check_var "MAIL_PASS" "$MAIL_PASS" "" "$EMAIL_REQUIRED"
check_var "MAIL_FROM_EMAIL" "$MAIL_FROM_EMAIL" "" "$EMAIL_REQUIRED"
echo ""

# 6. AWS/R2
echo "6️⃣  AWS/R2 (OPCIONAL)"
check_var "AWS_ACCESS_KEY_ID" "$AWS_ACCESS_KEY_ID" "" "false"
check_var "AWS_SECRET_ACCESS_KEY" "$AWS_SECRET_ACCESS_KEY" "" "false"
check_var "AWS_S3_BUCKET" "$AWS_S3_BUCKET" "" "false"
echo ""

# 6.1 AV/CDR
echo "6️⃣.1 AV/CDR"
if [ -z "$ANTIVIRUS_PROVIDER" ]; then
    echo -e "${YELLOW}⚠️  ANTIVIRUS_PROVIDER não configurado${NC}"
    ((WARNINGS++))
elif [ "${ANTIVIRUS_PROVIDER,,}" = "clamav" ]; then
    check_var "CLAMAV_HOST" "$CLAMAV_HOST" "" "true"
    check_var "CLAMAV_PORT" "$CLAMAV_PORT" "" "true"
else
    echo -e "${YELLOW}⚠️  ANTIVIRUS_PROVIDER=$ANTIVIRUS_PROVIDER não possui validação específica neste script${NC}"
    ((WARNINGS++))
fi
echo ""

# 6.2 MFA
echo "6️⃣.2 MFA"
if [ -z "$MFA_ENABLED" ] || [ "${MFA_ENABLED,,}" = "true" ]; then
    check_var "MFA_TOTP_ENCRYPTION_KEY" "$MFA_TOTP_ENCRYPTION_KEY" "32" "$([ "$NODE_ENV" = "production" ] && echo true || echo false)"
else
    echo -e "${YELLOW}⚠️  MFA_ENABLED=false${NC}"
    ((WARNINGS++))
fi
echo ""

# 7. Verificações de Segurança Adicionais
echo "7️⃣  VERIFICAÇÕES DE SEGURANÇA"

# Verificar se há senhas fracas
if [ ! -z "$DATABASE_PASSWORD" ]; then
    if [[ "$DATABASE_PASSWORD" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}⚠️  DATABASE_PASSWORD contém apenas números (fraca)${NC}"
        ((WARNINGS++))
    elif [ "$NODE_ENV" != "test" ] && [ ${#DATABASE_PASSWORD} -lt 16 ]; then
        echo -e "${RED}❌ DATABASE_PASSWORD muito curta (mínimo: 16 caracteres)${NC}"
        ((ERRORS++))
    elif [ "$NODE_ENV" = "test" ] && [ ${#DATABASE_PASSWORD} -lt 16 ]; then
        echo -e "${YELLOW}⚠️  DATABASE_PASSWORD curta no ambiente de teste${NC}"
        ((WARNINGS++))
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

if [ "$NODE_ENV" = "production" ] && [ "${LEGACY_PASSWORD_AUTH_ENABLED,,}" = "true" ]; then
    echo -e "${RED}❌ LEGACY_PASSWORD_AUTH_ENABLED=true em produção${NC}"
    ((ERRORS++))
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
