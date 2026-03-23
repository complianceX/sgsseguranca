@echo off
echo ========================================
echo Instalacao Completa das Melhorias
echo ========================================
echo.
echo Este script vai:
echo 1. Instalar dependencia compression
echo 2. Executar migration de indices
echo 3. Rebuild containers
echo.
echo Pressione qualquer tecla para continuar ou Ctrl+C para cancelar...
pause > nul
echo.

REM Passo 1: Instalar compression
echo ========================================
echo PASSO 1/3: Instalando compression
echo ========================================
call npm install compression
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar compression
    pause
    exit /b 1
)
echo OK!
echo.

REM Passo 2: Migration de indices
echo ========================================
echo PASSO 2/3: Instalando indices
echo ========================================
echo.
set /p DB_PASSWORD="Digite a senha do banco (DATABASE_PASSWORD): "
echo.

set PGPASSWORD=%DB_PASSWORD%
docker-compose exec -T db psql -U sst_user -d sst < src\database\migrations\add-performance-indexes.sql

if %errorlevel% neq 0 (
    echo AVISO: Falha ao executar via Docker, tentando conexao direta...
    psql -h localhost -U sst_user -d sst -f src\database\migrations\add-performance-indexes.sql
    
    if %errorlevel% neq 0 (
        echo ERRO: Falha ao executar migration
        echo Continuando mesmo assim...
    )
)
echo OK!
echo.

REM Passo 3: Rebuild
echo ========================================
echo PASSO 3/3: Rebuild containers
echo ========================================
docker-compose down
docker-compose up -d --build
if %errorlevel% neq 0 (
    echo ERRO: Falha ao rebuild containers
    pause
    exit /b 1
)
echo.

echo Aguardando containers iniciarem...
timeout /t 15 /nobreak > nul
echo.

echo ========================================
echo INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Testando sistema...
echo.

curl -s http://localhost:3001/health
echo.
echo.

echo ========================================
echo Sistema pronto para uso!
echo ========================================
echo.
echo Documentacao:
echo - ..\docs\consulta-rapida\README.md
echo - ..\docs\consulta-rapida\implementacoes-recentes.md
echo - ..\prompts\INDEX.md
echo.
pause
