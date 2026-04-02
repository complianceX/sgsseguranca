-- ============================================================================
-- CLEANUP: Remover Índices Nunca Usados (idx_scan = 0)
-- ============================================================================
-- CUIDADO: Executar SOMENTE após confirmar que índice não é usado
-- Data: 02/04/2026
-- Executar com: psql -U postgres -d sst_db -f cleanup-unused-indexes.sql

-- Passo 1: LISTAR índices candidatos para remoção (nunca foram scaneados)
\echo '════════════════════════════════════════════════════════════════'
\echo 'ANÁLISE: Índices Nunca Usados (Candidatos para Remoção)'
\echo '════════════════════════════════════════════════════════════════'

SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as "Scans",
    idx_tup_read as "Tuples Read",
    pg_size_pretty(pg_relation_size(indexrelid)) as "Size",
    created::date as "Created",
    CURRENT_DATE - created::date as "Age (days)"
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND created < (CURRENT_DATE - INTERVAL '30 days')  -- Não usado há 30+ dias
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''
\echo '⚠️  CUIDADO: Revisar acima ANTES de executar drops abaixo!'
\echo '════════════════════════════════════════════════════════════════'

-- Passo 2: REMOVER Índices Específicos (descomente conforme necessário)

-- Exemplo: Se idx_documents_search nunca foi usado:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_documents_search;
-- Razão: GIN index em full-text search nunca foi utilizado

-- Exemplo: Se idx_profiles_nome nunca foi usado (typo? nome errado?):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_nome;
-- Razão: Baixa seletividade, não vale o custo de manutenção

-- Exemplo: Se índices ligados a campos deletados:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_old_deprecated_field;

\echo ''
\echo 'Para remover um índice específico, descomente a linha acima'
\echo 'Exemplo: DROP INDEX CONCURRENTLY IF EXISTS idx_name;'
\echo ''

-- Passo 3: VALIDAR Que Removemos o Certo
\echo '════════════════════════════════════════════════════════════════'
\echo 'PÓS-LIMPEZA: Índices Restantes em Tabelas Críticas'
\echo '════════════════════════════════════════════════════════════════'

SELECT 
    tablename,
    COUNT(*) as "Total Indexes"
FROM pg_indexes
WHERE tablename IN ('aprs', 'documents', 'activities', 'audit_logs', 'users')
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo 'Esperado: Cada tabela crítica com >= 2 índices'
\echo ''

-- Passo 4: ESTATÍSTICAS PÓS-CLEANUP
\echo '════════════════════════════════════════════════════════════════'
\echo 'ESTATÍSTICAS: Espaço Economizado'
\echo '════════════════════════════════════════════════════════════════'

SELECT 
    'Total Index Space' as metric,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as value
FROM pg_stat_user_indexes;

SELECT
    'Average Index Size' as metric,
    pg_size_pretty(AVG(pg_relation_size(indexrelid)))::TEXT as value
FROM pg_stat_user_indexes
WHERE idx_scan > 0;

\echo ''
\echo '✅ Cleanup concluído'
\echo ''
\echo 'Próxima ação: ANALYZE para atualizar estatísticas'

ANALYZE;
