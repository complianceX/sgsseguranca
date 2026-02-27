# PowerShell Script para Instalação Semana 1 - Melhorias Enterprise
# Encoding: UTF-8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTALACAO SEMANA 1 - MELHORIAS ENTERPRISE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Função para verificar se comando existe
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    }
    catch {
        return $false
    }
}

# Verificar pré-requisitos
Write-Host "[0/7] Verificando pre-requisitos..." -ForegroundColor Yellow

if (-not (Test-Command "node")) {
    Write-Host "ERRO: Node.js nao encontrado. Instale Node.js 20+ primeiro." -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "npm")) {
    Write-Host "ERRO: npm nao encontrado. Instale Node.js 20+ primeiro." -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "docker")) {
    Write-Host "AVISO: Docker nao encontrado. Stack de observabilidade nao sera iniciado." -ForegroundColor Yellow
    $skipDocker = $true
} else {
    $skipDocker = $false
}

Write-Host "OK - Pre-requisitos verificados" -ForegroundColor Green
Write-Host ""

# 1. Instalar dependências
Write-Host "[1/7] Instalando dependencias OpenTelemetry..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao instalar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "OK - Dependencias instaladas" -ForegroundColor Green
Write-Host ""

# 2. Compilar
Write-Host "[2/7] Compilando o projeto..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao compilar" -ForegroundColor Red
    exit 1
}
Write-Host "OK - Projeto compilado" -ForegroundColor Green
Write-Host ""

# 3. Testes
Write-Host "[3/7] Executando testes..." -ForegroundColor Yellow
npm run test:ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "AVISO: Alguns testes falharam" -ForegroundColor Yellow
    Write-Host "Continuando..." -ForegroundColor Yellow
}
Write-Host "OK - Testes executados" -ForegroundColor Green
Write-Host ""

# 4. Migrações
Write-Host "[4/7] Verificando migracoes..." -ForegroundColor Yellow
npm run ci:migration:check
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Migracoes pendentes ou problemas detectados" -ForegroundColor Red
    exit 1
}
Write-Host "OK - Migracoes validadas" -ForegroundColor Green
Write-Host ""

# 5. Docker
if (-not $skipDocker) {
    Write-Host "[5/7] Iniciando stack de observabilidade..." -ForegroundColor Yellow
    docker-compose -f docker-compose.observability.yml up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao iniciar stack de observabilidade" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK - Stack de observabilidade iniciado" -ForegroundColor Green
    Write-Host ""

    # 6. Aguardar
    Write-Host "[6/7] Aguardando servicos iniciarem (30 segundos)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    Write-Host ""

    # 7. Verificar
    Write-Host "[7/7] Verificando servicos..." -ForegroundColor Yellow
    
    Write-Host "Verificando Jaeger..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:16686" -TimeoutSec 5 -UseBasicParsing
        Write-Host "OK - Jaeger: http://localhost:16686" -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: Jaeger pode nao estar acessivel ainda" -ForegroundColor Yellow
    }

    Write-Host "Verificando Prometheus..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9090" -TimeoutSec 5 -UseBasicParsing
        Write-Host "OK - Prometheus: http://localhost:9090" -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: Prometheus pode nao estar acessivel ainda" -ForegroundColor Yellow
    }

    Write-Host "Verificando Grafana..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing
        Write-Host "OK - Grafana: http://localhost:3000 (admin/admin)" -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: Grafana pode nao estar acessivel ainda" -ForegroundColor Yellow
    }
} else {
    Write-Host "[5/7] PULADO - Docker nao disponivel" -ForegroundColor Yellow
    Write-Host "[6/7] PULADO - Docker nao disponivel" -ForegroundColor Yellow
    Write-Host "[7/7] PULADO - Docker nao disponivel" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "1. Acesse Jaeger: http://localhost:16686" -ForegroundColor White
Write-Host "2. Acesse Prometheus: http://localhost:9090" -ForegroundColor White
Write-Host "3. Acesse Grafana: http://localhost:3000 (admin/admin)" -ForegroundColor White
Write-Host "4. Execute testes de carga: npm run loadtest:smoke" -ForegroundColor White
Write-Host "5. Execute teste de DR: bash scripts/disaster-recovery-test.sh" -ForegroundColor White
Write-Host ""
Write-Host "Documentacao completa em: backend/GETTING_STARTED_IMPROVEMENTS.md" -ForegroundColor Cyan
Write-Host ""
