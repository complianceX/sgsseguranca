@echo off
echo ════════════════════════════════════════════════════════════════
echo   CONSTRUINDO CONTAINERS COM DOCKERFILE CORRIGIDO
echo ════════════════════════════════════════════════════════════════
echo.
echo Este processo pode levar 5-10 minutos na primeira vez...
echo.

docker-compose up -d --build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ════════════════════════════════════════════════════════════════
    echo   ✅ CONTAINERS CONSTRUÍDOS COM SUCESSO!
    echo ════════════════════════════════════════════════════════════════
    echo.
    echo Aguardando containers iniciarem...
    timeout /t 10 /nobreak >nul
    echo.
    echo Status dos containers:
    docker-compose ps
    echo.
    echo ════════════════════════════════════════════════════════════════
    echo   PRÓXIMOS PASSOS
    echo ════════════════════════════════════════════════════════════════
    echo.
    echo 1. Executar migration de índices:
    echo    Get-Content src\database\migrations\add-performance-indexes.sql ^| docker-compose exec -T db psql -U sst_user -d sst
    echo.
    echo 2. Testar endpoints:
    echo    curl http://localhost:3001/health
    echo    curl http://localhost:3001/health/detailed
    echo.
    echo 3. Verificar compression:
    echo    curl -I -H "Accept-Encoding: gzip" http://localhost:3001/health
    echo.
) else (
    echo.
    echo ════════════════════════════════════════════════════════════════
    echo   ❌ ERRO AO CONSTRUIR CONTAINERS
    echo ════════════════════════════════════════════════════════════════
    echo.
    echo Verifique os logs acima para detalhes do erro.
    echo.
)

pause
