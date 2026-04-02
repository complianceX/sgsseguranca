# Database Schema - Quick Reference Guide

**Generated:** April 2, 2026  
**Database:** PostgreSQL with TypeORM (SQLite compatible)  
**Total Tables:** 49+ entities  
**Multi-tenant:** Yes (company_id isolation + RLS)

---

## Core Table Reference

### Multi-Tenant Foundation
| Table | Purpose | Key Fields | Soft Delete |
|-------|---------|-----------|------------|
| `companies` | Main tenant | id, cnpj, razao_social, pt_approval_rules, alert_settings | YES |
| `sites` | Work locations | id, company_id, nome, cidade, estado | YES |
| `users` | Employees | id, company_id, nome, cpf, email, profile_id | YES |
| `profiles` | Access control | id, nome, permissoes, status | YES |

### RBAC Tables
| Table | Purpose |
|-------|---------|
| `roles` | Role definitions (Admin, TST, Supervisor, etc) |
| `permissions` | Permission definitions |
| `user_roles` | Bridge: user ↔ role (many-to-many) |
| `role_permissions` | Bridge: role ↔ permission (many-to-many) |
| `user_sessions` | Session tracking with IP/device |

### Safety Certifications
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `trainings` | NR certifications (NR-10, NR-35) | user_id, company_id, data_vencimento, bloqueia_operacao_quando_vencido |
| `medical_exams` | Occupational health | user_id, company_id, resultado (apto/inapto/restrito), data_vencimento |
| `epis` | PPE catalog | company_id, nome, ca, validade_ca |
| `epi_assignments` | PPE delivery records | user_id, epi_id, company_id, assinatura (digital) |

### Risk Management
| Table | Purpose | Key Fields | Notes |
|-------|---------|-----------|-------|
| `risks` | Risk register | company_id, categoria, probability, severity, residual_risk | Basic catalog |
| `risk_history` | Risk audit trail | risk_id, old_value, new_value | JSONB changes |
| `activities` | Job activities | company_id, nome | Risk context |
| `machines` | Equipment | company_id, nome, placa, horimetro_atual | |
| `tools` | Tools | company_id, nome, numero_serie | |

### Risk Analysis Procedures
| Table | Purpose | Status | Key Relations |
|-------|---------|--------|---------------|
| `aprs` | Preliminary Risk Analysis | Pendente/Aprovada/Cancelada/Encerrada | → sites, users (elaborador) |
| `apr_risk_items` | Risk detail rows | - | → aprs (CASCADE) |
| `apr_risk_evidences` | Photo/document proof | - | → apr_risk_items, file integrity |
| `apr_logs` | Audit trail | - | → aprs (CASCADE) |
| `apr_*` | Junctions (activities, risks, epis, tools, machines) | - | Many-to-many |

**APR Status Transitions:**
```
Pendente → Aprovada | Cancelada
Aprovada → Encerrada | Cancelada  
Cancelada → (terminal)
Encerrada → (terminal)
```

### Work Permits & Authorizations
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `pts` | Work Permit (Permissão de Trabalho) | company_id, site_id, apr_id, responsavel_id, data_hora_inicio/fim |
| `pt_executantes` | Workers assigned to PT | pt_id, user_id (junction) |

**PT Status:** Pendente, Aprovada, Cancelada, Encerrada, Expirada

### Daily Safety Documents
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `dds` | Daily Safety Dialogue | company_id, site_id, facilitador_id, data, tema |
| `dds_participants` | Attendance | dds_id, user_id (junction) |
| `rdos` | Daily Work Report | company_id, site_id, numero (unique), data |
| `rdo_audit_events` | RDO state changes | rdo_id, user_id, event_type, details (JSONB) |

### Inspections & Compliance
| Table | Purpose | Status |
|-------|---------|--------|
| `inspections` | Safety inspections | - |
| `checklists` | Equipment/area checklists | Conforme/Não Conforme/Pendente |
| `audits` | Internal/external audits | - |
| `nonconformities` | NC findings | - |
| `corrective_actions` | CAP (Action plans) | open/in_progress/done/overdue/cancelled |
| `cats` | Work accidents | aberta/investigacao/fechada |

