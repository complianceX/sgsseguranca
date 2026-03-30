# Railway Auth Benchmark Runbook (login + /auth/me)

## 1. Contracto real do backend (fonte de verdade)

- Login: `POST /auth/login`
  - DTO: `cpf`, `password`, `turnstileToken?`
  - Arquivo: `src/auth/auth.controller.ts` e `src/auth/dto/login.dto.ts`
- Resposta de login:
  - JSON: `accessToken`, `user`, `roles`, `permissions`
  - Cookies: `refresh_token` e `refresh_csrf`
  - Arquivo: `src/auth/auth.controller.ts`, `src/auth/dto/auth-response.dto.ts`
- Sessão: `GET /auth/me`
  - Header obrigatório: `Authorization: Bearer <accessToken>`
  - Resposta: `user`, `roles`, `permissions`
  - Arquivo: `src/auth/auth.controller.ts`
- Leitura leve de usuário no `/auth/me`:
  - `usersService.findAuthSessionUser(...)` (sem join pesado de company/site)
  - Arquivo: `src/users/users.service.ts`
- Rate limits relevantes:
  - Login: throttle + brute-force em Redis
  - `/auth/me`: throttle específico da rota + tenant throttle
  - Arquivo: `src/auth/auth.controller.ts`, `src/common/guards/*.ts`

## 2. Estratégia segura para Railway

- Não testar em produção sem janela formal.
- Priorizar staging com mesmos serviços (web, worker, Postgres, Redis) no mesmo project/environment.
- Gerar tráfego de fora do Railway (k6 local ou Docker), mirando o domínio público do backend.
- Validar health antes de carga:
  - `GET /health/public`
  - `GET /health`

## 3. Checklist operacional (antes de rodar)

- [ ] Confirmar domínio de staging (não produção)
- [ ] Confirmar web e worker no mesmo commit
- [ ] Confirmar migrations aplicadas no staging
- [ ] Confirmar `TURNSTILE_ENABLED` e estratégia de token
- [ ] Confirmar pool de credenciais grande (não repetir 40 usuários)
- [ ] Confirmar `LOGIN_USERS_FILE` apontando para pool real de benchmark
- [ ] Confirmar `CLIENT_FINGERPRINT_MODE=per-iteration` para benchmark de capacidade
- [ ] Confirmar que o smoke valida `accessToken` + cookies de refresh
- [ ] Salvar saída JSON/TXT do k6 para análise comparável

## 4. Scripts disponíveis

- `test/load/login-smoke.js`
  - valida contrato mínimo de login e `/auth/me`
- `test/load/login-load.js`
  - benchmark progressivo (rampa + hold opcional)
- `test/load/login-soak.js`
  - soak de 60 minutos (taxa constante)

## 5. Execução (k6 local)

```powershell
# no diretório backend
$env:BASE_URL="https://seu-staging.up.railway.app"
$env:LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json"
$env:CALL_AUTH_ME="true"
$env:SEND_COMPANY_HEADER="false"
$env:CLIENT_FINGERPRINT_MODE="per-iteration"
$env:EXPECT_REFRESH_COOKIES="true"
npm run loadtest:login:smoke
```

```powershell
# benchmark progressivo
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

```powershell
# soak 60 minutos
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

## 6. Execução (Docker + k6)

```powershell
# smoke via Docker
docker run --rm -i -v "${PWD}:/work" -w /work grafana/k6 run `
  -e BASE_URL="https://seu-staging.up.railway.app" `
  -e LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json" `
  -e CALL_AUTH_ME="true" `
  -e SEND_COMPANY_HEADER="false" `
  -e CLIENT_FINGERPRINT_MODE="per-iteration" `
  -e EXPECT_REFRESH_COOKIES="true" `
  test/load/login-smoke.js
```

```powershell
# soak via Docker
docker run --rm -i -v "${PWD}:/work" -w /work grafana/k6 run `
  -e BASE_URL="https://seu-staging.up.railway.app" `
  -e LOGIN_USERS_FILE="test/load/fixtures/login-users.generated.json" `
  -e CALL_AUTH_ME="true" `
  -e SEND_COMPANY_HEADER="false" `
  -e CLIENT_FINGERPRINT_MODE="per-iteration" `
  -e EXPECT_REFRESH_COOKIES="true" `
  -e SOAK_RATE="75" `
  -e SOAK_DURATION="60m" `
  -e DYNAMIC_POOL_GUARD="true" `
  -e TARGET_LOGINS_PER_USER="300" `
  test/load/login-soak.js
```

## 7. Critérios de classificação

- Saudável
  - `http_req_failed < 0.5%`
  - `p95 login <= 800ms`
  - `p95 /auth/me <= 600ms`
  - erro de negócio baixo e sem reinício de instância
- Aceitável
  - `http_req_failed < 1%`
  - `p95 login <= 1200ms`
  - `p95 /auth/me <= 900ms`
- Degradando
  - `http_req_failed 1%..3%`
  - `p95 login 1200..2000ms` ou `/auth/me > 900ms`
  - crescimento de 429/401 em cadeia
- Colapso
  - `http_req_failed > 3%`
  - timeouts ou `p95 > 2000ms`
  - reinício/instabilidade de serviço ou fila acumulando sem drenar

## 8. O que observar no Railway durante o teste

- CPU: saturação sustentada durante login indica gargalo de hash/verificação.
- Memória: crescimento + reinícios sugere pressão de heap/processo.
- Rede: aumento de latência de egress pode penalizar Redis/DB.
- Reinícios: qualquer restart no meio do teste invalida comparação direta.
- Logs:
  - 429 em massa: limite anti-abuso/rate-limit, não necessariamente CPU.
  - 401/403 no `/auth/me`: churn de sessão, token inválido, tenant mismatch.
  - 5xx: gargalo real de app/infra.
- Réplicas:
  - comparar distribuição de carga e assimetria de latência entre instâncias.

## 9. Hipóteses de gargalo para correlação

- Hash de senha (argon2/bcrypt legado)
- Pool de conexão do Postgres (esgotamento/espera)
- Latência de consultas em login e `/auth/me`
- Redis (throttle, brute-force, sessão e RBAC cache)
- JWT (dupla validação e blacklist lookup)
- Rate-limit por IP/tenant/rota
- Limite de CPU/memória da instância Railway

## 10. Pós-benchmark

- Consolidar 3 saídas:
  - `test/load/login-smoke-summary.json`
  - `test/load/login-load-summary.json`
  - `test/load/login-soak-summary.json`
- Guardar os `.txt` junto com snapshot de métricas Railway.
- Definir capacidade operacional por faixa (saudável/aceitável/degradando/colapso).
- Abrir plano de remediação apenas com gargalos confirmados por evidência.
