# README_EXECUCAO - benchmark auth (login + /auth/me)

Este pacote foi alinhado ao contrato real do backend:

- `POST /auth/login` com `cpf`, `password`, `turnstileToken?`
- resposta com `accessToken` (JSON)
- cookies `refresh_token` e `refresh_csrf`
- `GET /auth/me` com `Authorization: Bearer <token>`

Fontes: `src/auth/auth.controller.ts`, `src/auth/dto/login.dto.ts`,
`src/auth/dto/auth-response.dto.ts`, `src/users/users.service.ts`.

## Scripts disponíveis

- `test/load/login-smoke.js`
  - valida contrato e fluxo básico
- `test/load/login-load.js`
  - benchmark progressivo (rampa + hold opcional)
- `test/load/login-soak.js`
  - soak de 60 minutos (taxa constante)
- `test/load/import-login-users.ts`
  - importa/genera pool de usuários para benchmark (hash argon2)
- `test/load/build-auth-me-users.ts`
  - valida credenciais no fluxo real auth (`login + /auth/me`)
  - gera pool `auth-valid` para benchmark sem ruído de credencial inválida
- `test/load/build-dds-publish-users.ts`
  - valida credenciais com fluxo real DDS (login + `/auth/me` + create + publish)
  - gera pool "publish-valid" para eliminar falso negativo por permissão

Runbook completo Railway:

- `test/load/RAILWAY_AUTH_BENCHMARK_RUNBOOK.md`

## Pré-requisitos

- k6 instalado (ou Docker com imagem `grafana/k6`)
- ambiente de staging com domínio público
- massa de credenciais de benchmark (não repetir 40 usuários)

## 1) Importar usuários de benchmark (opcional)

No diretório `backend`:

```powershell
# valida sem gravar
$env:IMPORT_USERS_FILE="test/load/fixtures/users-batch-2026-03-28.csv"
$env:IMPORT_USERS_AUTOFIX_INVALID_CPF="true"
npm run loadtest:users:import:dry

# grava no banco
npm run loadtest:users:import
```

Para ampliar o pool:

```powershell
$env:IMPORT_USERS_MULTIPLIER="3"
npm run loadtest:users:import
```

Saída:

- `test/load/fixtures/login-users.generated.json`

## 2) Smoke

Opcional (recomendado): montar pool `auth-valid` antes do smoke.

```powershell
$env:BASE_URL="http://localhost:3011"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.local.generated.json"
$env:AUTH_VALID_USERS_OUTPUT_FILE="test/load/fixtures/login-users.auth.valid.local.generated.json"
$env:MIN_VALID_USERS="10"
npm run loadtest:auth:users:build
```

```powershell
$env:BASE_URL="https://seu-staging.up.railway.app"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.auth.valid.local.generated.json"
$env:CALL_AUTH_ME="true"
$env:SEND_COMPANY_HEADER="false"
$env:CLIENT_FINGERPRINT_MODE="per-iteration"
$env:EXPECT_REFRESH_COOKIES="true"
npm run loadtest:login:smoke
```

## 3) Progressivo

```powershell
$env:BASE_URL="https://seu-staging.up.railway.app"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json"
$env:CALL_AUTH_ME="true"
$env:SEND_COMPANY_HEADER="false"
$env:CLIENT_FINGERPRINT_MODE="per-iteration"
$env:EXPECT_REFRESH_COOKIES="true"
$env:DYNAMIC_POOL_GUARD="true"
$env:TARGET_LOGINS_PER_USER="300"
npm run loadtest:login:progressive
```

## 4) Soak 60 minutos

```powershell
$env:BASE_URL="https://seu-staging.up.railway.app"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json"
$env:CALL_AUTH_ME="true"
$env:SEND_COMPANY_HEADER="false"
$env:CLIENT_FINGERPRINT_MODE="per-iteration"
$env:EXPECT_REFRESH_COOKIES="true"
$env:SOAK_RATE="75"
$env:SOAK_DURATION="60m"
$env:DYNAMIC_POOL_GUARD="true"
$env:TARGET_LOGINS_PER_USER="300"
npm run loadtest:login:soak
```

## 5) Execução via Docker (sem k6 local)

```powershell
docker run --rm -i -v "${PWD}:/work" -w /work grafana/k6 run `
  -e BASE_URL="https://seu-staging.up.railway.app" `
  -e LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json" `
  -e CALL_AUTH_ME="true" `
  -e SEND_COMPANY_HEADER="false" `
  -e CLIENT_FINGERPRINT_MODE="per-iteration" `
  -e EXPECT_REFRESH_COOKIES="true" `
  test/load/login-smoke.js
```

## 6) Saídas geradas

- `test/load/login-smoke-summary.json`
- `test/load/login-load-summary.json`
- `test/load/login-soak-summary.json`
- `test/load/login-smoke-report.txt`
- `test/load/login-load-report.txt`
- `test/load/login-soak-report.txt`

## 7) Guardrails

- Muito `429` normalmente indica anti-abuso/rate-limit.
- `401/403` no `/auth/me` em cascata sugere churn/sessão/tenant mismatch.
- Se `http_req_failed > 1%` com `p95` alto, o patamar já está degradando.
- Sempre correlacionar com CPU/RAM/restarts/logs no Railway.

## 8) DDS - benchmark de emissão (local/staging)

Pré-requisito: ter credenciais no arquivo `LOGIN_USERS_FILE`.

### 8.1 Gerar pool "publish-valid"

No diretório `backend`:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.120.json"
$env:DDS_VALID_USERS_OUTPUT_FILE="test/load/fixtures/dds-users.publish.valid.local.generated.json"
$env:MIN_VALID_USERS="10"
npm run loadtest:dds:users:build
```

### 8.2 Smoke DDS

```powershell
$env:BASE_URL="http://localhost:3001"
$env:TEST_PROFILE="smoke"
$env:LOGIN_MODE="per_vu"
$env:PREFER_AUTH_ME="true"
$env:REQUIRE_STORAGE="false"
$env:K6_USERS_JSON=(Get-Content "test/load/fixtures/dds-users.publish.valid.local.generated.json" -Raw)
npm run loadtest:dds:smoke
```

### 8.3 Progressivo DDS

```powershell
$env:BASE_URL="http://localhost:3001"
$env:TEST_PROFILE="progressive"
$env:LOGIN_MODE="per_vu"
$env:PREFER_AUTH_ME="true"
$env:REQUIRE_STORAGE="false"
$env:K6_USERS_JSON=(Get-Content "test/load/fixtures/dds-users.publish.valid.local.generated.json" -Raw)
npm run loadtest:dds:progressive
```

### 8.4 Soak DDS (60 minutos)

```powershell
$env:BASE_URL="http://localhost:3001"
$env:TEST_PROFILE="soak60"
$env:SOAK_DURATION="60m"
$env:SOAK_VUS="4"
$env:LOGIN_MODE="per_vu"
$env:PREFER_AUTH_ME="true"
$env:REQUIRE_STORAGE="false"
$env:K6_USERS_JSON=(Get-Content "test/load/fixtures/dds-users.publish.valid.local.generated.json" -Raw)
npm run loadtest:dds:soak
```
