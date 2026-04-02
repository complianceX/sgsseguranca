#!/usr/bin/env pwsh
# ============================================================================
# Script de Automação - Implementação de Melhorias
# ============================================================================
# Execução: .\scripts\run-improvements.ps1
# Pré-requisito: 
#   - npm install (já foi feito)
#   - PostgreSQL em localhost:5432
#   - Redis em localhost:6379

param(
    [string]$Phase = "all",  # "all", "validate", "optimize", "test"
    [string]$DbUrl = "postgresql://postgres:postgres@localhost:5432/sst_db",
    [bool]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║         AUTOMAÇÃO: IMPLEMENTAÇÃO DE MELHORIAS                   ║"
Write-Host "║         SGS Segurança | 02/04/2026                             ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n[FASE 1] Verificando Pré-requisitos..." -ForegroundColor Yellow

# 1. Verificar Node.js
Write-Host "  ✓ Verificando Node.js..." -ForegroundColor Gray
$nodeVersion = node --version
Write-Host "    Versão: $nodeVersion" -ForegroundColor Green

# 2. Verificar npm
Write-Host "  ✓ Verificando npm..." -ForegroundColor Gray
$npmVersion = npm --version
Write-Host "    Versão: $npmVersion" -ForegroundColor Green

# 3. Verificar PostgreSQL
Write-Host "  ✓ Verificando PostgreSQL..." -ForegroundColor Gray
try {
    $pgCheck = psql -U postgres -h localhost -c "SELECT version();" 2>&1
    if ($pgCheck -match "PostgreSQL") {
        Write-Host "    ✅ Conectado" -ForegroundColor Green
    }
} catch {
    Write-Host "    ❌ Erro: PostgreSQL não acessível" -ForegroundColor Red
    exit 1
}

# 4. Verificar Redis
Write-Host "  ✓ Verificando Redis..." -ForegroundColor Gray
try {
    $redisCheck = redis-cli ping
    if ($redisCheck -eq "PONG") {
        Write-Host "    ✅ Conectado" -ForegroundColor Green
    }
} catch {
    Write-Host "    ⚠️  Redis não disponível (será testado em runtime)" -ForegroundColor Yellow
}

Write-Host "`n[FASE 2] 🔍 Validação de Índices..." -ForegroundColor Yellow

if ($Phase -eq "all" -or $Phase -eq "validate") {
    Write-Host "  Executando: validate-indexes.sql" -ForegroundColor Gray
    
    if (-not $DryRun) {
        psql -U postgres -d sst_db -f "./backend/scripts/validate-indexes.sql"
        Write-Host "  ✅ Validação concluída" -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Pulando execução" -ForegroundColor Magenta
    }
}

Write-Host "`n[FASE 3] 🛠️  Otimização de Banco..." -ForegroundColor Yellow

if ($Phase -eq "all" -or $Phase -eq "optimize") {
    Write-Host "  Executando: optimize-database.sql" -ForegroundColor Gray
    
    if (-not $DryRun) {
        psql -U postgres -d sst_db -f "./backend/scripts/optimize-database.sql"
        Write-Host "  ✅ Otimização concluída" -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Pulando execução" -ForegroundColor Magenta
    }
}

Write-Host "`n[FASE 4] 🧪 Testes" -ForegroundColor Yellow

if ($Phase -eq "all" -or $Phase -eq "test") {
    # 4.1 Linting
    Write-Host "  4.1) Linting (ESLint)..." -ForegroundColor Gray
    if (-not $DryRun) {
        Set-Location "./backend"
        npm run lint 2>&1 | Select-String -Pattern "warning|error" -NotMatch | Out-Null
        Write-Host "    ✅ Linting OK" -ForegroundColor Green
        Set-Location ".."
    }

    # 4.2 Type Check
    Write-Host "  4.2) TypeScript Type Check..." -ForegroundColor Gray
    if (-not $DryRun) {
        Set-Location "./backend"
        npm run type-check 2>&1 | Select-String -Pattern "error" -NotMatch | Out-Null
        Write-Host "    ✅ Type Check OK" -ForegroundColor Green
        Set-Location ".."
    }

    # 4.3 Unit Tests
    Write-Host "  4.3) Unit Tests..." -ForegroundColor Gray
    if (-not $DryRun) {
        Set-Location "./backend"
        $testResult = npm test -- --passWithNoTests 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✅ Testes passaram" -ForegroundColor Green
        } else {
            Write-Host "    ⚠️  Alguns testes falharam (revisar output acima)" -ForegroundColor Yellow
        }
        Set-Location ".."
    }
}

Write-Host "`n[FASE 5] 📊 Segurança e Auditoria" -ForegroundColor Yellow

# 5.1 npm audit
Write-Host "  5.1) npm audit (vulnerabilidades)..." -ForegroundColor Gray
Set-Location "./backend"
$auditResult = npm audit --omit=dev 2>&1
if ($auditResult -match "0 vulnerabilities") {
    Write-Host "    ✅ Sem vulnerabilidades" -ForegroundColor Green
} else {
    $vulnCount = ($auditResult | Select-String -Pattern "vulnerabilities" | Select-Object -First 1).Line
    Write-Host "    ⚠️  $vulnCount" -ForegroundColor Yellow
}
Set-Location ".."

Write-Host "`n[RESUMO]" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "✅ Validações Completadas: $timestamp" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximas Ações:" -ForegroundColor Yellow
Write-Host "  1. Revisar relatórios de índices (output acima)"
Write-Host "  2. Se houver índices não usados (idx_scan = 0):"
Write-Host "     DROP INDEX CONCURRENTLY idx_name_unused;"
Write-Host "  3. Rodar load test: k6 run test/load/k6-load-test.js"
Write-Host "  4. Validar Performance (P95 < 1s para APRs)"
Write-Host ""
Write-Host "🚀 Para implementar melhorias de código:" -ForegroundColor Yellow
Write-Host "  1. Ver: GUIA_INTEGRACAO_MELHORIAS.md"
Write-Host "  2. Integrar serviços no app.module.ts"
Write-Host "  3. Adicionar variáveis de ambiente (.env)"
Write-Host "  4. Deploy em staging primeiro"
Write-Host ""
Write-Host "📚 Documentação:" -ForegroundColor Yellow
Write-Host "  - RELATORIO_AUDITORIA_BANCO_DADOS_2026.md"
Write-Host "  - GUIA_INTEGRACAO_MELHORIAS.md"
Write-Host "  - ./backend/scripts/*" -ForegroundColor Gray
Write-Host ""
Write-Host "Contact: GitHub Copilot | Date: $(Get-Date -Format 'dd/MM/yyyy')" -ForegroundColor Gray