### Documentation & Orders
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `contracts` | Service contracts | company_id, number, contractor_name, dates |
| `service_orders` | OS (work orders) | company_id, site_id, numero (unique), status |
| `reports` | Monthly reports | company_id, mes, ano, estatisticas (JSONB) |

### Document Management
| Table | Purpose | Key Fields | Notes |
|-------|---------|-----------|-------|
| `document_registry` | Registry metadata | company_id, module, entity_id, file_key | By week/ISO |
| `document_imports` | AI queue | empresa_id, hash (unique), textoExtraido, metadata | Idempotency key |
| `document_video_attachments` | Video evidence | company_id, module, document_id, storage_key | availability status |
| `signatures` | Digital signatures | user_id, document_id, signature_data, type | Timestamp verification |
| `pdf_integrity_records` | PDF tamper detection | hash (unique), company_id, signed_by_user_id | Legal evidence |

### Auditing & Security
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `audit_logs` | Action audit trail | userId, action, entity, timestamp, ip, companyId |
| `forensic_trail_events` | Immutable event stream | stream_key, stream_sequence (unique), event_hash (unique), company_id |
| `mail_logs` | Email delivery | company_id, user_id, to, subject, status |
| `push_subscriptions` | Push notification endpoints | userId, endpoint, keys (JSONB) |
| `notifications` | In-app notifications | userId, type, title, message, read flag |

### System & Analytics
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `monthly_snapshots` | Dashboard cache | site_id, company_id, month, risk_score, nc_count |
| `ai_interactions` | AI agent audit | tenant_id, user_id, question, response, token_usage, cost |
| `tenant_document_policies` | Document retention | company_id (unique), retention_days_apr/dds/pts |
| `disaster_recovery_executions` | DR/Backup log | operation_type, status, environment, artifact_path |

---

## Key Indexes

### Performance (Company-scoped queries)
```
IDX_aprs_company_created                - (company_id, created_at DESC)
IDX_pts_company_created                 - (company_id, created_at DESC)
IDX_trainings_company_created           - (company_id, created_at)
IDX_medical_exams_company_created       - (company_id, created_at)
IDX_dds_company_created                 - (company_id, created_at)

-- Recent records for dashboard
idx_aprs_company_updated_active         - (company_id, updated_at DESC) WHERE deleted_at IS NULL
idx_pts_company_updated_active          - (company_id, updated_at DESC)
idx_checklists_company_updated_active   - (company_id, updated_at DESC)

-- Status filtering (pending items)
idx_pts_company_status_active           - (company_id, status) WHERE deleted_at IS NULL
idx_nonconformities_company_status_active - (company_id, status)
```

### Full-Text Search (Trigram - fuzzy matching)
```
idx_users_nome_trgm                     - GIN trigram on nome
idx_users_cpf_trgm                      - GIN trigram on cpf
idx_companies_razao_social_trgm         - GIN trigram on razao_social
```

### Audit/Forensics
```
IDX_forensic_trail_events_company_module_entity_created
idx_audit_logs_user_date
idx_audit_logs_company_date
```

---

## RLS (Row Level Security)

### Restrictive Policies (Enforced on all roles)
**Tables:** document_registry, checklists, inspections, cats, signatures, apr_risk_evidences

```sql
USING (company_id = current_company() OR is_super_admin() = true)
```

### Tenant Isolation Policies
**Tables:** document_video_attachments, forensic_trail_events, pdf_integrity_records, monthly_snapshots

```sql
USING ((company_id)::text = (current_company())::text OR is_super_admin() = true)
```

---

## Common Query Patterns

### Get all APRs for a company (paginated, recent first)
```sql
SELECT * FROM aprs 
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;
-- Uses: IDX_aprs_company_updated_active
```

