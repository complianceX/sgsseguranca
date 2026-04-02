# Enterprise Database Migration - Deployment Guide

**Version:** 1.0  
**Date:** April 2, 2026  
**Status:** Ready for Staging & Production  
**Migrations:** 9 total (1709000000086-1709000000094)  
**Estimated Duration:** 2-3 hours (with validation)  
**Rollback Risk:** LOW (all migrations are idempotent)

---

## ⚠️ Pre-Deployment Checklist

### Phase 0: Pre-Staging (Today)
- [ ] **Backup current database**
  ```bash
  # Using Supabase dashboard or CLI
  supabase db backup create --name "pre-enterprise-upgrade"
  ```

- [ ] **Review all 9 migration files** in `backend/src/database/migrations/`
  ```bash
  ls -la backend/src/database/migrations/1709000000086-*.ts
  ```

- [ ] **Verify build succeeds**
  ```bash
  cd backend && npm run build
  # Expected: exit code 0, no TypeScript errors
  ```

- [ ] **Get database connection details (Staging)**
  ```bash
  # From Supabase dashboard or environment
  # Need: DATABASE_URL for staging environment
  ```

### Phase 1: Staging Deployment (Day 1-2)

**Estimated Time:** 1.5 hours  
**Risk Level:** VERY LOW (you can rollback easily)  
**Environment:** Staging database with test data

#### Step 1a: Deploy migrations to staging
```bash
cd backend

# Set staging database URL
export DATABASE_URL="postgresql://user:pass@staging-db.com/sgs_staging"

# Run migrations
npm run migration:run

# Expected output:
#   ✅ 1709000000086 - EnterpriseRlsSecurityHardening
#   ✅ 1709000000087 - EnterprisePerformanceCompositeIndexes
#   ✅ 1709000000088 - EnterpriseDatawarehouseMatVews
#   ✅ 1709000000089 - EnterpriseDataIntegrityUpdatedAtTriggers
#   ✅ 1709000000090 - EnterpriseComplianceTtlCleanup
#   ✅ 1709000000091 - EnterpriseScalabilityAuditLogPartitioning
#   ✅ 1709000000092 - EnterpriseArchitectureSchemasSeparation
#   ✅ 1709000000093 - EnterpriseSearchFullTextSearch
#   ✅ 1709000000094 - EnterpriseValidationAndCompliance
```

#### Step 1b: Validate RLS isolation (CRITICAL)
```bash
# Login as User A (Company 1)
SELECT COUNT(*) FROM activities;  
-- Expected: > 0 records

# Login as User B (Company 2) 
SELECT COUNT(*) FROM activities;  
-- Expected: Different count than User A
-- If same count: RLS NOT WORKING! ⛔ Rollback immediately

# Test cross-company access (should FAIL)
SELECT COUNT(*) FROM activities 
WHERE company_id != current_company();
-- Expected: 0 rows (RLS blocks it)
```

#### Step 1c: Validate performance improvements
```bash
# Test dashboard view (should be <20ms)
EXPLAIN ANALYZE 
SELECT * FROM company_dashboard_metrics 
WHERE company_id = 'test-uuid';
-- Expected: execution time < 20ms

# Test risk ranking (should be <30ms)
EXPLAIN ANALYZE 
SELECT * FROM apr_risk_rankings 
WHERE company_id = 'test-uuid' 
ORDER BY risk_score DESC LIMIT 10;
-- Expected: execution time < 30ms
```

#### Step 1d: Validate index creation
```bash
-- Verify all 8 indexes exist
SELECT indexname, tablename FROM pg_indexes
WHERE indexname IN (
  'idx_audits_company_status',
  'idx_nonconformities_company_status_resolution',
  'idx_users_company_email',
  'idx_trainings_company_status_due',
  'idx_pts_company_status_inicio',
  'idx_checklists_company_created_status',
  'idx_audits_company_audit_date',
  'idx_aprs_company_risk_score'
)
ORDER BY tablename;
-- Expected: all 8 rows
```

#### Step 1e: Validate triggers
```bash
-- Verify triggers are active
SELECT trigger_name, event_object_table 
FROM information_schema.triggers
WHERE trigger_name LIKE 'trigger_%_updated_at'
ORDER BY event_object_table
LIMIT 10;
-- Expected: ~30+ trigger rows
```

