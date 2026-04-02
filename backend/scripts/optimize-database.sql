-- ============================================================================
-- OTIMIZAÇÕES DE BANCO DE DADOS | 02/04/2026
-- ============================================================================
-- Executar com: psql -U postgres -d sst_db -f optimize-database.sql

\echo '=== FASE 1: ANÁLISE ATUAL ==='

-- Status: Índices totais
SELECT 
    'Total Indexes' as metric,
    COUNT(*)::TEXT as value
FROM pg_indexes 
WHERE schemaname = 'public';

-- Status: Índices não utilizados
SELECT 
    'Unused Indexes' as metric,
    COUNT(*)::TEXT as value
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- Status: Tabelas >= 10 MB
SELECT 
    'Large Tables (>10MB)' as metric,
    COUNT(*)::TEXT as value
FROM (
    SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables
    WHERE schemaname = 'public'
    AND pg_total_relation_size(schemaname||'.'||tablename) > 10485760  -- 10MB
) sub;

\echo ''
\echo '=== FASE 2: ATUALIZAR ESTATÍSTICAS ==='
\echo 'Running ANALYZE para otimizar query planner...'

ANALYZE;
ANALYZE audit_logs;
ANALYZE activities;
ANALYZE documents;
ANALYZE aprs;
ANALYZE checklists;
ANALYZE users;

\echo '✅ ANALYZE completado'

\echo ''
\echo '=== FASE 3: LIMPEZA DE ÍNDICES MORTOS ==='

-- Encontrar índices não usados (idx_scan = 0) após 30 dias
-- CUIDADO: Verificar manualmente antes de remover!
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND pg_stat_user_indexes.idx_blks_read > 0  -- Foi lido mas não escaneado?
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''
\echo 'CUIDADO: Os índices acima podem ser removidos se absolutamente não forem usados'
\echo 'Exemplo: DROP INDEX CONCURRENTLY idx_name;'

\echo ''
\echo '=== FASE 4: LIMPEZA DE BLOAT (Dead Tuples) ==='

-- Vacuum para remover linhas deletadas
VACUUM ANALYZE audit_logs;
VACUUM ANALYZE activities;
VACUUM ANALYZE documents;
VACUUM ANALYZE aprs;

\echo '✅ VACUUM completado'

\echo ''
\echo '=== FASE 5: VERIFICAR SAÚDE DOS ÍNDICES ==='

-- Índices que cresceram muito (possible bloat)
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as scans,
    CASE 
        WHEN idx_scan > 1000 THEN '✅ SAUDÁVEL'
        WHEN idx_scan > 100 THEN '🟡 MODERADO'
        WHEN idx_scan > 10 THEN '⚠️  BAIXO USO'
        ELSE '❌ NUNCA USADO'
    END as health
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

\echo ''
\echo '=== FASE 6: PERFORMANCE ATUAL ==='

-- Tamanho de tabelas e índices
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(
        pg_total_relation_size(schemaname||'.'||tablename) - 
        pg_relation_size(schemaname||'.'||tablename)
    ) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 15;

\echo ''
\echo '=== FASE 7: ESTATÍSTICAS DE CONEXÕES ==='

SELECT 
    datname as database,
    usename as user,
    application_name,
    state,
    COUNT(*) as connections
FROM pg_stat_activity
GROUP BY datname, usename, application_name, state
ORDER BY connections DESC;

\echo ''
\echo '=== FASE 8: VALIDANDO ÍNDICES CRÍTICOS ==='

-- Confirmar que tabelas críticas têm índices apropriados
WITH expected_indexes AS (
    VALUES
        ('aprs', 3),
        ('documents', 3),
        ('activities', 3),
        ('audit_logs', 2),
        ('users', 3),
        ('checklists', 2)
)
SELECT 
    ei.column1 as table_name,
    ei.column2 as expected_indexes,
    COUNT(i.indexname) as actual_indexes,
    CASE 
        WHEN COUNT(i.indexname) >= ei.column2 THEN '✅ OK'
        ELSE '❌ DEFICIT'
    END as status
FROM expected_indexes ei
LEFT JOIN pg_indexes i ON i.tablename = ei.column1
GROUP BY ei.column1, ei.column2
ORDER BY status DESC;

\echo ''
\echo '=== RESUMO FINAL ==='
\echo '✅ Análise de índices: completa'
\echo '✅ ANALYZE: executado'
\echo '✅ VACUUM: executado'
\echo '✅ Saúde de índices: verificada'
\echo '✅ Estatísticas de conexão: verificadas'
\echo ''
\echo 'Próximas Ações:'
\echo '1. Revisar índices não usados (phase 3)'
\echo '2. Se bloat > 50%, rodar: REINDEX DATABASE CONCURRENTLY'
\echo '3. Se tabelas >> 100MB, considerar particionamento'
\echo '4. Monitorar conexões abertas (current: ver phase 7)'