### Get pending APRs for a company
```sql
SELECT * FROM aprs 
WHERE company_id = $1 AND status = 'Pendente'
ORDER BY created_at DESC;
-- Uses: IDX_aprs_company_created
```

### Count non-conformities by status
```sql
SELECT status, COUNT(*) FROM nonconformities
WHERE company_id = $1 AND deleted_at IS NULL
GROUP BY status;
-- Uses: idx_nonconformities_company_status_active
```

### Find active trainings due for renewal
```sql
SELECT * FROM trainings
WHERE company_id = $1 AND data_vencimento <= NOW() + INTERVAL '30 days'
FROM company_id, created_at;
-- Uses: IDX_trainings_company_created
```

### Search users by name (fuzzy)
```sql
SELECT * FROM users
WHERE company_id = $1 AND nome % $2
ORDER BY SIMILARITY(nome, $2) DESC;
-- Uses: idx_users_nome_trgm
```

---

## Data Retention Policies

```
APRs (Approved):         7 years (2555 days) - configurable per tenant
DDSs:                    5 years (1825 days) - configurable per tenant
PTs:                     7 years (2555 days) - configurable per tenant
Medical Exams:           Por períododo ocupacional (depends on exam type)
Audit Logs:              Indefinite (forensic trail immutable)
Email Logs:              90 days (default, per alert_settings)
AI Interactions:         As per LGPD consent (ai_processing_consent)
```

---

## Status/Enum Fields

### APR Status
- **Pendente** - Awaiting approval
- **Aprovada** - Approved
- **Cancelada** - Cancelled
- **Encerrada** - Closed/Completed

### PT Status
- **Pendente** - Awaiting approval
- **Aprovada** - Approved/Active
- **Cancelada** - Cancelled
- **Encerrada** - Completed
- **Expirada** - Expired

### DDS Status
- **rascunho** - Draft
- **publicado** - Published
- **auditado** - Audited
- **arquivado** - Archived

### Checklist Status
- **Conforme** - Meets standard
- **Não Conforme** - Does not meet standard
- **Pendente** - Pending

### Medical Exam Resultado
- **apto** - Fit for work
- **inapto** - Not fit for work
- **apto_com_restricoes** - Fit with restrictions

### CAT Tipo
- **tipico** - Typical work incident
- **trajeto** - Commute incident
- **doenca_ocupacional** - Occupational disease
- **outros** - Other

### CAT Gravidade
- **leve** - Minor
- **moderada** - Moderate
- **grave** - Severe
- **fatal** - Fatal

### Corrective Action Status
- **open** - Opened
- **in_progress** - Being worked
- **done** - Completed
- **overdue** - Past due date
- **cancelled** - Cancelled

### Risk Level
- **Baixo** - Low
- **Médio** - Medium
- **Alto** - High
- **Crítico** - Critical

---

## Important Relationships

### Company → Everything
```
Companies (tenant)
├─ Users (+ Profiles, Roles)
├─ Sites
├─ APRs → PTs, APR Risk Items → Evidences, APR Logs
├─ Trainings
├─ Medical Exams
├─ EPI Assignments
├─ DDSs → Participants
├─ RDOs → RDO Audit Events
├─ Audits
├─ NonConformities → Corrective Actions (via source_id)
├─ CATs
├─ Checklists
├─ Inspections
├─ Service Orders
├─ Reports
└─ Document Registry
```

### APR → Related Records
```
APR
├─ APR Risk Items
│  └─ APR Risk Evidences (file integrity + GPS)
├─ APR Logs (audit trail)
├─ Cross-references:
│  ├─ Activities (many-to-many: apr_activities)
│  ├─ Risks (many-to-many: apr_risks)
│  ├─ EPIs (many-to-many: apr_epis)
│  ├─ Tools (many-to-many: apr_tools)
│  └─ Machines (many-to-many: apr_machines)
└─ PT (Permissão de Trabalho uses APR via apr_id)
```

---

## Special Features

