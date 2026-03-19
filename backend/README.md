# Backend API

Backend em NestJS para o sistema <GST> Gestão de Segurança do Trabalho.

## Requisitos

- Node.js 20+
- PostgreSQL
- Redis

## Instalação

```bash
npm install
```

## Execução

```bash
# desenvolvimento
npm run start:dev

# produção (build já gerado)
npm run start:prod
```

## Build

```bash
npm run build
```

## Testes

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## Migrações de Banco

```bash
npm run migration:run
npm run migration:revert
npm run release:migrate
npm run ci:migration:check
```

## Variáveis de ambiente

Use `backend/.env.example` como base.

Variáveis críticas de produção:

- `JWT_SECRET` (mínimo 64 caracteres)
- `ENCRYPTION_KEY` (mínimo 32 caracteres)
- `FRONTEND_URL`
- `DATABASE_URL`
- `URL_REDIS` ou `REDIS_URL`
- `GOOGLE_OAUTH_ENABLED` e `AZURE_OAUTH_ENABLED` como `true` apenas se OAuth estiver configurado
- `ACCESS_TOKEN_TTL` e `REFRESH_TOKEN_TTL_DAYS`
- `MAX_ACTIVE_SESSIONS_PER_USER`
- `PASSWORD_MIN_LENGTH` e `BCRYPT_SALT_ROUNDS`
- `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`
- `CACHE_TTL_SECONDS`
- `BACKUP_SECRET_KEY`

## Segurança

- `DB_SYNC` deve permanecer `false` em produção.
- `ALLOW_DB_SYNC_IN_PROD` só deve ser `true` em operação controlada.
- `REQUIRE_NO_PENDING_MIGRATIONS=true` bloqueia startup em produção se houver migration pendente.
- Swagger é habilitado apenas fora de produção.
- `DATABASE_URL` e `REDIS_URL/URL_REDIS` não podem usar placeholders (ex.: `host`, `base`, `abc`, `${{...}}`).
- Política de senha forte é aplicada em criação/edição/troca de senha.
- Sessões simultâneas são limitadas por `MAX_ACTIVE_SESSIONS_PER_USER` (tokens antigos são revogados automaticamente).
- Endpoint de backup (`POST /compliance/backup-log`) aceita `x-backup-secret` e faz comparação em tempo constante.

## Observabilidade

- Health checks reais:
  - `GET /health/public` para liveness do web
  - `GET /health` para prontidão do web
- `x-request-id` é retornado nas respostas para correlação.
- Logs do backend saem em JSON estruturado no stdout/stderr.
- OpenTelemetry é opcional:
  - habilitar com `OTEL_ENABLED=true`
  - exporter Prometheus usa `PROMETHEUS_PORT`
  - tracing usa `JAEGER_ENDPOINT`
- Sentry é opcional:
  - instalar manualmente: `npm i @sentry/node`
  - configurar: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`
- Sem `OTEL_ENABLED=true`, o sistema continua funcional, mas não exporta métricas/traces.

## Deploy Seguro (Migrations)

Fluxo recomendado em produção:

1. Aplicar migration antes de subir nova versão:
`npm run release:migrate`
2. Subir aplicação:
`npm run start:web`
3. Subir worker separadamente:
`npm run start:worker`
4. Habilitar proteção de startup:
`REQUIRE_NO_PENDING_MIGRATIONS=true`

No Railway, configure `npm run release:migrate` como pre-deploy step.

## Etapas 5, 6 e 7

- Etapa 5 (Hardening API/Auth):
  - Política forte de senha com validação server-side.
  - Limite de sessões simultâneas por usuário.
  - Segredo de backup por header com comparação segura.
- Etapa 6 (Escala/Performance):
  - Pool de conexões do Postgres configurável por ambiente.
  - Cache TTL configurável por ambiente.
  - Thresholds de monitoramento configuráveis por ambiente.
- Etapa 7 (Backup/DR):
  - Runbook operacional em `backend/OPERATIONS_RUNBOOK.md`.
  - Script de prontidão de disaster recovery: `npm run ops:dr:check`.
