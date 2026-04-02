-- ============================================================================
-- VALIDAÇÃO E OTIMIZAÇÃO DE ÍNDICES | 02/04/2026
-- ============================================================================
-- Executar com: psql -U postgres -d sst_db -f validate-indexes.sql

-- ============================================================================
-- 1. AUDIT DE ÍNDICES - Quais estão sendo USADOS?
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as "Scans",
    idx_tup_read as "Tuples Read",
    idx_tup_fetch as "Tuples Fetched",
    pg_size_pretty(pg_relation_size(indexrelid)) as "Size",
    CASE 
        WHEN idx_scan = 0 THEN '❌ UNUSED'
        WHEN idx_scan < 100 THEN '⚠️  LOW USAGE'
        WHEN idx_scan >= 1000 THEN '✅ ACTIVE'
        ELSE '🟡 MODERATE'
    END as "Status"
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC, pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- 2. ÍNDICES POR TABELA - Cobertura Geral
-- ============================================================================
SELECT 
    t.tablename,
    COUNT(i.indexname) as "Index Count",
    pg_size_pretty(pg_total_relation_size(t.tablename::regclass)) as "Table Size",
    CASE 
        WHEN COUNT(i.indexname) > 0 THEN '✅ Indexed'
        ELSE '❌ No Indexes'
    END as "Status"
FROM pg_tables t
LEFT JOIN pg_indexes i ON t.tablename = i.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename
ORDER BY pg_total_relation_size(t.tablename::regclass) DESC;

-- ============================================================================
-- 3. TABELAS CRÍTICAS - Validar que têm índices
-- ============================================================================
-- Expected: Cada uma deve ter >= 2-3 índices
SELECT tablename, COUNT(*) as index_count
FROM pg_indexes
WHERE tablename IN ('aprs', 'documents', 'activities', 'audit_logs', 'users', 'checklists')
GROUP BY tablename
ORDER BY tablename;

-- ============================================================================
-- 4. ÍNDICES COM DUPLICAÇÃO OU SOBRECARGA
-- ============================================================================
-- Identifiquem índices que cobrem os mesmos campos
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 5. ÍNDICES BLOATADOS (> 30% waste)
-- ============================================================================
-- Requer extension pgstattuple (CREATE EXTENSION pgstattuple;)
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     round(100 * (pgstattuple(indexrelid)).dead_tuple_percent) as dead_percent
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND round(100 * (pgstattuple(indexrelid)).dead_tuple_percent) > 30
-- ORDER BY dead_percent DESC;

-- ============================================================================
-- 6. MISSING INDEXES - Queries que poderiam usar índices
-- ============================================================================
-- Informação: PostgreSQL sugere índices usados em seq scans frequentes
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
AND correlation < 0.1  -- Low correlation = high selectivity = good para índice
ORDER BY schemaname, tablename;

-- ============================================================================
-- 7. REINDEX - Script para reindexar tudo
-- ============================================================================
-- Descomente para executar:
-- REINDEX DATABASE sst_db CONCURRENTLY;

-- ============================================================================
-- 8. ANALYZE - Atualizar estatísticas do query planner
-- ============================================================================
-- Sempre executar após criar/dropar índices
ANALYZE;

-- ============================================================================
-- 9. CLEANUP - Remover índices NUNCA usados (cuidado!)
-- ============================================================================
-- CUIDADO: Execute apenas após confirmar idx_scan = 0
-- DROP INDEX IF EXISTS idx_name_unused;

-- ============================================================================
-- SUMÁRIO
-- ============================================================================
-- Total de Índices Criados:
SELECT COUNT(*) as "Total Indexes" FROM pg_indexes WHERE schemaname = 'public';

-- Total de Índices Ativos (scan >= 1):
SELECT COUNT(*) as "Active Indexes"
FROM pg_stat_user_indexes
WHERE idx_scan >= 1;

-- Total de Índices NÃO Usados:
SELECT COUNT(*) as "Unused Indexes"
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- Espaço Total em Índices:
SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) as "Total Index Size"
FROM pg_stat_user_indexes;
