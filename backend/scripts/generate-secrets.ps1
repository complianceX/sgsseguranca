# Script para gerar secrets seguros para produção
# Data: 25/02/2026

Write-Host "🔐 Gerando secrets seguros para produção..." -ForegroundColor Cyan
Write-Host ""

# Função para gerar string aleatória
function Get-RandomString {
    param (
        [int]$Length = 32
    )
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

# JWT Secret (64 caracteres)
Write-Host "JWT_SECRET (64 caracteres):" -ForegroundColor Yellow
Get-RandomString -Length 48
Write-Host ""

# Database Password (32 caracteres)
Write-Host "DATABASE_PASSWORD (32 caracteres):" -ForegroundColor Yellow
Get-RandomString -Length 24
Write-Host ""

# Redis Password (32 caracteres)
Write-Host "REDIS_PASSWORD (32 caracteres):" -ForegroundColor Yellow
Get-RandomString -Length 24
Write-Host ""

# API Key (32 caracteres hex)
Write-Host "API_KEY (32 caracteres):" -ForegroundColor Yellow
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ''
Write-Host ""

Write-Host "✅ Secrets gerados com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  IMPORTANTE:" -ForegroundColor Red
Write-Host "1. Copie estes valores para o arquivo .env"
Write-Host "2. NUNCA commite o arquivo .env"
Write-Host "3. Use secrets manager em produção (Railway Secrets, AWS Secrets Manager)"
Write-Host "4. Rotacione estes secrets regularmente (a cada 90 dias)"
