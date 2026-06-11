# Deploy SGS Backend no Vultr + Coolify

Este runbook cobre apenas os dois serviços que saem do Render:

- `backend web`
- `backend worker`

O banco, Redis e frontend continuam em suas plataformas atuais.

## Estado alvo

- Vultr executa o Coolify em uma instância dedicada
- Coolify recebe o repositório GitHub do SGS
- Dois aplicativos separados sob o mesmo projeto:
  - web HTTP
  - worker assíncrono
- Render é mantido apenas até o corte final e depois desligado

## Instância Vultr

Configuração já usada nesta migração:

- Região: `sao`
- Plano: `vhp-1c-2gb-amd`
- Marketplace app: `coolify`

## Acesso ao Coolify

Após a criação da instância, o painel fica em:

- `http://<IP_DA_INSTANCIA>:8000`

## Primeiro login

1. Abrir o painel do Coolify.
2. Criar o usuário administrador.
3. Concluir o onboarding básico.
4. Criar o primeiro projeto.

## Conectar GitHub

No Coolify:

1. Ir em `Sources`.
2. Adicionar fonte `GitHub`.
3. Autorizar o repositório do SGS.

Repositório esperado:

- raiz do monorepo atual

## Aplicativo 1: backend web

Configuração recomendada:

- Build pack: Dockerfile
- Dockerfile: `backend/Dockerfile`
- Root directory: `backend`
- Start command: `npm run start:web`
- Porta interna: `3000`
- Health check: `/health/public`

Variáveis obrigatórias:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DATABASE_REPLICA_URL`
- `REDIS_URL`
- `REDIS_AUTH_URL`
- `REDIS_CACHE_URL`
- `REDIS_QUEUE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `VALIDATION_TOKEN_SECRET`
- `DOCUMENT_DOWNLOAD_TOKEN_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`
- `AWS_S3_BUCKET`
- `AWS_S3_ENDPOINT`
- `AWS_ENDPOINT`
- `S3_FORCE_PATH_STYLE=true`
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`

Variáveis já fixadas no repo e que devem permanecer:

- `FRONTEND_URL=https://app.sgsseguranca.com.br`
- `API_PUBLIC_URL=https://api.sgsseguranca.com.br`
- `AUTH_COOKIE_DOMAIN=.sgsseguranca.com.br`
- `DB_POOL_MAX=10`
- `DB_POOL_MIN=1`
- `DB_CONNECTION_TIMEOUT_MS=10000`
- `DB_IDLE_TIMEOUT_MS=30000`
- `DB_STATEMENT_TIMEOUT_MS=25000`
- `REQUEST_TIMEOUT_MS=30000`
- `REQUIRE_NO_PENDING_MIGRATIONS=false`

## Aplicativo 2: backend worker

Configuração recomendada:

- Build pack: Dockerfile
- Dockerfile: `backend/Dockerfile.worker`
- Root directory: `backend`
- Start command: `npm run start:worker`

Variáveis obrigatórias:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_AUTH_URL`
- `REDIS_CACHE_URL`
- `REDIS_QUEUE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `VALIDATION_TOKEN_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`
- `AWS_S3_BUCKET`
- `AWS_S3_ENDPOINT`
- `AWS_ENDPOINT`
- `S3_FORCE_PATH_STYLE=true`
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`

Variáveis já fixadas no repo e que devem permanecer:

- `DB_POOL_MAX=10`
- `DB_POOL_MIN=1`
- `DB_CONNECTION_TIMEOUT_MS=10000`
- `DB_IDLE_TIMEOUT_MS=30000`
- `DB_STATEMENT_TIMEOUT_MS=25000`
- `REQUEST_TIMEOUT_MS=30000`
- `PDF_GENERATION_CONCURRENCY=2`
- `PDF_GENERATION_RSS_WARN_MB=900`
- `WORKER_HEARTBEAT_ENABLED=true`
- `WORKER_HEARTBEAT_REQUIRED=true`
- `MIGRATION_ADVISORY_LOCK_TIMEOUT_MS=300000`

## Migrations

As migrations não devem rodar no deploy automático do web.

Fluxo seguro:

1. executar migrations manualmente
2. subir web
3. subir worker

Comando de migrations no backend:

- `npm run release:migrate`

## Corte do Render

Só desligar os serviços antigos depois de validar:

- web responde em `/health/public`
- worker sobe sem erro
- filas processam normalmente
- login funciona
- PDF e rotinas assíncronas funcionam

Sequência recomendada:

1. subir web no Coolify
2. subir worker no Coolify
3. conferir logs
4. validar healthcheck
5. verificar variáveis críticas
6. desligar serviços equivalentes no Render

## Observação importante

O repo já possui os dois Dockerfiles separados:

- `backend/Dockerfile`
- `backend/Dockerfile.worker`

Isso evita improviso no deploy e mantém web/worker isolados.
