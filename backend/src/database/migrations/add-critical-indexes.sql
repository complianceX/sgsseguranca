-- ============================================================================
-- ÍNDICES CRÍTICOS PARA ESCALABILIDADE (5000+ USUÁRIOS)
-- ============================================================================
-- Executar com: psql -U sst_user -d sst -f add-critical-indexes.sql
-- Tempo estimado: 5-10 minutos (dependendo do tamanho das tabelas)
-- ============================================================================

-- Desabilitar triggers durante criação (mais rápido)
SET session_replication_role = replica;

-- ============================================================================
-- DOCUMENTOS (CRÍTICO - 10k+/semana)
-- ============================================================================

-- Busca por data (relatórios, listagens)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at 
ON documents(created_at DESC) 
WHERE deleted_at IS NULL;

-- Busca por usuário (meus documentos)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id 
ON documents(user_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Busca por empresa (multi-tenant)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_company_id 
ON documents(company_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Busca por status (pendentes, aprovados, etc)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_status 
ON documents(status, created_at DESC) 
WHERE deleted_at IS NULL AND status != 'archived';

-- Busca por tipo de documento
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_type 
ON documents(type, created_at DESC) 
WHERE deleted_at IS NULL;

-- Busca combinada (empresa + status + data)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_company_status_date 
ON documents(company_id, status, created_at DESC) 
WHERE deleted_at IS NULL;

-- Full-text search em documentos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_search 
ON documents USING gin(to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(description, '')));

-- ============================================================================
-- USUÁRIOS (5000+)
-- ============================================================================

-- Login (email único)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique 
ON users(LOWER(email)) 
WHERE deleted_at IS NULL;

-- Busca por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_company_id 
ON users(company_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Busca por role (permissões)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role 
ON users(role) 
WHERE deleted_at IS NULL AND active = true;

-- Busca por status ativo
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active 
ON users(active, last_login_at DESC) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- EMPRESAS (MULTI-TENANT)
-- ============================================================================

-- Busca por CNPJ
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_cnpj 
ON companies(cnpj) 
WHERE deleted_at IS NULL;

-- Busca por status ativo
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_active 
ON companies(active) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- ATIVIDADES / LOGS (ALTO VOLUME)
-- ============================================================================

-- Busca por data (limpeza de logs antigos)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_created_at 
ON activities(created_at DESC);

-- Busca por usuário
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_user_id 
ON activities(user_id, created_at DESC);

-- Busca por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_company_id 
ON activities(company_id, created_at DESC);

-- Busca por tipo de ação
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_action 
ON activities(action, created_at DESC);

-- ============================================================================
-- TREINAMENTOS
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trainings_company_id 
ON trainings(company_id, created_at DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trainings_status 
ON trainings(status, scheduled_date) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- CHECKLISTS
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checklists_company_id 
ON checklists(company_id, created_at DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checklists_status 
ON checklists(status, due_date) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- MÁQUINAS / EQUIPAMENTOS
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machines_company_id 
ON machines(company_id) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machines_status 
ON machines(status) 
WHERE deleted_at IS NULL AND status = 'active';

-- ============================================================================
-- SITES / OBRAS
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sites_company_id 
ON sites(company_id) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sites_active 
ON sites(active) 
WHERE deleted_at IS NULL AND active = true;

-- ============================================================================
-- AUDITORIAS (COMPLIANCE)
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audits_company_id 
ON audits(company_id, audit_date DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audits_status 
ON audits(status, audit_date DESC) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- NOTIFICAÇÕES (ALTO VOLUME)
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id 
ON notifications(user_id, created_at DESC) 
WHERE read_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_read 
ON notifications(read_at) 
WHERE read_at IS NOT NULL;

-- ============================================================================
-- SESSÕES (REDIS BACKUP)
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_id 
ON sessions(user_id, expires_at DESC) 
WHERE expires_at > NOW();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires 
ON sessions(expires_at) 
WHERE expires_at > NOW();

-- ============================================================================
-- OTIMIZAÇÕES ADICIONAIS
-- ============================================================================

-- Atualizar estatísticas do PostgreSQL
ANALYZE;

-- Reabilitar triggers
SET session_replication_role = DEFAULT;

-- ============================================================================
-- VERIFICAR ÍNDICES CRIADOS
-- ============================================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_indexes
JOIN pg_class ON pg_indexes.indexname = pg_class.relname
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- ESTATÍSTICAS DE USO DOS ÍNDICES
-- ============================================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ============================================================================
-- FIM
-- ============================================================================