#### Step 1f: Validate cleanup procedures
```bash
-- Test cleanup function
SELECT * FROM cleanup_expired_data();
-- Expected: result set with table counts (likely 0 if no old data)

-- Test GDPR function (with test user UUID)
SELECT * FROM gdpr_delete_user_data('00000000-0000-0000-0000-000000000001');
-- Expected: result set showing affected rows
```

#### Step 1g: Run application tests
```bash
# In staging environment
cd backend
npm run test

# Expected: all tests pass (or at min no new failures)
```

#### Step 1h: Validate schema separation
```bash
-- Verify 5 schemas exist
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('auth', 'operations', 'audit', 'documents', 'safety')
ORDER BY schema_name;
-- Expected: 5 rows

-- Verify backward compatibility views
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
LIMIT 10;
-- Expected: many rows (compatibility views)
```

#### Step 1i: Load test (optional but recommended)
```bash
# Using Apache JMeter or similar tool
# Compare performance metrics before/after
# - APR list query latency
# - Dashboard load time
# - Search query latency

# Expected: 30-50% improvement across queries
```

---

### Phase 2: Production Deployment (Day 2-3)

**Estimated Time:** 2 hours  
**Risk Level:** LOW (but requires maintenance window)  
**Environment:** Production database

#### ⛔ CRITICAL: Schedule maintenance window
- **Duration:** 2 hours minimum
- **Time:** Off-peak hours (e.g., 2 AM - 4 AM)
- **Announcement:** Notify users 24 hours in advance
- **Rollback Plan:** Have backup ready to restore

#### Pre-Production Checklist
- [ ] Full backup completed and verified
  ```bash
  supabase db backup create --name "pre-enterprise-upgrade-prod"
  # Verify backup exists in Supabase dashboard
  ```

- [ ] Staging deployment 100% validated
- [ ] Team approval obtained
- [ ] Rollback procedure documented and tested
- [ ] Monitoring/alerting configured

#### Step 2a: Stop application traffic
```bash
# Render.com dashboard or CLI
curl -X POST https://api.render.com/v1/services/{serviceId}/suspend \
  -H "Authorization: Bearer $RENDER_API_KEY"

# Or via dashboard: Services → Stop
# Wait for all requests to drain (~5 minutes)
```

#### Step 2b: Execute migrations
```bash
cd backend

# Use production database URL
export DATABASE_URL="postgresql://prod-user:prod-pass@prod-db.com/sgs_prod"

# Run migrations
npm run migration:run

# ⏱️ Monitor progress in Supabase dashboard
#   Watch: Slow log, connections, CPU usage
```

#### Step 2c: Validation (same as staging)
```bash
# Run all validation queries above
# Focus on RLS isolation (CRITICAL)
```

#### Step 2d: Applications health check
```bash
# Restart web servers
curl -X POST https://api.render.com/v1/services/{serviceId}/resume \
  -H "Authorization: Bearer $RENDER_API_KEY"

# Wait 2-3 minutes for startup
# Monitor error logs in Render dashboard

# Test critical endpoints
curl https://api.yourdomain.com/health
curl https://api.yourdomain.com/aprs?limit=10

# Expected: HTTP 200, <500ms response time
```

#### Step 2e: Smoke tests in production
```bash
# Login as different users
# Verify they see only their company's data
# Check dashboard loads quickly
# Test search functionality

# Monitor error rates
# Expected: error rate <= baseline (no increase)
```

---

## 🔄 Rollback Procedure

### If production migration fails:

**Step 1: Immediate action**
```bash
# Option A: Restore from backup (FASTEST)
supabase db restore --backup-id <backup_id>

# Option B: Rollback migrations (if partial failure)
export DATABASE_URL="<prod-url>"
npm run migration:revert
# This will run DOWN methods in reverse order
```

**Step 2: Verify rollback**
```bash
# Check database state
npm run migration:show
# Should show all migrations as NOT run

# Test application
curl https://api.yourdomain.com/health

# Restart applications
# Expected: system back to pre-migration state
```

**Step 3: Investigate failure**
```bash
# Check migration logs
cat backend/migration-logs.txt

# Check error logs
tail -f logs/production.log

# Document issue for re-deployment
```

