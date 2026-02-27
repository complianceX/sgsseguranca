@echo off
echo ========================================
echo Rebuild e Restart dos Containers
echo ========================================
echo.

echo [1/2] Parando containers...
docker-compose down
if %errorlevel% neq 0 (
    echo AVISO: Erro ao parar containers (pode ser que nao estejam rodando)
)
echo.

echo [2/2] Rebuilding e iniciando containers...
docker-compose up -d --build
if %errorlevel% neq 0 (
    echo ERRO: Falha ao iniciar containers
    pause
    exit /b 1
)
echo.

echo Aguardando containers iniciarem...
timeout /t 10 /nobreak > nul
echo.

echo Verificando status dos containers...
docker-compose ps
echo.

echo ========================================
echo Containers reiniciados com sucesso!
echo ========================================
echo.
echo Testando endpoints...
echo.

echo [1/4] Health Check Basico...
curl -s http://localhost:3001/health
echo.
echo.

echo [2/4] Health Check Detalhado...
curl -s http://localhost:3001/health/detailed
echo.
echo.

echo [3/4] Verificando Compression...
curl -I -H "Accept-Encoding: gzip" http://localhost:3001/health 2>nul | findstr "Content-Encoding"
echo.

echo [4/4] Verificando Request ID...
curl -I http://localhost:3001/health 2>nul | findstr "x-request-id"
echo.

echo ========================================
echo Testes concluidos!
echo ========================================
echo.
echo Sistema pronto para uso!
echo.
pause
