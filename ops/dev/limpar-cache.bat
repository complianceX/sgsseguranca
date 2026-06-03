@echo off
echo Limpando cache do Next.js...
cd frontend
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache
echo Cache limpo!
echo.
echo Agora execute: cd frontend && npm run dev
pause
