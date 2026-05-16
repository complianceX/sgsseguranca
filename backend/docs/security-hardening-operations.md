# Security Hardening — Operacao Unificada

## Objetivo
Documento unico para executar rollout seguro, monitorar, e aplicar rollback rapido do hardening de seguranca.

## Escopo de deploy
- Backend web (NestJS)
- Backend worker (BullMQ)
- Frontend (Next.js)
- Migrations (PostgreSQL / RLS gradual)

## Flags de rollout (baseline)
- `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- `PUBLIC_VALIDATION_LOG_CONTRACT_USAGE=true`
- `REFRESH_CSRF_REPORT_ONLY=true`
- `REFRESH_CSRF_ENFORCED=false`
- `SECURITY_HARDENING_PHASE=phase1`

## Comandos operacionais
- Baseline de seguranca:
  - `cd backend && npm run security:phase0:baseline`
- Backup:
  - `cd backend && npm run dr:backup:dry-run`
  - `cd backend && npm run dr:backup`
- Build/test backend:
  - `cd backend && npm run build`
  - `cd backend && npm run test -- <suite-alterada>`
- Build/test frontend:
  - `cd frontend && npm run test -- app/verify/page.test.tsx`
  - `cd frontend && npm run build`
- Migration:
  - `cd backend && npm run migration:run`
- Revert migration (rollback):
  - `cd backend && npm run migration:revert`

## Ordem oficial de corte
1. Deploy backend web
2. Deploy backend worker
3. Rodar migration
4. Deploy frontend

## Smoke pos-deploy (obrigatorio)
- Login / refresh / logout
- Validacao publica `code+token`:
  - `/public/documents/validate`
  - `/public/checklists/validate`
  - `/public/cats/validate`
  - `/public/dossiers/validate`
- Compat legado `code-only` (enquanto `PUBLIC_VALIDATION_LEGACY_COMPAT=true`)
- `/health/public` minimo
- `/health` sem detalhes internos

## Monitoramento (0–120 min)
- 401 em `/auth/refresh`
- 429 em rotas sensiveis
- erros de `document-import` e `pdf-generation`
- eventos:
  - `public_validation_legacy_contract`
  - `refresh_csrf_missing`
  - `refresh_csrf_mismatch`

## Gatilhos de rollback
- aumento anormal de 401 refresh
- validacao publica legitima quebrada
- impacto operacional severo em jobs/filas

## Rollback rapido
- `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- `REFRESH_CSRF_ENFORCED=false`
- manter `REFRESH_CSRF_REPORT_ONLY=true`
- rollback da release backend/worker
- se necessario, `migration:revert`

## D+1 / D+7 (corte progressivo)
- D+1: revisar incidentes + validar fluxo multi-tenant
- D+3+: ativar `REFRESH_CSRF_ENFORCED=true` quando aderencia frontend estiver estavel
- D+5 a D+7: desativar `PUBLIC_VALIDATION_LEGACY_COMPAT` quando uso legado for residual

## Referencias
- Runbook detalhado: `backend/docs/security-hardening-runbook-d1-dday-d1.md`
- War-room curto: `backend/docs/security-hardening-war-room-checklist.md`
- Template Jira/Linear: `backend/docs/security-hardening-ticket-template.md`
