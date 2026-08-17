# Troubleshooting Guide — SGS Segurança

> Guia de diagnóstico e solução de problemas comuns nos ambientes de desenvolvimento e produção.

---

## Banco de Dados

### Migration falha com erro de lock
```
ERROR: deadlock detected
ERROR: cannot run DDL in transaction for CONCURRENTLY
```

**Causa:** Migration com `CREATE INDEX CONCURRENTLY` sem `transaction = false`.

**Solução:** Garantir que migrations com CONCURRENTLY exportem `{ transaction: false }`:
```typescript
export default class MinhaMigration implements MigrationInterface {
  name = 'MinhaMigration1709000000182';
  transaction = false;  // ← essencial!
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`);
  }
}
```

### Migration falha — "Role does not exist" no Neon

**Causa:** `DATABASE_MIGRATION_URL` usando role sem permissão DDL.

**Solução:** Usar role administrativa/owner:
```bash
DATABASE_MIGRATION_URL=postgresql://owner:SUA_SENHA_DDL@ep-SEU-REF.us-east-1.aws.neon.tech/neondb
```

**Verificar:**
```sql
SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

### RLS não está filtrando — dados de outros tenants visíveis

**Causa:** `DATABASE_URL` apontando para endpoint `-pooler` do Neon. Pooler em transaction mode quebra `SET LOCAL`.

**Solução:** Usar endpoint **sem** `-pooler` no runtime. Pooler só para migrations que não usam `SET LOCAL`.
```bash
# ERRADO:
DATABASE_URL=postgresql://sgs_app:SUA_SENHA@ep-SEU-REF-pooler.us-east-1.aws.neon.tech/neondb
# CERTO:
DATABASE_URL=postgresql://sgs_app:SUA_SENHA@ep-SEU-REF.us-east-1.aws.neon.tech/neondb
```

### Query lenta — sequential scan em tabela grande

**Diagnóstico:**
```sql
EXPLAIN ANALYZE SELECT * FROM audit_logs WHERE company_id = '...' ORDER BY created_at DESC;
```

**Solução:** Verificar índices ausentes:
- `company_id` deve ser indexado
- `created_at` deve ser indexado para ORDER BY
- Índices compostos para filtros comuns: `(company_id, created_at)`
- Considerar particionamento para `audit_logs`, `mail_logs`, `ai_interactions`

### Connection pool exausted — "too many connections"

**Causa:** TypeORM connection pool maior que o limite do Neon.

**Solução:** Ajustar pool size nas configurações do TypeORM:
```typescript
extra: {
  max: 10,  // Neon free tier: 10 max
  connectionTimeoutMillis: 5000,
}
```

### Erro "Field encryption key is not configured"

**Causa:** `FIELD_ENCRYPTION_ENABLED=true` sem `FIELD_ENCRYPTION_KEY` válida.

**Solução:** Configurar chave de 32 bytes (64 chars hex, ou 32 chars UTF-8):
```bash
# Gere com: openssl rand -hex 32
FIELD_ENCRYPTION_KEY=<64-chars-hex-gerado-com-openssl-rand-hex-32>
FIELD_ENCRYPTION_HASH_KEY=<outra-chave-diferente-64-chars-hex>
```

---

## Redis

### Throttler permitindo requisições demais

**Causa:** Redis offline e fallback local com limite alto.

**Verificar:**
```bash
redis-cli -u $REDIS_AUTH_URL ping
```

**Solução:** Ajustar fallback local:
```bash
THROTTLER_AUTH_LOCAL_FALLBACK_ENABLED=true
THROTTLER_AUTH_LOCAL_FALLBACK_LIMIT=60
THROTTLER_AUTH_ME_LOCAL_FALLBACK_LIMIT=1200
```

Se quiser fail-closed (negar quando Redis cair):
```bash
THROTTLER_STORAGE_FAIL_OPEN=false
```

### BullMQ jobs não estão sendo processados

**Causa:** Worker pode estar offline.

**Verificar:**
```bash
# Health check do worker:
redis-cli -u $REDIS_QUEUE_URL GET worker:heartbeat:queue-runtime
# Se vazio ou expirado >90s, worker está morto
```

**Solução:** Reiniciar o worker:
```bash
npm run start:worker
```

### Job preso na fila com status "failed"

```bash
# Acessar Bull Board (requer Basic Auth):
# GET /admin/queues
```

**Verificar logs:** `mail_logs` ou logs da aplicação para o stack trace.

**Solução:** Reprocessar jobs falhos via Bull Board ou:
```typescript
const queue = this.bullQueue.getQueue('mail');
const failed = await queue.getFailed();
await failed[0].retry();
```

---

## Autenticação

### Login retorna 429 Too Many Requests

**Causa:** Rate limit de login excedido (5/min por IP e 10/janela por CPF).

**Solução:** Aguardar a janela (15 min default). Verificar configuração:
```bash
LOGIN_FAIL_MAX=10
LOGIN_FAIL_WINDOW_SECONDS=900
LOGIN_FAIL_BLOCK_SECONDS=900
```

