# Env Reference — SGS Segurança

> Referência rápida das ~400 variáveis de ambiente organizadas por categoria.
> Fonte oficial: `backend/.env.example` (403 linhas).

---

## Core

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `NODE_ENV` | Sim | `development` | development / production / test |
| `PORT` | Não | `3001` | Porta da API |
| `API_PUBLIC_URL` | Sim (prod) | — | URL pública da API |
| `UV_THREADPOOL_SIZE` | Não | `16` | Thread pool libuv |

---

## Database

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim (prod) | Neon direct (sem `-pooler`), `sslmode=require` |
| `DATABASE_MIGRATION_URL` | Sim (prod) | Role owner para DDL |
| `DATABASE_REPLICA_URL` | Não | Read replica |
| `DATABASE_SSL` | Sim (prod) | `true` em produção |
| `DATABASE_SSL_ALLOW_INSECURE` | Não | `false` em produção |
| `DATABASE_SSL_CA` | Não | CA certificate base64 |
| `DB_APPLICATION_NAME_WEB` | Não | `api_web` |
| `DB_APPLICATION_NAME_WORKER` | Não | `api_worker` |

**Fallbacks aceitos:** `DATABASE_DIRECT_URL`, `DATABASE_PUBLIC_URL`, `URL_DO_BANCO_DE_DADOS`

---

## Redis

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `REDIS_AUTH_URL` | Sim (prod) | Sessões, refresh tokens |
| `REDIS_CACHE_URL` | Sim (prod) | Cache de dashboard, RBAC |
| `REDIS_QUEUE_URL` | Sim (prod) | BullMQ job queues |
| `REDIS_URL` | Não | Legado (compatibilidade) |
| `REDIS_DISABLED` | Não | `false` — modo degradado |
| `REDIS_FAIL_OPEN` | Não | `false` em produção |

---

## JWT / Auth

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `JWT_SECRET` | Sim | — | **Min 64 chars em produção.** Gere com `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Sim | — | **Min 64 chars em produção, diferente de `JWT_SECRET`.** Gere com `openssl rand -hex 32` |
| `JWT_ISSUER` | Sim (prod) | — | **Obrigatório em produção.** URL pública da API. Ex: `https://api.seu-dominio.com.br` |
| `JWT_AUDIENCE` | Sim (prod) | — | **Obrigatório em produção.** Identificador do app. Ex: `sgs-app` |
| `ACCESS_TOKEN_TTL` | Não | `15m` | |
| `REFRESH_TOKEN_TTL` | Não | `30d` | |
| `REFRESH_BINDING` | Não | `none` | `ua` para vincular a User-Agent |
| `LEGACY_PASSWORD_AUTH_ENABLED` | Não | `true` | |


---

## MFA

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `MFA_ENABLED` | Não | `true` | |
| `MFA_ISSUER` | Não | `SGS Seguranca` | |
| `MFA_TOTP_ENCRYPTION_KEY` | Sim (prod) | — | 32 bytes |
| `ADMIN_GERAL_MFA_REQUIRED` | Não | `true` | **Obrigatório em produção** |

---

## Field Encryption

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `FIELD_ENCRYPTION_ENABLED` | Sim (prod) | `true` em produção |
| `FIELD_ENCRYPTION_KEY` | Sim (prod) | 32 bytes (64 hex / 32 UTF-8 / base64) |
| `FIELD_ENCRYPTION_HASH_KEY` | Sim (prod) | Chave HMAC para lookup de CPF |

---

## Rate Limiting

| Variável | Default | Descrição |
|----------|---------|-----------|
| `THROTTLER_ENABLED` | `true` | |
| `THROTTLER_AUTH_LIMIT` | `5` | /min — login |
| `THROTTLER_PUBLIC_LIMIT` | `10` | /min — rotas públicas |
| `THROTTLER_API_LIMIT` | `100` | /min — API geral |
| `THROTTLER_DASHBOARD_LIMIT` | `50` | /min — dashboard |
| `THROTTLER_WINDOW_MS` | `60000` | Janela de 60s |
| `THROTTLER_FAIL_CLOSED_AUTH_ROUTES` | `true` | Fail-closed em auth |
| `LOGIN_FAIL_MAX` | `10` | Tentativas por IP |
| `LOGIN_FAIL_ACCOUNT_MAX` | `10` | Tentativas por CPF |

---

## CSRF

| Variável | Obrigatório | Default |
|----------|-------------|---------|
| `CSRF_TOKEN_SECRET` | Sim (prod) | — |
| `REFRESH_CSRF_ENFORCED` | Não | `true` |
| `CSRF_TOKEN_TTL_SECONDS` | Não | `3600` |

---

