-- ============================================================================
-- HIGH SCALE OPTIMIZATION: TENANT INDICES (RLS TUNING)
-- ============================================================================
-- Objective: Optimize multi-tenant queries by indexing company_id on all 
-- operational tables. This significantly speeds up RLS filtering and 
-- dashboard aggregation.
-- ============================================================================

-- EPIs
CREATE INDEX IF NOT EXISTS idx_epis_company ON epis(company_id);

-- Activities
CREATE INDEX IF NOT EXISTS idx_activities_company ON activities(company_id);

-- Machines
CREATE INDEX IF NOT EXISTS idx_machines_company ON machines(company_id);

-- Tools
CREATE INDEX IF NOT EXISTS idx_tools_company ON tools(company_id);

-- APR Risk Items (Heavy table)
CREATE INDEX IF NOT EXISTS idx_apr_risk_items_company ON apr_risk_items(apr_id); -- apr_id is the primary filter here

-- Inspections
CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_id);
CREATE INDEX IF NOT EXISTS idx_inspections_company_date ON inspections(company_id, data_inspecao DESC);

-- Checklists (Already has some, but ensuring consistency)
CREATE INDEX IF NOT EXISTS idx_checklists_company_date ON checklists(company_id, data DESC);

-- Audits
CREATE INDEX IF NOT EXISTS idx_audits_company ON audits(company_id);
CREATE INDEX IF NOT EXISTS idx_audits_company_date ON audits(company_id, data_auditoria DESC);

-- Signatures
CREATE INDEX IF NOT EXISTS idx_signatures_company ON signatures(company_id);

-- Monthly Snapshots (Critical for Dashboard History)
CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_company_month ON monthly_snapshots(company_id, month);

-- Forensic Trail (Security logs)
CREATE INDEX IF NOT EXISTS idx_forensic_trail_company ON forensic_trail_events(company_id);

-- ============================================================================
-- PERFORMANCE ANALYSIS: STATS REFRESH
-- ============================================================================
-- ANALYZE; -- Recommended after massive indexing to update Postgres planner stats.
