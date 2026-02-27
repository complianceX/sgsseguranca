@echo off
chcp 65001 >nul
cls

echo ════════════════════════════════════════════════════════════════
echo   TESTAR CRIAÇÃO DE CONTRATO
echo ════════════════════════════════════════════════════════════════
echo.

echo Você precisa de um token JWT válido.
echo.
set /p TOKEN="Cole o token JWT aqui: "

echo.
echo Enviando requisição...
echo.

curl -X POST http://localhost:3001/contracts ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -H "x-company-id: sua-company-id" ^
  -d @test-contract.json

echo.
echo.
echo ════════════════════════════════════════════════════════════════
echo.

pause
