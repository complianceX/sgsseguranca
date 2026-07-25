-- =============================================================================
-- SGS — Verificações de auditoria de banco (SOMENTE LEITURA)
-- =============================================================================
-- Todas as consultas abaixo são SELECT. Nenhuma altera dados ou estrutura.
-- Seguro para executar em produção.
--
-- Uso:
--   psql "$DATABASE_URL" -f backend/scripts/db-audit-checks.sql
--
-- Interpretação: qualquer bloco que retorne linhas indica algo a investigar.
-- Blocos vazios são o resultado esperado.
--
-- Contexto: o banco local usado na auditoria estrutural está vazio, então as
-- verificações de DADOS (órfãos, duplicados, inconsistências) só produzem
-- resultado real no ambiente que tem registros — daí este script.
-- =============================================================================

\pset border 2
\timing on

-- =============================================================================
-- 1. INTEGRIDADE REFERENCIAL — registros órfãos
-- =============================================================================
-- FKs existem na maior parte do schema, mas colunas de vínculo sem constraint
-- (ou com ON DELETE SET NULL) podem deixar referências apontando para o nada.

\echo '=== 1.1 activities sem empresa correspondente ==='
SELECT count(*) AS orfaos
FROM activities a
LEFT JOIN companies c ON c.id = a.company_id
WHERE a.company_id IS NOT NULL AND c.id IS NULL;

\echo '=== 1.2 users sem empresa correspondente ==='
SELECT count(*) AS orfaos
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE u.company_id IS NOT NULL AND c.id IS NULL;

\echo '=== 1.3 ai_interactions apontando para empresa inexistente (company_id é varchar, sem FK) ==='
SELECT count(*) AS orfaos
FROM ai_interactions ai
LEFT JOIN companies c ON c.id::text = ai.company_id
WHERE ai.company_id IS NOT NULL
  AND btrim(ai.company_id) <> ''
  AND c.id IS NULL;

\echo '=== 1.4 audit_logs apontando para usuário inexistente ==='
SELECT count(*) AS orfaos
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.user_id IS NOT NULL AND u.id IS NULL;

-- =============================================================================
-- 2. ISOLAMENTO MULTIEMPRESA — vínculos cruzando tenants
-- =============================================================================
-- O RLS impede leitura cruzada, mas não impede que um registro filho tenha
-- company_id diferente do pai caso a escrita tenha ocorrido antes das policies
-- atuais (ou por rota administrativa).

\echo '=== 2.1 sites cujo company_id difere do da empresa ==='
SELECT count(*) AS divergentes
FROM sites s
JOIN companies c ON c.id = s.company_id
WHERE s.company_id <> c.id;

\echo '=== 2.2 APRs cujo site pertence a outra empresa ==='
SELECT count(*) AS cross_tenant
FROM aprs a
JOIN sites s ON s.id = a.site_id
WHERE a.company_id IS NOT NULL
  AND s.company_id IS NOT NULL
  AND a.company_id <> s.company_id;

\echo '=== 2.3 PTs cujo site pertence a outra empresa ==='
SELECT count(*) AS cross_tenant
FROM pts p
JOIN sites s ON s.id = p.site_id
WHERE p.company_id IS NOT NULL
  AND s.company_id IS NOT NULL
  AND p.company_id <> s.company_id;

\echo '=== 2.4 usuários cujo site pertence a outra empresa ==='
SELECT count(*) AS cross_tenant
FROM users u
JOIN sites s ON s.id = u.site_id
WHERE u.company_id IS NOT NULL
  AND s.company_id IS NOT NULL
  AND u.company_id <> s.company_id;

-- =============================================================================
-- 3. SOFT DELETE — unicidade e consistência
-- =============================================================================
-- Índices UNIQUE que não consideram deleted_at impedem reaproveitar
-- número/código após exclusão lógica. Estes blocos medem o efeito real.

\echo '=== 3.1 números de RDO ocupados por registros já excluídos ==='
SELECT count(*) AS numeros_bloqueados
FROM rdos
WHERE deleted_at IS NOT NULL AND numero IS NOT NULL;