---

## 📊 Post-Deployment Monitoring (2-7 days)

### Metrics to watch:

| Metric | Baseline | Expected | Alert if |
|--------|----------|----------|----------|
| API Response Time (p95) | 300ms | <200ms | >500ms |
| Error Rate | <0.1% | <0.1% | >0.5% |
| DB CPU Usage | 40% | 25% | >70% |
| Slow Queries (>1s) | 10/day | <5/day | >20/day |
| RLS Violations (audit log) | 0 | 0 | >0 |

### Daily checklist (Days 1-7):

- [ ] **Day 1 (post-deploy):** Check error logs, response times
- [ ] **Day 2:** Validate cost savings from partitioning
- [ ] **Day 3:** Review performance baseline vs. expectations
- [ ] **Day 4:** Check cleanup jobs running (if pg_cron enabled)
- [ ] **Day 5:** Validate RLS in realistic traffic
- [ ] **Day 6:** Review FTS search quality
- [ ] **Day 7:** Full health check, document improvements

### Enable monitoring queries:

```sql
-- Monitor slow queries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC 
LIMIT 10;

-- Monitor table sizes (check if partitioning worked)
SELECT 
  schemaname, 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

---

## 🆘 Troubleshooting

### Issue: RLS policy not working
**Symptom:** User sees data from other companies  
**Cause:** app.current_company not set in connection  
**Fix:**
```sql
-- In your connection string or at session start:
SET app.current_company = 'user-company-id';
-- Then run queries

-- Verify it's set:
SELECT current_setting('app.current_company');
```

### Issue: Materialized views are empty
**Symptom:** Dashboard returns 0 records  
**Cause:** Views need initial data  
**Fix:**
```sql
-- Manually refresh once
REFRESH MATERIALIZED VIEW company_dashboard_metrics;
REFRESH MATERIALIZED VIEW apr_risk_rankings;

-- Then scheduled refresh via pg_cron (if enabled)
```

### Issue: Performance didn't improve
**Symptom:** Queries still slow after indexing  
**Cause:** Query planner not using new indexes  
**Fix:**
```sql
-- Analyze table statistics
ANALYZE;

-- Force use of index in query
SELECT /*+ INDEX(aprs idx_aprs_company_risk_score) */ 
... 
FROM aprs WHERE company_id = ... ORDER BY probability * severity;
```

### Issue: Partitioning broke queries
**Symptom:** "partition not found" errors  
**Cause:** Application using old table names  
**Fix:**
```sql
-- Verify partitioned table exists
SELECT tablename FROM pg_tables 
WHERE tablename LIKE 'audit_logs%' 
ORDER BY tablename;

-- If partitions missing, check migration logs
-- Re-run migration if needed:
npm run migration:run -- -t 1709000000091
```

---

## 📚 Reference Links

- **Migration Folder:** `backend/src/database/migrations/`
  - 1709000000086 - RLS Security Hardening
  - 1709000000087 - Performance Composite Indexes
  - 1709000000088 - Dashboard Materialized Views
  - 1709000000089 - Data Integrity Triggers
  - 1709000000090 - Compliance & TTL Cleanup
  - 1709000000091 - Audit Log Partitioning
  - 1709000000092 - Schema Separation
  - 1709000000093 - Full-Text Search
  - 1709000000094 - Final Validation

- **Documentation:**
  - [Full Schema Documentation](./DATABASE_SCHEMA_COMPLETE.md)
  - [DDL Reference](./DATABASE_SCHEMA_DDL.sql)
  - [Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)
  - [Senior Audit Review](./DATABASE_AUDIT_SENIOR_REVIEW.md)

---

## ✅ Deployment Sign-Off

### Before Production Deployment

**Technical Lead (DBA):** ________________  
**Date:** ________________  

**Application Owner:** ________________  
**Date:** ________________  

**Security Officer:** ________________  
**Date:** ________________  

---

## 📞 Emergency Contacts

- **DBA on-call:** [phone/slack]
- **Render Support:** render.com/support
- **Supabase Support:** supabase.com/support
- **Incident Channel:** #outages (Slack)

---

**Status:** ✅ READY FOR DEPLOYMENT  
**Last Updated:** April 2, 2026  
**Next Review:** April 9, 2026
