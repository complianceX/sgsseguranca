# Script para rodar migration de checklists em ambiente de producao
# Data: 24/02/2026

Write-Host "🚀 Rodando migration: add-template-fields-to-checklists" -ForegroundColor Cyan

# Ler DATABASE_URL do ambiente (deve estar nas variáveis de ambiente)
$DATABASE_URL = $env:DATABASE_URL

if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL não encontrada. Configure a variável de ambiente." -ForegroundColor Red
    Write-Host "Execute: `$env:DATABASE_URL = 'postgresql://...' " -ForegroundColor Yellow
    exit 1
}

# Executar migration SQL usando psql
$migrationFile = "migrations/add-template-fields-to-checklists.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Arquivo de migration não encontrado: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Executando SQL..." -ForegroundColor Yellow
psql $DATABASE_URL -f $migrationFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration executada com sucesso!" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao executar migration (código: $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}
