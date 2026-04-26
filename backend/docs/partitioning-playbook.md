# Playbook: Particionar tabelas de alto volume em produção

Este documento descreve o procedimento manual para converter tabelas grandes
(`ai_interactions`, `mail_logs`, `audit_logs`) para particionamento por
`created_at` quando a migration automática (`1709000000165` e similares) é
abortada pelo guard de safety (>50.000 linhas).

> **Quando aplicar:** janela de manutenção curta (5–15 min). A operação
> bloqueia escritas na tabela durante a cópia + swap. Não é compatível com
> rolling deploy.

---

## Pré-requisitos

- Backup recente confirmado no Neon/RDS (ponto de restauração)
- Acesso ao endpoint **direto** do banco (não pooler)
  — `CONCURRENTLY` e DDL longo precisam de sessão estável
- Janela de manutenção comunicada (uploads de IA ficarão bloqueados)
- Verificar dependências externas (FKs apontando para a tabela alvo):
  ```sql
  SELECT conname, conrelid::regclass AS table
  FROM pg_constraint
  WHERE confrelid = 'ai_interactions'::regclass AND contype = 'f';
  ```
  Para `ai_interactions` este SELECT deve retornar zero linhas.

---

## Procedimento (exemplo: `ai_interactions`)

### 1. Snapshot de tamanho

```sql
SELECT pg_size_pretty(pg_total_relation_size('ai_interactions')) AS size,
       (SELECT COUNT(*) FROM ai_interactions) AS rows;
```

Anote os valores. Tabelas acima de **5 GB** ou **5M linhas** exigem
particionamento *online* (pg_partman, ver seção avançada). Para tabelas
abaixo desses limites, o procedimento abaixo é seguro.

### 2. Subir flag de leitura-somente no app

Defina temporariamente `FEATURE_AI_ENABLED=false` no Render dashboard
ou pause os workers que escrevem na tabela. Confirme via:

```sql
SELECT * FROM pg_stat_activity
WHERE query ILIKE '%ai_interactions%' AND state = 'active';
```

Não deve haver INSERT/UPDATE ativos.

### 3. Executar a conversão (em transação)

```sql
BEGIN;

  ALTER TABLE ai_interactions RENAME TO ai_interactions_legacy;
  DROP POLICY IF EXISTS tenant_isolation ON ai_interactions_legacy;

  CREATE TABLE ai_interactions (
    LIKE ai_interactions_legacy INCLUDING DEFAULTS INCLUDING IDENTITY
  ) PARTITION BY RANGE (created_at);

  ALTER TABLE ai_interactions
    ADD CONSTRAINT PK_ai_interactions PRIMARY KEY (id, created_at);

  CREATE INDEX IDX_ai_interactions_tenant_created
    ON ai_interactions (tenant_id, created_at);
  CREATE INDEX IDX_ai_interactions_tenant_user_created
    ON ai_interactions (tenant_id, user_id, created_at);
  CREATE INDEX IDX_ai_interactions_tenant_id
    ON ai_interactions (tenant_id);

  ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON ai_interactions
    USING (tenant_id = current_setting('app.tenant_id', true));

  CREATE TABLE ai_interactions_default
    PARTITION OF ai_interactions DEFAULT;

  -- Crie partições para o range de dados existente. Execute o helper:
  -- backend/scripts/generate-partition-ranges.sql para gerar os comandos.

  CREATE TABLE ai_interactions_2025_10 PARTITION OF ai_interactions
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
  CREATE TABLE ai_interactions_2025_11 PARTITION OF ai_interactions
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
  CREATE TABLE ai_interactions_2025_12 PARTITION OF ai_interactions
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
  CREATE TABLE ai_interactions_2026_01 PARTITION OF ai_interactions
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
  -- ...continue até 3 meses no futuro

COMMIT;
```

### 4. Cópia em batches (fora da transação principal)

Para tabelas grandes, NÃO copie tudo em um INSERT único — isso gera
WAL massivo e pode estourar o disco. Use batches:

```sql
-- Loop até retornar 0
INSERT INTO ai_interactions
SELECT * FROM ai_interactions_legacy
WHERE id IN (
  SELECT id FROM ai_interactions_legacy
  WHERE id NOT IN (SELECT id FROM ai_interactions)
  LIMIT 10000
);
```

Repita até estabilizar. Acompanhe progresso:

```sql
SELECT
  (SELECT COUNT(*) FROM ai_interactions) AS migrados,
  (SELECT COUNT(*) FROM ai_interactions_legacy) AS legados;
```

### 5. Confirmação

```sql
-- Counts devem bater
SELECT COUNT(*) FROM ai_interactions;
SELECT COUNT(*) FROM ai_interactions_legacy;

-- Verificar que partições estão sendo usadas
SELECT
  schemaname,
  relname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS size,
  n_live_tup AS rows
FROM pg_stat_user_tables
WHERE relname LIKE 'ai_interactions%'
ORDER BY relname;
```

### 6. Drop da tabela legacy

Após validação completa (preferencialmente 24h após para garantir que
nenhuma query orfã referencia o nome antigo):

```sql
DROP TABLE ai_interactions_legacy;
```

### 7. Reativar app

Reverter `FEATURE_AI_ENABLED` para `true` ou retomar workers.

---

## Manutenção contínua: rotação de partições

O retention worker (`AI_HISTORY_MAX_DAYS=90`) precisa ser estendido para:

1. **Mensalmente**: criar a partição do próximo mês
2. **Após 90 dias**: `DROP PARTITION ai_interactions_YYYY_MM` ao invés de DELETE

Ver `backend/src/common/storage/document-retention.service.ts` —
adicionar handler análogo para particionamento.

---

## Particionamento avançado (>5 GB)

Para tabelas que não podem tolerar a janela de manutenção, use **pg_partman**:

```sql
CREATE EXTENSION pg_partman;

SELECT partman.create_parent(
  p_parent_table := 'public.ai_interactions',
  p_control := 'created_at',
  p_type := 'range',
  p_interval := 'monthly'
);
```

`pg_partman` faz a conversão online com `ATTACH PARTITION` em background,
sem bloquear escritas. Requer extensão habilitada no provedor (Neon
Pro, RDS, ou self-hosted).

---

## Rollback

Se algo der errado durante a conversão automática (migration 1709000000165),
TypeORM reverte a transação inteira — `ai_interactions_legacy` permanece
intacta. Para rollback manual após COMMIT:

```sql
BEGIN;
  ALTER TABLE ai_interactions RENAME TO ai_interactions_partitioned;
  ALTER TABLE ai_interactions_legacy RENAME TO ai_interactions;
COMMIT;
DROP TABLE ai_interactions_partitioned CASCADE;
```

---

## Aplicabilidade a outras tabelas

| Tabela | Volume esperado | Particionar? | Estratégia |
|---|---|---|---|
| `ai_interactions` | ~10M/ano | **Sim** | Range mensal por created_at |
| `mail_logs` | ~50M/ano | **Sim** | Range mensal + retention 90d |
| `audit_logs` | ~100M+/ano | **Sim** | Range mensal + retention 365d |
| `activities` (master) | <10k | Não | Master data, não event log |
| `notifications` | ~50M/ano | Considerar | Avaliar quando atingir 10M |

Para `mail_logs` e `audit_logs`, replicar este procedimento substituindo
o nome da tabela e ajustando os índices conforme a estrutura atual.
