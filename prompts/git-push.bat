@echo off
chcp 65001 >nul
echo.
echo 🚀 Iniciando processo de deploy para o GitHub...
echo.

echo 1. Adicionando arquivos...
git add .

echo 2. Criando commit...
git commit -m "feat: implement direct S3 upload with progress bar and unit tests"

echo 3. Enviando para o GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ✅ Sucesso! Código enviado para o GitHub.
) else (
    echo ❌ Erro ao enviar. Verifique se você tem permissão ou se há conflitos.
)
pause