# Runbook - Render + Supabase Cutover (V1)

## Objetivo

Migrar o backend NestJS para usar PostgreSQL do Supabase, mantendo:

- API e contratos HTTP atuais
- auth/JWT atual
- storage atual (R2/S3)

Sem migrar Supabase Auth/Storage no V1.

## Arquitetura alvo

- `backend-web` no Render
  - build: `npm ci && npm run build`
  - pre-deploy: `npm run migration:run`
  - start: `npm run start:web`
- `backend-worker` no Render
  - build: `npm ci && npm run build`
  - start: `npm run start:worker`
- banco: Supabase Postgres (session pooler `5432`)

## Variaveis criticas (web e worker)

- `DATABASE_URL` (Supabase pooler, `sslmode=require`)
- `DATABASE_SSL=true`
- `DATABASE_SSL_ALLOW_INSECURE=false`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `VALIDATION_TOKEN_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `AWS_S3_ENDPOINT` (opcional, para R2/S3 compativel)

## Janela de cutover (pausa curta de escrita)

### T-30 min

1. Confirmar que `backend-web` e `backend-worker` estao saudaveis no ambiente atual.
2. Validar acesso ao banco origem e ao banco Supabase.
3. Definir variaveis:

```bash
export SOURCE_DB_URL='postgresql://...origem...'
export TARGET_DB_URL='postgresql://...supabase...:5432/postgres?sslmode=require'
```

4. Backup de seguranca da origem:

```bash
pg_dump "$SOURCE_DB_URL" --format=custom --no-owner --no-privileges --file=backup_pre_cutover.dump
```

### T0 (inicio da manutencao)

1. Pausar escrita da aplicacao (maintenance mode).
2. Rodar dump final da origem:

```bash
pg_dump "$SOURCE_DB_URL" --format=custom --no-owner --no-privileges --file=backup_cutover.dump
```

3. Restaurar no Supabase:

```bash
pg_restore --dbname="$TARGET_DB_URL" --clean --if-exists --no-owner --no-privileges backup_cutover.dump
```

4. Atualizar `DATABASE_URL` no Render para `TARGET_DB_URL` (web e worker).
5. Deploy do `backend-web` (migration no pre-deploy).
6. Deploy do `backend-worker`.
7. Reabrir escrita/trafego.

## Smoke test obrigatorio apos corte

1. `GET /health/public` retorna 200.
2. Login/autenticacao funcionando.
3. CRUD de entidade principal (empresa/APR) funcionando.
4. Listagem paginada sem erro de banco.
5. Execucao de 1 job real no worker (fila processada).

## Validacao de dados (origem vs destino)

Comparar contagens de tabelas criticas:

- `users`
- `companies`
- `aprs`
- `dds`

Exemplo:

```sql
select
  (select count(*) from users) as users,
  (select count(*) from companies) as companies,
  (select count(*) from aprs) as aprs,
  (select count(*) from dds) as dds;
```

## Rollback (se falhar no cutover)

1. Ativar manutencao novamente.
2. Restaurar `DATABASE_URL` anterior no Render (web e worker).
3. Redeploy de web e worker.
4. Validar `health` e login.
5. Encerrar incidente com registro de causa e proxima janela.

## Criterios de sucesso

- API sobe sem erro TypeORM.
- Worker conecta e processa fila.
- Smoke funcional completo sem regressao.
- Contagens criticas coerentes com a origem.
- Sem necessidade de mudanca de contrato frontend/backend.
