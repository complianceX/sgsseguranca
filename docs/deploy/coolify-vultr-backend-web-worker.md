# Deploy SGS Backend no Vultr + Coolify (documento histórico)

> *Nota: Infraestrutura atualizada. A migração foi concluída — Render foi desligado. Este documento documenta o processo de migração para referência futura.*
>
> **Para colocar uma versão em produção hoje** (frontend + backend + worker + migrations, com as
> armadilhas conhecidas), use **[COMO-COLOCAR-EM-PRODUCAO.md](./COMO-COLOCAR-EM-PRODUCAO.md)**.
> Este arquivo aqui cobre a configuração da infra (env vars, recursos, domínios).

Este runbook cobre os dois serviços que foram migrados do Render:

- `backend web`
- `backend worker`

O banco, Redis e frontend continuam em suas plataformas atuais.

## Estado atual (pós-migração)

- Vultr executa o Coolify em uma instância dedicada
- Coolify recebe o repositório GitHub do SGS
- Dois aplicativos separados sob o mesmo projeto:
  - web HTTP
  - worker assíncrono
- Render foi desligado após conclusão da migração

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
- Dockerfile: `Dockerfile`
- Root directory: `.` (raiz do repositório)
- Start command: `npm run start:web`
- Porta interna: `8080`
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

Para habilitar a SOPHIE com NVIDIA NIM / GPT-OSS 120B, configure no backend web:

- `FEATURE_AI_ENABLED=true`
- `AI_PROVIDER=nvidia`
- `NVIDIA_API_KEY`
- `NVIDIA_API_BASE_URL=https://integrate.api.nvidia.com/v1`
- `NVIDIA_MODEL=openai/gpt-oss-120b`
- `NVIDIA_REASONING_EFFORT=medium`
- `LEGAL_POLICY_VERSION=2026-07-13`
- `LEGAL_AI_CONSENT_VERSION=2026-07-13`

`NVIDIA_API_KEY` não deve ser substituída por `OPENAI_API_KEY`. O GPT-OSS 120B é textual; análise de imagens permanece bloqueada.

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
- Dockerfile: `Dockerfile.worker`
- Root directory: `.` (raiz do repositório)
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

Se o worker executar fluxos de IA, replique as mesmas variáveis NVIDIA do backend web. Caso não processe tarefas de IA, mantenha `FEATURE_AI_ENABLED=false` nele.

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

## Corte do Render (concluído)

O corte foi realizado seguindo a validação abaixo:

- [x] web responde em `/health/public`
- [x] worker sobe sem erro
- [x] filas processam normalmente
- [x] login funciona
- [x] PDF e rotinas assíncronas funcionam

Sequência executada:

1. subir web no Coolify
2. subir worker no Coolify
3. conferir logs
4. validar healthcheck
5. verificar variáveis críticas
6. desligar serviços equivalentes no Render

## Observação importante

O repo já possui os dois Dockerfiles separados:

- `Dockerfile`
- `Dockerfile.worker`

Isso evita improviso no deploy e mantém web/worker isolados.