## S3 Storage

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `AWS_ACCESS_KEY_ID` | Sim (prod) | Backblaze B2 |
| `AWS_SECRET_ACCESS_KEY` | Sim (prod) | |
| `AWS_S3_BUCKET` | Sim (prod) | |
| `AWS_ENDPOINT` | Sim (prod) | `https://s3.us-west-xxx.backblazeb2.com` |
| `AWS_REGION` | Não | `auto` |

---

## AI / Sophie

| Variável | Default | Descrição |
|----------|---------|-----------|
| `FEATURE_AI_ENABLED` | `true` | Master switch |
| `AI_PROVIDER` | `openai` | `openai` / `stub` / `local` |
| `OPENAI_API_KEY` | — | Obrigatório para modo openai |
| `OPENAI_MODEL` | `gpt-4o-2024-11-20` | Modelo principal |
| `OPENAI_VISION_MODEL` | `gpt-4o-2024-11-20` | Modelo para imagens |
| `OPENAI_CHAT_COMPLETION_TIMEOUT_MS` | `30000` | Timeout |

---

## Mail

| Variável | Default | Descrição |
|----------|---------|-----------|
| `MAIL_ENABLED` | `true` | |
| `MAIL_HOST` | — | SMTP host (prioritário) |
| `MAIL_USER` / `MAIL_PASS` | — | SMTP credentials |
| `RESEND_API_KEY` | — | Fallback se SMTP não configurado |
| `MAIL_FROM_NAME` | `GST - Gestão de Segurança do Trabalho` | |
| `MAIL_FROM_EMAIL` | `onboarding@resend.dev` | |

---

## Antivírus

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `ANTIVIRUS_PROVIDER` | Sim (prod) | `clamav` |
| `CLAMAV_HOST` | Não | `127.0.0.1` |
| `CLAMAV_PORT` | Não | `3310` |

---

## Observabilidade

| Variável | Descrição |
|----------|-----------|
| `LOG_LEVEL` | `warn` em produção |
| `SENTRY_DSN` | Sentry (opcional) |
| `SENTRY_ENVIRONMENT` | |
| `OTEL_ENABLED` | OpenTelemetry |
| `NEW_RELIC_LICENSE_KEY` | New Relic |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile |
| `PROMETHEUS_PORT` | `9464` |

---

## Workers

| Variável | Default | Descrição |
|----------|---------|-----------|
| `WORKER_HEARTBEAT_ENABLED` | `true` | |
| `WORKER_HEARTBEAT_KEY` | `worker:heartbeat:queue-runtime` | |
| `WORKER_HEARTBEAT_TTL_SECONDS` | `90` | |

---

## Validation Token

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `VALIDATION_TOKEN_SECRET` | Sim (prod) | Min 32 chars |
| `PUBLIC_VALIDATION_LEGACY_COMPAT` | Não | `false` |

---

## Dev Only

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DEV_LOGIN_BYPASS` | `false` | Login sem DB |
| `DEV_ADMIN_CPF` | — | CPF do admin bypass |
| `DISABLE_LOGIN_THROTTLE_IN_DEV` | `false` | Desliga throttle em dev |
| `N1_QUERY_DETECTION_ENABLED` | `false` | Detecta N+1 queries |

---

## Segurança — Checklist de Produção

- [ ] `DATABASE_SSL=true`
- [ ] `FIELD_ENCRYPTION_ENABLED=true`
- [ ] `FIELD_ENCRYPTION_KEY` = 32 bytes válidos
- [ ] `ANTIVIRUS_PROVIDER=clamav`
- [ ] `ADMIN_GERAL_MFA_REQUIRED=true`
- [ ] `MFA_ENABLED=true`
- [ ] `REFRESH_CSRF_ENFORCED=true`
- [ ] `CSRF_TOKEN_SECRET` = 32+ chars
- [ ] `JWT_SECRET` = 64+ chars (gerado com `openssl rand -hex 32`)
- [ ] `JWT_REFRESH_SECRET` = 64+ chars, diferente de `JWT_SECRET` (gerado com `openssl rand -hex 32`)
- [ ] `JWT_ISSUER` configurado (ex: `https://api.seu-dominio.com.br`)
- [ ] `JWT_AUDIENCE` configurado (ex: `sgs-app`)
- [ ] `VALIDATION_TOKEN_SECRET` = 32+ chars
- [ ] `THROTTLER_FAIL_CLOSED_AUTH_ROUTES=true`
- [ ] `REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN=true`
- [ ] `LOG_LEVEL=warn` (ou `error`)
- [ ] `DATABASE_URL` sem `-pooler` no runtime
- [ ] Role `sgs_app` sem `BYPASSRLS`
