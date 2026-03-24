# Tenant Backup / Restore Strategy

## Scope
- This strategy is **tenant-scoped** (`company_id`) for multi-tenant recovery.
- It complements full-environment DR and avoids full database rollback for single-tenant incidents.
- Authoritative implementation lives in `backend/src/disaster-recovery`.

## What is backed up
- `companies` root record (tenant origin).
- All tables with `company_id`.
- Related records from non-company tables discovered by FK traversal.
- Soft-deleted rows are included.

## Sensitive data handling
- Export excludes:
  - `users.password`
  - `users.signature_pin_hash`
  - `users.signature_pin_salt`
  - refresh/session token tables
- Backup payload includes SHA-256 checksum.
- Optional at-rest encryption hook:
  - `TENANT_BACKUP_ENCRYPTION_KEY` (supports `base64:`, `hex:`, 64-char hex, or passphrase hash).

## Artifacts
- Path:
  - `TENANT_BACKUP_ROOT` (default: `output/disaster-recovery/tenant-backups`)
  - `<root>/<company_id>/<backup_id>.json.gz`
  - `<root>/<company_id>/<backup_id>.meta.json`
- Metadata includes:
  - `backupId`, `companyId`, timestamp, checksum, schema version, row counts.

## Retention policy
- Keep latest **30 daily** backups per tenant.
- Keep up to **12 monthly** backups (first day of month).
- Daily prune job removes excess artifacts.

## Scheduling
- BullMQ queue: `tenant-backup`.
- Daily full tenant cycle:
  - `0 3 * * *` -> backup all active tenants.
  - `30 3 * * *` -> prune retention.

## Admin endpoints (super admin)
- `POST /admin/tenants/:id/backup`
- `GET /admin/tenants/:id/backups`
- `POST /admin/tenants/:id/restore`
- `GET /admin/jobs/:job_id/status`

## Restore modes
- `overwrite_same_tenant` (dangerous)
  - Requires explicit confirmation:
    - `confirm_company_id` == target tenant id
    - `confirm_phrase` == `RESTORE <tenant_id>`
  - In production, blocked by default unless:
    - `DR_ALLOW_TENANT_OVERWRITE_IN_PRODUCTION=true`
- `clone_to_new_tenant`
  - Requires `target_company_id`.
  - Fails if target tenant already exists.

## Transaction and safety
- Restore runs in `SERIALIZABLE` transaction.
- Uses schema-aware insertion order by FK dependency graph.
- On failure, rollback is complete.
- Audit trail stored through disaster recovery execution logs.

## Operational validation after restore
1. Run tenant-critical list endpoints (`APRs`, `DDS`, `PT`, `trainings`, `medical-exams`).
2. Run document integrity scan (registry vs storage keys).
3. Validate random sample of governed artifacts download/signature verification.
4. Confirm no cross-tenant data leak.
5. Record execution ID and evidence in operational change log.

## External dependencies
- PostgreSQL (primary source of truth).
- Redis/BullMQ for queued backup/restore orchestration.
- Local/shared filesystem for backup artifacts.
- If running multiple instances, ensure shared backup volume path across workers.

## Responsibilities
- Platform/SRE:
  - maintain Redis queue availability and backup storage volume.
  - monitor failed jobs and execution logs.
- Security/Compliance:
  - manage encryption key lifecycle and rotation policy.
- Product operations:
  - execute approved restore runbook and post-restore validation checklist.
