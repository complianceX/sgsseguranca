-- ============================================================================
-- HOT PATH OPTIMIZATION: AUTH + USERS
-- ============================================================================
-- Objetivo:
--   Melhorar performance dos fluxos mais quentes sem alterar comportamento:
--   - login por CPF
--   - leitura de sessão autenticada (/auth/me)
--   - listagem paginada de usuários por tenant/site
--   - resolução de sessão persistida
--
-- Princípios:
--   - apenas índices aditivos e reversíveis
--   - zero mudança de regra de negócio
--   - foco em filtros e ordenações já usados pelo código atual
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) LOGIN / AUTH LOOKUP
-- ----------------------------------------------------------------------------
-- O login normaliza CPF e consulta users por cpf com deleted_at IS NULL.
-- Este índice ajuda a evitar scans em cenários com volume alto e soft delete.
CREATE INDEX IF NOT EXISTS idx_users_cpf_active
  ON users(cpf)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2) /auth/me E LEITURAS DE SESSÃO
-- ----------------------------------------------------------------------------
-- findAuthSessionUser / findOne / findOneWithPassword aplicam filtro por
-- company_id em cenários multi-tenant. Este índice auxilia lookup por escopo.
CREATE INDEX IF NOT EXISTS idx_users_company_id_id
  ON users(company_id, id);

-- ----------------------------------------------------------------------------
-- 3) LISTAGEM PAGINADA DE USUÁRIOS
-- ----------------------------------------------------------------------------
-- findPaginated filtra por company_id e, frequentemente, por site_id,
-- ordenando por nome ASC.
CREATE INDEX IF NOT EXISTS idx_users_company_site_nome
  ON users(company_id, site_id, nome);

-- Cenário sem site efetivo explícito, mas ainda filtrado por tenant.
CREATE INDEX IF NOT EXISTS idx_users_company_nome
  ON users(company_id, nome);

-- ----------------------------------------------------------------------------
-- 4) USER SESSIONS
-- ----------------------------------------------------------------------------
-- Refresh e fallback de sessão usam token_hash, is_active, expires_at e,
-- em alguns cenários, revoked_at.
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_active_not_revoked
  ON user_sessions(token_hash, expires_at)
  WHERE is_active = true AND revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- 5) PLANNER STATS
-- ----------------------------------------------------------------------------
ANALYZE users;
ANALYZE user_sessions;
