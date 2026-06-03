#!/bin/bash

set -e

echo "Este instalador foi descontinuado."
echo "Ele executava SQL legado diretamente e não deve ser usado em ambientes Neon."
echo ""
echo "Use o fluxo versionado:"
echo "  cd backend"
echo "  npm ci"
echo "  npm run build"
echo "  npm run migration:run"
echo ""
echo "Para subir a stack local no Windows:"
echo "  powershell -ExecutionPolicy Bypass -File ops/dev/run-local.ps1"
exit 1
