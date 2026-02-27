@echo off
echo ========================================
echo INSTALACAO SEMANA 1 - MELHORIAS ENTERPRISE
echo ========================================
echo.

echo [1/7] Instalando dependencias OpenTelemetry...
call npm install @opentelemetry/api@^1.9.0 @opentelemetry/auto-instrumentations-node@^0.52.1 @opentelemetry/exporter-jaeger@^1.28.0 @opentelemetry/exporter-prometheus@^0.56.0 @opentelemetry/instrumentation@^0.56.0 @opentelemetry/resources@^1.28.0 @opentelemetry/sdk-metrics@^1.28.0 @opentelemetry/sdk-node@^0.56.0 @opentelemetry/sdk-trace-node@^1.28.0 @opentelemetry/semantic-conventions@^1.28.0
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias OpenTelemetry
    pause
    exit /b 1
)
echo OK - Dependencias instaladas
echo.

echo [2/7] Compilando o projeto...
call npm run build
if errorlevel 1 (
    echo ERRO: Falha ao compilar
    pause
    exit /b 1
)
echo OK - Projeto compilado
echo.

echo [3/7] Executando testes...
call npm run test:ci
if errorlevel 1 (
    echo AVISO: Alguns testes falharam
    echo Continuando...
)
echo OK - Testes executados
echo.

echo [4/7] Verificando migracoes...
call npm run ci:migration:check
if errorlevel 1 (
    echo ERRO: Migracoes pendentes ou problemas detectados
    pause
    exit /b 1
)
echo OK - Migracoes validadas
echo.

echo [5/7] Iniciando stack de observabilidade...
docker-compose -f docker-compose.observability.yml up -d
if errorlevel 1 (
    echo ERRO: Falha ao iniciar stack de observabilidade
    pause
    exit /b 1
)
echo OK - Stack de observabilidade iniciado
echo.

echo [6/7] Aguardando servicos iniciarem (30 segundos)...
timeout /t 30 /nobreak
echo.

echo [7/7] Verificando servicos...
echo Verificando Jaeger...
curl -s http://localhost:16686 > nul
if errorlevel 1 (
    echo AVISO: Jaeger pode nao estar acessivel ainda
) else (
    echo OK - Jaeger: http://localhost:16686
)

echo Verificando Prometheus...
curl -s http://localhost:9090 > nul
if errorlevel 1 (
    echo AVISO: Prometheus pode nao estar acessivel ainda
) else (
    echo OK - Prometheus: http://localhost:9090
)

echo Verificando Grafana...
curl -s http://localhost:3000 > nul
if errorlevel 1 (
    echo AVISO: Grafana pode nao estar acessivel ainda
) else (
    echo OK - Grafana: http://localhost:3000 (admin/admin)
)
echo.

echo ========================================
echo INSTALACAO CONCLUIDA COM SUCESSO!
echo ========================================
echo.
echo Proximos passos:
echo 1. Acesse Jaeger: http://localhost:16686
echo 2. Acesse Prometheus: http://localhost:9090
echo 3. Acesse Grafana: http://localhost:3000 (admin/admin)
echo 4. Execute testes de carga: npm run loadtest:smoke
echo 5. Execute teste de DR: bash scripts/disaster-recovery-test.sh
echo.
echo Documentacao completa em: backend/GETTING_STARTED_IMPROVEMENTS.md
echo.
pause