\echo '=== 3.2 CNPJs ocupados por empresas excluídas (impede recadastro) ==='
SELECT count(*) AS cnpjs_bloqueados
FROM companies
WHERE deleted_at IS NOT NULL AND cnpj IS NOT NULL;

\echo '=== 3.3 registros ativos vinculados a empresa excluída ==='
SELECT 'aprs' AS tabela, count(*) AS ativos_com_pai_excluido
FROM aprs a JOIN companies c ON c.id = a.company_id
WHERE a.deleted_at IS NULL AND c.deleted_at IS NOT NULL
UNION ALL
SELECT 'pts', count(*)
FROM pts p JOIN companies c ON c.id = p.company_id
WHERE p.deleted_at IS NULL AND c.deleted_at IS NOT NULL
UNION ALL
SELECT 'users', count(*)
FROM users u JOIN companies c ON c.id = u.company_id
WHERE u.deleted_at IS NULL AND c.deleted_at IS NOT NULL;

-- =============================================================================
-- 4. DUPLICIDADE
-- =============================================================================

\echo '=== 4.1 CNPJ duplicado entre empresas ativas ==='
SELECT cnpj, count(*) AS ocorrencias
FROM companies
WHERE deleted_at IS NULL AND cnpj IS NOT NULL AND btrim(cnpj) <> ''
GROUP BY cnpj HAVING count(*) > 1
ORDER BY 2 DESC LIMIT 20;

\echo '=== 4.2 e-mail duplicado dentro da mesma empresa ==='
SELECT company_id, lower(btrim(email)) AS email, count(*) AS ocorrencias
FROM users
WHERE deleted_at IS NULL AND email IS NOT NULL AND btrim(email) <> ''
GROUP BY company_id, lower(btrim(email))
HAVING count(*) > 1
ORDER BY 3 DESC LIMIT 20;

\echo '=== 4.3 número de RDO duplicado na mesma empresa (ativos) ==='
SELECT company_id, numero, count(*) AS ocorrencias
FROM rdos
WHERE deleted_at IS NULL AND numero IS NOT NULL
GROUP BY company_id, numero HAVING count(*) > 1
ORDER BY 3 DESC LIMIT 20;

-- =============================================================================
-- 5. QUALIDADE DE DADOS
-- =============================================================================

\echo '=== 5.1 strings vazias onde deveria haver NULL ==='
SELECT 'users.email' AS campo, count(*) AS vazios FROM users WHERE email = ''
UNION ALL SELECT 'companies.cnpj', count(*) FROM companies WHERE cnpj = ''
UNION ALL SELECT 'ai_interactions.company_id', count(*) FROM ai_interactions WHERE company_id = '';

\echo '=== 5.2 e-mails com espaços nas bordas ou caixa mista ==='
SELECT count(*) AS inconsistentes
FROM users
WHERE email IS NOT NULL AND (email <> btrim(email) OR email <> lower(email));

\echo '=== 5.3 CPF plaintext remanescente (deve ser 0 — backfill de criptografia) ==='
SELECT count(*) AS cpf_em_texto_puro
FROM users
WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

-- =============================================================================
-- 6. DATAS — períodos invertidos e valores implausíveis
-- =============================================================================

\echo '=== 6.1 PTs com término anterior ao início ==='
SELECT count(*) AS invertidos
FROM pts
WHERE data_hora_inicio IS NOT NULL
  AND data_hora_fim IS NOT NULL
  AND data_hora_fim < data_hora_inicio;

\echo '=== 6.1b PTs com encerramento real anterior ao início ==='
SELECT count(*) AS invertidos
FROM pts
WHERE data_hora_inicio IS NOT NULL
  AND data_hora_real_fim IS NOT NULL
  AND data_hora_real_fim < data_hora_inicio;

\echo '=== 6.2 treinamentos vencendo antes da conclusão ==='
SELECT count(*) AS invertidos
FROM trainings
WHERE data_conclusao IS NOT NULL AND data_vencimento IS NOT NULL
  AND data_vencimento < data_conclusao;