### Digital Signatures
- Stored in `signatures` table
- Types: digital, upload, facial
- Verification: signature_hash + timestamp_authority
- GIS tracking: latitude/longitude in evidence records

### Multi-tenant Approval Rules (PT)
```json
{
  "blockCriticalRiskWithoutEvidence": true,
  "blockWorkerWithoutValidMedicalExam": true,
  "blockWorkerWithExpiredBlockingTraining": true,
  "requireAtLeastOneExecutante": false
}
```

### Alert Settings (Company-wide)
```json
{
  "enabled": true,
  "recipients": ["email@company.com"],
  "includeWhatsapp": false,
  "lookaheadDays": 30,
  "deliveryHour": 8,
  "cadenceDays": 1,
  "snoozeUntil": null
}
```

### Document Retention Policy
```json
{
  "retention_days_apr": 2555,      // 7 years
  "retention_days_dds": 1825,      // 5 years
  "retention_days_pts": 2555       // 7 years
}
```

### AI Processing Consent (LGPD)
- User flag: `ai_processing_consent` (boolean)
- If FALSE: AI responses not logged
- If TRUE: Question/response logged in `ai_interactions`

---

## Security Patterns

### Company Isolation
- **Column-level:** company_id on all tenant-scoped tables
- **RLS Policy:** USING (company_id = current_company())
- **Soft Delete:** deleted_at IS NULL in WHERE clauses

### File Integrity
- **Hash:** SHA256 hash_sha256 stored for all uploads
- **Watermarking:** Watermarked versions for sensitive PDFs
- **GPS Metadata:** Latitude/longitude in apr_risk_evidences
- **Device Tracking:** device_id, ip_address for audit trail

### Immutable Audit Trail
- **Forensic Trail:** forensic_trail_events (event_hash chain)
- **Event Hash:** SHA256 of current + previous_event_hash
- **Stream Key:** Logical partition for audit sequences
- **Unique Constraints:** stream_key + stream_sequence, event_hash

### RBAC Implementation
- **Legacy:** Profile + permissoes (JSONB array)
- **Modern:** User Roles → Roles → Permissions (many-to-many)
- **Coexistence:** Both patterns supported in codebase

---

## Performance Considerations

### Connection Pool
- Sized for 50 concurrent APR/s under load
- Index coverage critical for query performance
- `CREATE INDEX CONCURRENTLY` used for zero-downtime creation

### Soft Deletes
- All query filters include WHERE deleted_at IS NULL
- Indexes use partial indexes: WHERE deleted_at IS NULL
- Cleanup job removes old soft-deleted records (retention policy)

### JSONB Columns
- Flexible schema for approval_rules, alert_settings, metadata
- GiST/GIN indexes available for jsonb queries
- Used for one-off data without formal schema

### Pagination Pattern
```sql
-- Recommended: use (company_id, created_at DESC)
SELECT * FROM aprs 
WHERE company_id = $1 AND created_at < $2 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $3;
```

---

## Migration Best Practices

### Adding Columns
```sql
-- Safe for production: can be added without lock
ALTER TABLE table_name ADD COLUMN new_col TYPE;

-- For constraints, use CONCURRENTLY if possible:
CREATE INDEX CONCURRENTLY idx_name ON table(col);
```

### RLS Policies
- Always test with USING and WITH CHECK clauses
- Use `FORCE ROW LEVEL SECURITY` to prevent bypasses
- Test with app users, not just superusers

### Document Retention
- Run cleanup jobs weekly to respect 'expires_at'
- Consult `tenant_document_policies` per company
- Set 'litigation_hold' flag to prevent deletion

---

## Related Files

- [Full Schema Documentation](./DATABASE_SCHEMA_COMPLETE.md) - Detailed entity definitions
- [SQL DDL Reference](./DATABASE_SCHEMA_DDL.sql) - CREATE TABLE statements
- TypeORM Entity Files: `backend/src/*/entities/*.entity.ts`
- Migration Files: `backend/src/database/migrations/*.ts`

---

Generated from 49 TypeORM entity files and 92+ migration files.
