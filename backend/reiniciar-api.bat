@echo off
chcp 65001 >nul
cls

echo ════════════════════════════════════════════════════════════════
echo   REINICIAR API
echo ════════════════════════════════════════════════════════════════
echo.

echo [1/2] Parando API...
docker-compose stop api
echo ✅ API parada
echo.

echo [2/2] Iniciando API...
docker-compose up -d api
echo ✅ API iniciada
echo.

echo Aguardando 10 segundos...
timeout /t 10 /nobreak >nul

echo.
echo ════════════════════════════════════════════════════════════════
echo   TESTANDO
echo ════════════════════════════════════════════════════════════════
echo.

curl http://localhost:3001/health

echo.
echo.
echo ✅ API reiniciada!
echo.
echo Ver logs: docker-compose logs -f api
echo.
pause
