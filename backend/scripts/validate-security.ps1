# Script de validação de segurança para produção
# Data: 25/02/2026

Write-Host "🔒 Validando configurações de segurança..." -ForegroundColor Cyan
Write-Host ""

# Contadores
$script:ERRORS = 0
$script:WARNINGS = 0
$script:PASSED = 0

# Função para verificar variável
function Test-EnvVar {
    param (
        [string]$VarName,
        [string]$VarValue,
        [int]$MinLength = 0,
        [bool]$Required = $false
    )

    if ([string]::IsNullOrEmpty($VarValue)) {
        if ($Required) {
            Write-Host "❌ $VarName não configurado" -ForegroundColor Red
            $script:ERRORS++
        } else {
            Write-Host "⚠️  $VarName não configurado (opcional)" -ForegroundColor Yellow
            $script:WARNINGS++
        }
        return $false
    }

    if ($MinLength -gt 0 -and $VarValue.Length -lt $MinLength) {
        Write-Host "❌ $VarName muito curto (mínimo: $MinLength caracteres)" -ForegroundColor Red
        $script:ERRORS++
        return $false
    }

    Write-Host "✅ $VarName configurado" -ForegroundColor Green
    $script:PASSED++
    return $true
}

# Carregar .env
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
} else {
    Write-Host "❌ Arquivo .env não encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Verificando variáveis de ambiente..." -ForegroundColor Cyan
Write-Host ""

# 1. Ambiente
Write-Host "1️⃣  AMBIENTE" -ForegroundColor Cyan
$NODE_ENV = $env:NODE_ENV
Test-EnvVar -VarName "NODE_ENV" -VarValue $NODE_ENV -Required $true
if ($NODE_ENV -ne "production" -and $NODE_ENV -ne "development") {
    Write-Host "❌ NODE_ENV deve ser 'production' ou 'development'" -ForegroundColor Red
    $script:ERRORS++
}
Write-Host ""

# 2. JWT
Write-Host "2️⃣  JWT" -ForegroundColor Cyan
Test-EnvVar -VarName "JWT_SECRET" -VarValue $env:JWT_SECRET -MinLength 32 -Required $true
Test-EnvVar -VarName "JWT_EXPIRES_IN" -VarValue $env:JWT_EXPIRES_IN -Required $true
Write-Host ""

# 3. Banco de Dados
Write-Host "3️⃣  BANCO DE DADOS" -ForegroundColor Cyan
if ($env:DATABASE_URL) {
    Test-EnvVar -VarName "DATABASE_URL" -VarValue $env:DATABASE_URL -Required $true
} else {
    Test-EnvVar -VarName "DATABASE_HOST" -VarValue $env:DATABASE_HOST -Required $true
    Test-EnvVar -VarName "DATABASE_PORT" -VarValue $env:DATABASE_PORT -Required $true
    Test-EnvVar -VarName "DATABASE_USER" -VarValue $env:DATABASE_USER -Required $true
    Test-EnvVar -VarName "DATABASE_PASSWORD" -VarValue $env:DATABASE_PASSWORD -MinLength 16 -Required $true
    Test-EnvVar -VarName "DATABASE_NAME" -VarValue $env:DATABASE_NAME -Required $true
}

if ($NODE_ENV -eq "production") {
    if ($env:DATABASE_SSL -ne "true") {
        Write-Host "❌ DATABASE_SSL deve ser 'true' em produção" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "✅ DATABASE_SSL habilitado" -ForegroundColor Green
        $script:PASSED++
    }
}
Write-Host ""

# 4. Redis
Write-Host "4️⃣  REDIS" -ForegroundColor Cyan
if ($NODE_ENV -eq "production") {
    Test-EnvVar -VarName "REDIS_HOST" -VarValue $env:REDIS_HOST -Required $true
    Test-EnvVar -VarName "REDIS_PORT" -VarValue $env:REDIS_PORT -Required $true
    Test-EnvVar -VarName "REDIS_PASSWORD" -VarValue $env:REDIS_PASSWORD -MinLength 16 -Required $true
} else {
    Test-EnvVar -VarName "REDIS_HOST" -VarValue $env:REDIS_HOST -Required $false
    Test-EnvVar -VarName "REDIS_PORT" -VarValue $env:REDIS_PORT -Required $false
}
Write-Host ""

# 5. Email
Write-Host "5️⃣  EMAIL" -ForegroundColor Cyan
Test-EnvVar -VarName "MAIL_HOST" -VarValue $env:MAIL_HOST -Required $true
Test-EnvVar -VarName "MAIL_PORT" -VarValue $env:MAIL_PORT -Required $true
Test-EnvVar -VarName "MAIL_USER" -VarValue $env:MAIL_USER -Required $true
Test-EnvVar -VarName "MAIL_PASS" -VarValue $env:MAIL_PASS -Required $true
Test-EnvVar -VarName "MAIL_FROM_EMAIL" -VarValue $env:MAIL_FROM_EMAIL -Required $true
Write-Host ""

# 6. AWS/R2
Write-Host "6️⃣  AWS/R2 (OPCIONAL)" -ForegroundColor Cyan
Test-EnvVar -VarName "AWS_ACCESS_KEY_ID" -VarValue $env:AWS_ACCESS_KEY_ID -Required $false
Test-EnvVar -VarName "AWS_SECRET_ACCESS_KEY" -VarValue $env:AWS_SECRET_ACCESS_KEY -Required $false
Test-EnvVar -VarName "AWS_S3_BUCKET" -VarValue $env:AWS_S3_BUCKET -Required $false
Write-Host ""

# 7. Verificações de Segurança Adicionais
Write-Host "7️⃣  VERIFICAÇÕES DE SEGURANÇA" -ForegroundColor Cyan

# Verificar se há senhas fracas
if ($env:DATABASE_PASSWORD) {
    if ($env:DATABASE_PASSWORD -match '^\d+$') {
        Write-Host "⚠️  DATABASE_PASSWORD contém apenas números (fraca)" -ForegroundColor Yellow
        $script:WARNINGS++
    } elseif ($env:DATABASE_PASSWORD.Length -lt 16) {
        Write-Host "❌ DATABASE_PASSWORD muito curta (mínimo: 16 caracteres)" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "✅ DATABASE_PASSWORD forte" -ForegroundColor Green
        $script:PASSED++
    }
}

# Verificar JWT_SECRET
if ($env:JWT_SECRET) {
    if ($env:JWT_SECRET -eq "dev_secret_key_change_in_production_min_32_chars") {
        Write-Host "❌ JWT_SECRET usando valor de exemplo (INSEGURO)" -ForegroundColor Red
        $script:ERRORS++
    } elseif ($env:JWT_SECRET.Length -lt 32) {
        Write-Host "❌ JWT_SECRET muito curto (mínimo: 32 caracteres)" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "✅ JWT_SECRET forte" -ForegroundColor Green
        $script:PASSED++
    }
}

Write-Host ""

# 8. Resumo
Write-Host "📊 RESUMO" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "✅ Passou: $script:PASSED" -ForegroundColor Green
Write-Host "⚠️  Avisos: $script:WARNINGS" -ForegroundColor Yellow
Write-Host "❌ Erros: $script:ERRORS" -ForegroundColor Red
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

# Resultado final
if ($script:ERRORS -gt 0) {
    Write-Host "❌ VALIDAÇÃO FALHOU - Corrija os erros antes de fazer deploy" -ForegroundColor Red
    exit 1
} elseif ($script:WARNINGS -gt 0) {
    Write-Host "⚠️  VALIDAÇÃO PASSOU COM AVISOS - Revise antes de fazer deploy" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "✅ VALIDAÇÃO PASSOU - Sistema pronto para deploy" -ForegroundColor Green
    exit 0
}