\echo '=== 6.3 registros criados no futuro (indício de fuso incorreto) ==='
SELECT 'aprs' AS tabela, count(*) AS futuros FROM aprs WHERE created_at > now() + interval '1 day'
UNION ALL SELECT 'pts', count(*) FROM pts WHERE created_at > now() + interval '1 day'
UNION ALL SELECT 'rdos', count(*) FROM rdos WHERE created_at > now() + interval '1 day';

-- =============================================================================
-- 7. ESTRUTURA — RLS e privilégios
-- =============================================================================

\echo '=== 7.1 tabelas multi-tenant com RLS incompleto (esperado: vazio) ==='
SELECT t.table_name AS tabela,
       c.relrowsecurity AS rls,
       c.relforcerowsecurity AS forced,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=t.table_name) AS policies
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
  AND c.relispartition = false
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public' AND col.table_name=t.table_name
                AND col.column_name IN ('company_id','empresa_id'))
  AND (c.relrowsecurity = false
       OR c.relforcerowsecurity = false
       OR (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname='public' AND p.tablename=t.table_name) = 0)
ORDER BY 1;

\echo '=== 7.2 papel de runtime possui BYPASSRLS? (esperado: f) ==='
SELECT rolname, rolbypassrls, rolsuper
FROM pg_roles
WHERE rolname IN ('sgs_app','sgs_rls_bypass','neondb_owner');

\echo '=== 7.3 chaves estrangeiras sem índice de cobertura ==='
SELECT con.conrelid::regclass::text AS tabela,
       a.attname AS coluna_fk,
       con.confrelid::regclass::text AS referencia
FROM pg_constraint con
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND array_length(con.conkey, 1) = 1
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = con.conrelid AND i.indkey[0] = con.conkey[1]
  )
ORDER BY 1, 2;

\echo '=== 7.4 pares de índices idênticos (duplicação pura) ==='
WITH idx AS (
  SELECT i.indrelid::regclass::text AS tabela,
         ic.relname AS nome,
         array_to_string(i.indkey::int2[], ',') AS cols,
         pg_get_expr(i.indpred, i.indrelid) AS pred
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = ic.relnamespace AND n.nspname = 'public'
)
SELECT a.tabela, a.nome AS indice_a, b.nome AS indice_b
FROM idx a
JOIN idx b ON a.tabela = b.tabela AND a.nome < b.nome
          AND a.cols = b.cols
          AND coalesce(a.pred,'') = coalesce(b.pred,'')
ORDER BY 1, 2;

-- =============================================================================
-- 8. OPERAÇÃO — saúde do banco
-- =============================================================================

\echo '=== 8.1 maiores tabelas (crescimento) ==='
SELECT s.relname AS tabela,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho,
       s.n_live_tup AS linhas_vivas,
       s.n_dead_tup AS linhas_mortas
FROM pg_stat_user_tables s
JOIN pg_class c ON c.oid = s.relid
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 15;

\echo '=== 8.2 tabelas com muitas linhas mortas (bloat / autovacuum insuficiente) ==='
SELECT relname AS tabela, n_live_tup, n_dead_tup,
       CASE WHEN n_live_tup > 0
            THEN round(100.0 * n_dead_tup / n_live_tup, 1)
            ELSE NULL END AS pct_mortas,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 15;

\echo '=== 8.3 índices nunca utilizados (candidatos a remoção) ==='
SELECT s.relname AS tabela, s.indexrelname AS indice,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamanho,
       s.idx_scan AS leituras
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 20;

\echo '=== 8.4 transações longas em aberto (risco de lock e bloat) ==='
SELECT pid, state,
       now() - xact_start AS duracao_transacao,
       left(query, 80) AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND now() - xact_start > interval '1 minute'
  AND pid <> pg_backend_pid()
ORDER BY xact_start;

\echo '=== 8.5 cache hit ratio (saudável acima de 0.99) ==='
SELECT round(sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0), 4) AS cache_hit_ratio
FROM pg_stat_database;

\echo '=== FIM DAS VERIFICACOES ==='
