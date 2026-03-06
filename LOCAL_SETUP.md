# Rodar localmente (Windows)

## Pré-requisitos

- **Node.js 20.x** (o projeto foi configurado para Node 20; em outras versões o `next build` pode falhar).
- **Docker Desktop** (WSL2).

## Subir tudo (infra + backend + frontend)

No PowerShell, na raiz do projeto:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\run-local.ps1
```

Se você não tiver o PowerShell 7 (`pwsh`) instalado, use o Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-local.ps1
```

O script cria automaticamente um `.env.local` com senhas fortes (se não existir) para a infra local.

URLs:

- Frontend: `http://localhost:3000/login`
- Backend: `http://localhost:3011`
- Swagger: `http://localhost:3011/api/docs`
- Bull Board (filas): `http://localhost:3011/admin/queues` (exige `BULL_BOARD_PASS` e só aceita `localhost`)
- MinIO (console): `http://localhost:9001`

## Parar tudo

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\stop-local.ps1
```

Windows PowerShell (se não tiver `pwsh`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-local.ps1
```

Para derrubar os containers da infra local:

```powershell
docker compose -f .\docker-compose.local.yml down
```
