-- ============================================================================
-- PARTICIONAMENTO: audit_logs por Data (Mensal)
-- ============================================================================
-- Benefícios:
--   ✅ Queries mais rápidas (index smaller partitions)
--   ✅ Limpeza de dados antigos (DROP PARTITION)
--   ✅ Manutenção paralela (REINDEX per partition)
--   ✅ Melhor I/O (dados quentes numa partição)
--
-- Executar com: psql -U postgres -d sst_db -f partition-audit-logs.sql

\echo '════════════════════════════════════════════════════════════════'
\echo 'PARTICIONAMENTO: audit_logs | Estratégia: Mensal'
\echo '════════════════════════════════════════════════════════════════'

-- Passo 1: Status ANTERIOR
\echo 'Passo 1: Status Anterior'

SELECT 
    'audit_logs' as table_name,
    COUNT(*) as "Total Rows",
    pg_size_pretty(pg_total_relation_size('audit_logs')) as "Total Size"
FROM audit_logs;

-- Passo 2: Criar nova tabela particionada
\echo ''
\echo 'Passo 2: Criar Nova Tabela Particionada'

-- CUIDADO: Em produção com dados, isso requer downtime!
-- Alternativa: pg_partman extension faz isso sem downtime

CREATE TABLE IF NOT EXISTS audit_logs_new (
    id UUID PRIMARY KEY,
    entity_type VARCHAR(255) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL,
    company_id UUID,
    timestamp TIMESTAMP NOT NULL,
    data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

\echo '✅ Tabela particionada criada'

-- Passo 3: Criar partições por mês
\echo ''
\echo 'Passo 3: Criar Partições Mensais'

-- Criar partições para últimos 12 meses
-- Jan 2025
CREATE TABLE IF NOT EXISTS audit_logs_2025_01 
PARTITION OF audit_logs_new
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Feb 2025
CREATE TABLE IF NOT EXISTS audit_logs_2025_02 
PARTITION OF audit_logs_new
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Mar 2025
CREATE TABLE IF NOT EXISTS audit_logs_2025_03 
PARTITION OF audit_logs_new
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Abr 2025
CREATE TABLE IF NOT EXISTS audit_logs_2025_04 
PARTITION OF audit_logs_new
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

-- E assim por diante...
-- Adicione mais conforme necessário

\echo '✅ Partições criadas (janeiro - abril 2025)'

-- Passo 4: Copiar dados da tabela antiga
\echo ''
\echo 'Passo 4: Migrar Dados (Pode demorar com tabela grande!)'

-- INSERT INTO audit_logs_new SELECT * FROM audit_logs;
-- Descomente acima para executar (não rodar em produção sem backup!)

\echo 'ℹ️  Descomente o INSERT acima para migrar dados'
\echo '⚠️  Requer downtime de escrita durante migração'

-- Passo 5: Recriar índices nas partições
\echo ''
\echo 'Passo 5: Criar Índices nas Partições'

CREATE INDEX idx_audit_logs_new_user_date_partition 
    ON audit_logs_new (user_id, timestamp DESC);

CREATE INDEX idx_audit_logs_new_company_date_partition 
    ON audit_logs_new (company_id, timestamp DESC)
    WHERE company_id IS NOT NULL;

CREATE INDEX idx_audit_logs_new_entity_partition 
    ON audit_logs_new (entity_type, entity_id, timestamp DESC);

\echo '✅ Índices criados'

-- Passo 6: Swap tabelas (ao final)
\echo ''
\echo 'Passo 6: Trocar Tabelas (Final)'

-- ALTER TABLE audit_logs RENAME TO audit_logs_old;
-- ALTER TABLE audit_logs_new RENAME TO audit_logs;

\echo 'ℹ️  Quando pronto, descomente acima para fazer swap'

-- Passo 7: Cleanup
\echo ''
\echo 'Passo 7: Cleanup de Tabela Antiga'

-- DROP TABLE IF EXISTS audit_logs_old;

\echo '════════════════════════════════════════════════════════════════'
\echo 'Benefícios Pós-Particionamento:'
\echo '════════════════════════════════════════════════════════════════'
\echo '✅ Queries mais rápidas (partition pruning)'
\echo '✅ Limpeza de dados antigos:'
\echo '   DROP TABLE audit_logs_2024_01;  -- Remove dados de jan/2024'
\echo '✅ Manutenção paralela (REINDEX cada partition)'
\echo '✅ Melhor performance em reads (índices menores)'
\echo ''
\echo 'Automação (PostgreSQL 11+):'
\echo '  - Use pg_partman extension para auto-create partições'
\echo '  - Use pgcron para limpeza automática'
\echo ''

-- EXEMPLO: Auto-criar próxima partição
-- SELECT create_parent('audit_logs_new'::regclass, 'created_at', 'range', 'monthly');
-- SELECT run_maintenance('audit_logs_new');
