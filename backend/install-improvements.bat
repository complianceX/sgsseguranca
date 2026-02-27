@echo off
echo ========================================
echo Instalando Melhorias do Sistema
echo ========================================
echo.

echo [1/3] Instalando dependencia compression...
call npm install compression
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar compression
    pause
    exit /b 1
)
echo OK - compression instalado!
echo.

echo [2/3] Verificando instalacao...
call npm list compression
echo.

echo ========================================
echo Instalacao concluida com sucesso!
echo ========================================
echo.
echo Proximos passos:
echo 1. Executar migration de indices (ver install-db-indexes.bat)
echo 2. Rebuild containers: docker-compose down ^&^& docker-compose up -d --build
echo.
pause