**Em dev:** Desabilitar throttle temporariamente:
```bash
DISABLE_LOGIN_THROTTLE_IN_DEV=true
```

### Refresh token rejeitado com 401

**Causa:** Token expirado, revogado, ou CSRF ausente/inválido.

**Verificar:**
- Token expirou? (30d default)
- Header `x-refresh-csrf` está presente?
- Cookie `refresh-csrf` corresponde ao header?
- Sessão foi revogada por reuso de token?

### MFA não está sendo exigido para ADMIN_GERAL

**Causa:** Configuração `ADMIN_GERAL_MFA_REQUIRED=false`.

**Solução:**
```bash
ADMIN_GERAL_MFA_REQUIRED=true
MFA_ENABLED=true
```

---

## Upload e Storage

### Upload falha — "File type not allowed"

**Causa:** Arquivo com extensão ou magic bytes não permitidos.

**Solução:** Verificar tipos permitidos no `FileInspectionModule`. PDF, JPEG, PNG, MP4 são os principais.

### Upload retorna 413 — arquivo muito grande

**Causa:** Limite de tamanho excedido.

**Solução:** Verificar configuração no middleware e no servidor (Nginx/Coolify proxy se houver).

### ClamAV detectando falso positivo

**Causa:** Arquivo legítimo sinalizado como threat.

**Solução:** Adicionar à whitelist temporária e reportar ao time de segurança.

### PDF não está sendo gerado

**Causa:** Puppeteer sem Chromium ou timeout excedido.

**Verificar:**
```bash
# Verificar se Chromium foi baixado no pós-instalação:
ls node_modules/puppeteer/.local-chromium/
```

**Solução:** Rodar `npm run postinstall` ou `npx puppeteer browsers install chrome`.

---

## Deploy

### Frontend não carrega — erro de CORS

**Causa:** `CORS_ALLOWED_ORIGINS` não inclui a URL do frontend.

**Solução:**
```bash
CORS_ALLOWED_ORIGINS=https://app.sgsseguranca.com.br,https://staging.sgsseguranca.com.br
```

### API cai logo após deploy

**Causa:** Migration pendente ou variável de ambiente ausente.

**Solução:**
1. Verificar se migrations foram executadas: `npm run migration:run`
2. Verificar logs da aplicação para MissingEnvVarError
3. Comparar `.env` com `.env.example`

### Health check do worker falha

**Verificar:**
```bash
curl -s http://api:3001/health | jq '.services.worker'
```

**Possíveis causas:**
- Worker não iniciou
- Heartbeat expirou (>90s sem bater)
- Redis da fila inacessível

---

## Desenvolvimento Local

### SQLite não inicia

**Causa:** `better-sqlite3` não compilado para a plataforma.

**Solução:**
```bash
npm rebuild better-sqlite3
```

### TypeORM não encontra entities

**Causa:** Path errado no `data-source.ts`.

**Solução:** Verificar `entities` path:
```typescript
entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js']
```
Em dev, se estiver rodando com `ts-node`, pode precisar de path diferente.

### Testes E2E falham — banco de teste não disponível

**Causa:** Docker Compose de teste não está rodando.

**Solução:**
```bash
cd backend && docker compose -f ../ops/test/compose/docker-compose.e2e.yml up -d
```

---

## Logs e Diagnóstico

### Comandos rápidos

```bash
# Logs da API em produção (Coolify)
coolify logs sgs-api

# Logs do worker
coolify logs sgs-worker

# Sentry (se configurado)
# Dashboard → Issues → filtrar por environment

# Health check completo
curl http://api:3001/health

# Verificar worker heartbeat
redis-cli -u $REDIS_QUEUE_URL GET worker:heartbeat:queue-runtime
```

### Erro: "Cannot read properties of undefined (reading 'companyId')"

**Causa:** Contexto multi-tenant não foi inicializado (usuário não enviou `x-company-id`).

**Solução:** Verificar se a rota precisa de `@TenantOptional()` ou se o header está presente.

### Erro: "relation 'xxx' does not exist"

**Causa:** Migration não rodou ou tabela foi dropada.

**Solução:**
```bash
npm run migration:run
```

---

## Rollback de Emergência

### Database
```bash
cd backend
npm run migration:revert  # Reverte última migration
# Ou restore manual:
npm run dr:restore
```

### Frontend (Vercel)
Vercel Dashboard → Deployments → ⋮ → Rollback to previous

### Backend (Coolify)
Coolify Dashboard → Deployment → Rollback (ou rebuild tag anterior)

---

## Checklist de Diagnóstico Rápido

- [ ] API responde `GET /health/public` → 200?
- [ ] Banco acessível? `npm run migration:run` funciona?
- [ ] Redis acessível? `redis-cli ping` → PONG?
- [ ] Worker heartbeat ativo? `redis GET worker:heartbeat:queue-runtime`
- [ ] MFA habilitado para ADMIN_GERAL?
- [ ] Rate limiting ativo? `THROTTLER_ENABLED=true`
- [ ] Field encryption ativo? `FIELD_ENCRYPTION_ENABLED=true`
- [ ] CSRF ativo em produção? `REFRESH_CSRF_ENFORCED=true`
