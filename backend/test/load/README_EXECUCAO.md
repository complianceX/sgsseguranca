# README_EXECUCAO - carga de login com k6

## 1) Contrato real confirmado no backend

Fonte de verdade do login (NestJS):

- `src/auth/auth.controller.ts`
  - `POST /auth/login` (rota publica + throttle)
  - `GET /auth/me` (jwt guard)
- `src/auth/dto/login.dto.ts`
  - payload: `cpf`, `password`, `turnstileToken?`
- `src/auth/dto/auth-response.dto.ts`
  - resposta de login: `accessToken`, `user`, `roles`, `permissions`

Observacoes operacionais relevantes para o teste:

- Login sofre `@Throttle` + bloqueio de brute force em Redis.
- Se `TURNSTILE_ENABLED=true`, o login exige `turnstileToken` valido.
- Nao existe prefixo global automatico no Nest (`setGlobalPrefix` nao encontrado).
  - Se seu gateway expor `/api/v1`, configure isso em `BASE_URL`.

## 2) Arquivos deste pacote de teste

- `test/load/login-load.js` -> teste progressivo pesado (10 -> 200 logins/s)
- `test/load/login-soak.js` -> soak em taxa constante
- `test/load/import-login-users.ts` -> import em lote de usuarios para login
- `test/load/.env.example` -> variaveis de execucao
- `test/load/fixtures/login-users.example.json` -> exemplo de pool de credenciais
- `test/load/RELATORIO_INTERPRETACAO_ESPERADO.md` -> como ler os resultados

## 3) Pre-requisitos

- k6 instalado no host
- backend em execucao
- credenciais reais de teste
- ambiente dedicado (staging espelhado), nunca producao sem janela controlada

## 3.1) Importar usuarios para teste (opcional)

CSV esperado:

- `Nome Completo,E-mail,CPF,Empresa,Cargo`

Comandos (diretorio `backend`):

```powershell
# valida sem gravar
$env:IMPORT_USERS_FILE=\"test/load/fixtures/users-batch-2026-03-28.csv\"
$env:IMPORT_USERS_AUTOFIX_INVALID_CPF=\"true\"
npm run loadtest:users:import:dry

# grava no banco
npm run loadtest:users:import
```

Para ampliar rapidamente o pool sem editar o CSV base:

```powershell
$env:IMPORT_USERS_MULTIPLIER="3"
npm run loadtest:users:import
```

Saidas:

- `test/load/fixtures/login-users.generated.json` (pool pronto para K6)
- `test/load/fixtures/login-users.generated.cpf-fixes.json` (CPFs ajustados)

## 4) Execucao rapida (PowerShell)

No diretorio `backend`:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:LOGIN_CPF="00000000000"
$env:LOGIN_PASSWORD="change-me"
$env:CALL_AUTH_ME="true"
npm run loadtest:login:progressive
```

Com prefixo de gateway:

```powershell
$env:BASE_URL="http://localhost:3001/api/v1"
npm run loadtest:login:progressive
```

No Railway:

```powershell
$env:BASE_URL="https://seu-backend.up.railway.app"
$env:LOGIN_CPF="00000000000"
$env:LOGIN_PASSWORD="change-me"
npm run loadtest:login:progressive
```

## 5) Execucao com pool de usuarios (recomendado)

Evita lock prematuro por brute force/rate limit:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.120.json"
$env:MIN_CREDENTIAL_POOL_SIZE="120"
$env:REQUIRE_MIN_CREDENTIAL_POOL="true"
npm run loadtest:login:progressive
```

Filtrar por tenant/empresa:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json"
$env:CREDENTIAL_FILTER_COMPANY_NAME="SGS Operacoes Alpha"
npm run loadtest:login:progressive
```

Ou por ID da empresa:

```powershell
$env:CREDENTIAL_FILTER_COMPANY_ID="57c178fd-a05d-406e-ae52-a5fcff5ba355"
npm run loadtest:login:soak
```

Filtrar por perfil (exemplos):

```powershell
$env:CREDENTIAL_FILTER_PROFILE="tecnico de seguranca"
npm run loadtest:login:progressive

$env:CREDENTIAL_FILTER_PROFILE="supervisor"
npm run loadtest:login:soak
```

## 6) Soak apos achar patamar estavel

```powershell
$env:BASE_URL="http://localhost:3001"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.120.json"
$env:MIN_CREDENTIAL_POOL_SIZE="120"
$env:REQUIRE_MIN_CREDENTIAL_POOL="true"
$env:SOAK_RATE="75"
$env:SOAK_DURATION="60m"
npm run loadtest:login:soak
```

## 7) Saidas geradas

Progressivo:

- `test/load/login-load-summary.json`
- `test/load/login-load-report.txt`

Soak:

- `test/load/login-soak-summary.json`
- `test/load/login-soak-report.txt`

## 8) Guardrails para leitura correta

- Se aparecer muito `429`, voce esta batendo em protecao de abuso (nao necessariamente limite de CPU/DB).
- Se `dropped_iterations` sobe cedo, faltam VUs para sustentar a taxa alvo.
- Se `http_req_failed` > 1% e `p95` > 1500ms, o patamar esta degradado.
- Para gargalo real, acompanhe simultaneamente CPU/RAM, pool de conexoes do Postgres, Redis latency e logs de throttle.

## 9) Parametros mais usados

- `BASE_URL`
- `LOGIN_CPF` / `LOGIN_PASSWORD`
- `LOGIN_USERS_FILE`
- `TURNSTILE_TOKEN`
- `CALL_AUTH_ME`
- `PREALLOCATED_VUS` / `MAX_VUS`
- `SOAK_RATE` / `SOAK_DURATION`
- `MIN_CREDENTIAL_POOL_SIZE`
- `REQUIRE_MIN_CREDENTIAL_POOL`

## 10) Dica para nao falsear o teste

Se o objetivo for medir capacidade pura do app de login (e nao a eficacia do anti-abuso), rode em staging com limites de login calibrados para carga controlada e com massa de usuarios de teste suficiente.

Para cenarios com `CALL_AUTH_ME=true`, use pelo menos 120 usuarios distintos por
execução. Repetir 40 usuários ou menos tende a forçar evictions de refresh token
e piorar a latência de forma artificial.
