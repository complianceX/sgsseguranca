-- Performance Optimization Indexes
-- Run this migration to improve query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_company_status 
  ON users(company_id, status) 
  WHERE status = true;

CREATE INDEX IF NOT EXISTS idx_users_cpf_hash 
  ON users(cpf_hash);

CREATE INDEX IF NOT EXISTS idx_users_email 
  ON users(email);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_date 
  ON audit_logs(entity_type, entity_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date 
  ON audit_logs(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_date 
  ON audit_logs(company_id, timestamp DESC) 
  WHERE company_id IS NOT NULL;

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_active 
  ON user_sessions(user_id, is_active, expires_at) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash 
  ON user_sessions(token_hash) 
  WHERE is_active = true;

-- Security incidents indexes
CREATE INDEX IF NOT EXISTS idx_incidents_company_severity 
  ON security_incidents(company_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_status 
  ON security_incidents(status, created_at DESC);

-- Refresh tokens indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_revoked 
  ON refresh_tokens(user_id, revoked, expires_at) 
  WHERE revoked = false;

-- Companies indexes
CREATE INDEX IF NOT EXISTS idx_companies_cnpj 
  ON companies(cnpj);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_nome 
  ON profiles(nome);

-- Analyze tables for query planner
ANALYZE users;
ANALYZE audit_logs;
ANALYZE user_sessions;
ANALYZE security_incidents;
ANALYZE refresh_tokens;
ANALYZE companies;
ANALYZE profiles;
