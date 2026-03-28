# Security Hardening Rollout

## Phase 0 Preflight
- Run route/flag inventory: `npm run security:phase0:baseline`
- Run logical backup dry-run: `npm run dr:backup:dry-run`
- Validate staging mirrors production env flags and origins
- Export current OpenAPI contract: `npm run openapi:export`

## Rollout Flags
- `PUBLIC_VALIDATION_LEGACY_COMPAT`
- `PUBLIC_VALIDATION_LOG_CONTRACT_USAGE`
- `REFRESH_CSRF_ENFORCED`
- `REFRESH_CSRF_REPORT_ONLY`
- `SECURITY_HARDENING_PHASE`

## Progressive Cutover
1. Deploy with `PUBLIC_VALIDATION_LEGACY_COMPAT=true` and log legacy usage.
2. Update clients to send validation token and `x-refresh-csrf`.
3. Observe logs/metrics for 24-72h.
4. Set `PUBLIC_VALIDATION_LEGACY_COMPAT=false`.
5. Set `REFRESH_CSRF_ENFORCED=true` after client adoption.

## Rollback
- Public validation rollback: set `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- Refresh CSRF rollback: set `REFRESH_CSRF_ENFORCED=false`, keep report-only on
- If queue issues appear, rollback worker image to previous version
- If migration issue appears, execute migration down and restore from latest backup if needed

## Validation Checklist
- Public validation endpoints (`/public/documents`, `/public/checklists`, `/public/inspections`, `/public/cats`, `/public/dossiers`) return minimal payload only
- Rate limit is active on public and auth-sensitive routes
- Refresh rejects invalid origin and mismatched CSRF when enforced
- Cross-tenant tests pass for service layer and workers
- Health endpoints expose liveness only
