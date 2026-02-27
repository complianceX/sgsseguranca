@echo off
chcp 65001 >nul
echo.
echo 🚀 Executando Migration: Adicionar pdf_file_key na tabela pts...
echo.

type src\database\migrations\add-pdf-file-key-to-pts.sql | docker-compose exec -T db psql -U sst_user -d sst

if %ERRORLEVEL% EQU 0 (
    echo ✅ Sucesso! Coluna pdf_file_key adicionada.
) else (
    echo ❌ Erro ao executar. Verifique se o container 'db' está rodando.
)
pause