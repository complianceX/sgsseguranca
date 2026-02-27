@echo off
echo ========================================
echo Instalando Indices de Performance
echo ========================================
echo.

echo IMPORTANTE: Certifique-se que o PostgreSQL esta rodando!
echo.

set /p DB_PASSWORD="Digite a senha do banco (DATABASE_PASSWORD): "
echo.

echo Executando migration de indices...
set PGPASSWORD=%DB_PASSWORD%

REM Tentar com Docker primeiro
docker-compose exec -T db psql -U sst_user -d sst < src\database\migrations\add-performance-indexes.sql

if %errorlevel% neq 0 (
    echo.
    echo Tentando conexao direta com psql...
    psql -h localhost -U sst_user -d sst -f src\database\migrations\add-performance-indexes.sql
    
    if %errorlevel% neq 0 (
        echo.
        echo ERRO: Falha ao executar migration
        echo.
        echo Verifique:
        echo 1. PostgreSQL esta rodando?
        echo 2. Senha esta correta?
        echo 3. psql esta instalado?
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo Indices instalados com sucesso!
echo ========================================
echo.
echo Proximo passo:
echo Rebuild containers: docker-compose down ^&^& docker-compose up -d --build
echo.
pause
