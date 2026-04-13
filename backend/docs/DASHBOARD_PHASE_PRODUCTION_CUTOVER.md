# Dashboard Backend Phase Cutover

Documento objetivo para colocar em producao a fase de refatoracao do dashboard:

- `GET /dashboard/summary`
- `GET /dashboard/kpis`
- `GET /dashboard/pending-queue`
- `GET /dashboard/document-pendencies`
- `POST /dashboard/invalidate`

Escopo: web + worker + Redis + Postgres/Supabase.

## 1. Pre-condicoes

- Redis real e estavel
- migrations aplicadas
- worker ativo
- variaveis de seguranca preenchidas
- TLS do banco validado

## 2. Env recomendada - backend-web

Use este bloco como base para o servico web:

```env
NODE_ENV=production
PORT=3001

API_PUBLIC_URL=https://api.sgsseguranca.com.br
CORS_ALLOWED_ORIGINS=https://app.sgsseguranca.com.br
AUTH_COOKIE_DOMAIN=.sgsseguranca.com.br

DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_ALLOW_INSECURE=false
DATABASE_SSL_CA=
DB_POOL_MAX=5
DB_POOL_MIN=0
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=10000
DB_APPLICATION_NAME_WEB=api_web
PG_STATEMENT_TIMEOUT_MS=25000
PG_LOCK_TIMEOUT_MS=2000
PG_IDLE_IN_TX_TIMEOUT_MS=15000
MIGRATION_ADVISORY_LOCK_TIMEOUT_MS=300000

REDIS_URL=redis://user:REDACTED@host:6379
REDIS_DISABLED=false
REDIS_FAIL_OPEN=false
REDIS_ALLOW_IN_MEMORY_FALLBACK_IN_PROD=false

JWT_SECRET=change_me_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_min_32_chars
VALIDATION_TOKEN_SECRET=change_me_validation_secret_min_32_chars
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=change_me
SUPABASE_JWT_SECRET=
SUPABASE_AUTH_SYNC_ENABLED=true
SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN=true
LEGACY_PASSWORD_AUTH_ENABLED=true

REFRESH_CSRF_ENFORCED=true
REFRESH_CSRF_REPORT_ONLY=false
SECURITY_HARDENING_PHASE=phase0

THROTTLE_TTL=60000
THROTTLE_LIMIT=100
REFRESH_THROTTLE_LIMIT=5
REFRESH_THROTTLE_TTL=60000
LOGIN_THROTTLE_LIMIT=5
LOGIN_THROTTLE_TTL=60000

RBAC_ACCESS_CACHE_TTL_SECONDS=120
RBAC_ACCESS_LOCAL_CACHE_TTL_SECONDS=30
RBAC_WARMUP_ENABLED=true
RBAC_WARMUP_DELAY_MS=10000
RBAC_WARMUP_USER_LIMIT=50
RBAC_WARMUP_CONCURRENCY=4

TENANT_VALIDATION_WARMUP_ENABLED=true
TENANT_VALIDATION_WARMUP_DELAY_MS=5000
TENANT_VALIDATION_WARMUP_COMPANY_LIMIT=50

CACHE_WARMING_ENABLED=true
CACHE_WARMING_DELAY_MS=5000
CACHE_WARMING_TIMEOUT_MS=5000

DASHBOARD_CACHE_TTL_SECONDS=300
DASHBOARD_STALE_WHILE_REVALIDATE_SECONDS=30
DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_ENABLED=true
DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_DELAY_MS=15000
DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_COMPANY_LIMIT=25
DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY=3
DASHBOARD_DOCUMENT_AVAILABILITY_SCHEDULER_ENABLED=true

LOG_LEVEL=info
```

## 3. Env recomendada - backend-worker

Use este bloco como base para o worker:

```env
NODE_ENV=production

DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_ALLOW_INSECURE=false
DATABASE_SSL_CA=
DB_POOL_MAX=5
DB_POOL_MIN=0
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=10000
DB_APPLICATION_NAME_WORKER=api_worker
PG_STATEMENT_TIMEOUT_MS=60000
PG_LOCK_TIMEOUT_MS=5000
PG_IDLE_IN_TX_TIMEOUT_MS=15000

REDIS_URL=redis://user:REDACTED@host:6379
REDIS_DISABLED=false
REDIS_FAIL_OPEN=false
REDIS_ALLOW_IN_MEMORY_FALLBACK_IN_PROD=false

JWT_SECRET=change_me_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_min_32_chars
VALIDATION_TOKEN_SECRET=change_me_validation_secret_min_32_chars

SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=change_me
SUPABASE_AUTH_SYNC_ENABLED=true
SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN=true
LEGACY_PASSWORD_AUTH_ENABLED=true

WORKER_HEARTBEAT_ENABLED=true
WORKER_HEARTBEAT_REQUIRED=true
WORKER_HEARTBEAT_KEY=worker:heartbeat:queue-runtime
WORKER_HEARTBEAT_TTL_SECONDS=90

DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_ENABLED=false
DASHBOARD_DOCUMENT_AVAILABILITY_SCHEDULER_ENABLED=true

LOG_LEVEL=info
```

## 4. Recomendacoes de seguranca

- Preencha `DATABASE_SSL_CA` quando possivel e remova qualquer fallback inseguro.
- Nunca rode com `REDIS_DISABLED=true` em producao.
- `VALIDATION_TOKEN_SECRET`, `JWT_SECRET` e `JWT_REFRESH_SECRET` devem ter pelo menos 32 caracteres reais.
- `CORS_ALLOWED_ORIGINS` deve conter apenas dominios explicitos do frontend.

## 5. Sequencia de deploy

1. Aplicar migrations:

```bash
npm run migration:run
```

2. Subir `backend-web`.
3. Subir `backend-worker`.
4. Validar:

```bash
curl https://api.sgsseguranca.com.br/health/public
curl https://api.sgsseguranca.com.br/health
npm run smoke:db:readonly
npm run verify:rls
```

## 6. Smoke obrigatorio desta fase

1. Login real via frontend ou script com CSRF.
2. Validar resposta 200 de:
   - `/dashboard/summary`
   - `/dashboard/kpis`
   - `/dashboard/pending-queue`
   - `/dashboard/document-pendencies?page=1&limit=20`
3. Validar `POST /dashboard/invalidate` para:
   - `summary`
   - `kpis`
   - `pending-queue`
4. Verificar logs:
   - sem `db_slow_query` recorrente no RBAC
   - sem `snapshot` cross-tenant
   - sem `Redis unavailable`

## 7. Sinais de sucesso

- `health/public` e `health` respondendo 200
- login sem 403 de CSRF
- `summary`, `kpis` e `pending-queue` respondendo com `meta`
- `document-pendencies` respondendo com `summary`, `pagination`, `items`
- sem erro de RLS
- worker consumindo filas normalmente

## 8. Gatilhos de rollback

Execute rollback imediato se houver:

- falha de login generalizada
- aumento relevante de 5xx
- erro de isolamento entre tenants
- fila parada por indisponibilidade de Redis
- erro recorrente de bootstrap no banco

## 9. Rollback rapido

1. Reverter release do `backend-web`.
2. Reverter release do `backend-worker`.
3. Se necessario, limpar cache do dashboard no Redis.
4. Revalidar:

```bash
curl https://api.sgsseguranca.com.br/health/public
curl https://api.sgsseguranca.com.br/health
```

## 10. Observacao final

O codigo desta fase esta pronto. O maior risco remanescente para hoje nao e implementacao; e configuracao de ambiente, especialmente:

- Redis real
- segredo de validacao
- CORS correto
- TLS do Postgres/Supabase
