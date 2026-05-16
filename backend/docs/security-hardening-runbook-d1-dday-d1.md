# Runbook de Implantacao — Security Hardening

## Metadados
- Owner:
- Janela:
- Ambiente: Production (Railway)
- Servicos: Backend Web, Backend Worker, Frontend

## D-1 (Preparacao)
- [ ] Validar variaveis:
  - [ ] `VALIDATION_TOKEN_SECRET` (>=32 chars)
  - [ ] `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
  - [ ] `PUBLIC_VALIDATION_LOG_CONTRACT_USAGE=true`
  - [ ] `REFRESH_CSRF_REPORT_ONLY=true`
  - [ ] `REFRESH_CSRF_ENFORCED=false`
  - [ ] `SECURITY_HARDENING_PHASE=phase1`
- [ ] Inventario baseline:
  - [ ] `cd backend && npm run security:phase0:baseline`
  - Evidencia:
- [ ] Backup logico:
  - [ ] `cd backend && npm run dr:backup:dry-run`
  - [ ] `cd backend && npm run dr:backup`
  - Evidencia:
- [ ] Build/test backend:
  - [ ] `cd backend && npm run build`
  - [ ] `cd backend && npm run test -- <suite-alterada>`
  - Evidencia:
- [ ] Build/test frontend:
  - [ ] `cd frontend && npm run test -- app/verify/page.test.tsx`
  - [ ] `cd frontend && npm run build`
  - Evidencia:

## D-Day (Execucao)
- [ ] Deploy backend web (release/commit):
- [ ] Deploy backend worker (release/commit):
- [ ] Migration:
  - [ ] `cd backend && npm run migration:run`
  - Evidencia:
- [ ] Deploy frontend (release/commit):

## Smoke Test Obrigatorio
- [ ] Login OK
- [ ] Refresh OK
- [ ] Logout OK
- [ ] `/public/documents/validate` (`code+token`) OK
- [ ] `/public/checklists/validate` (`code+token`) OK
- [ ] `/public/cats/validate` (`code+token`) OK
- [ ] `/public/dossiers/validate` (`code+token`) OK
- [ ] Legado `code-only` ainda OK (com compat=true)
- [ ] `/health/public` minimo
- [ ] `/health` sem detalhes internos
- Evidencia:

## Monitoramento 0–120 min
- [ ] 401 em `/auth/refresh`
- [ ] 429 em rotas sensiveis
- [ ] erros em workers (`document-import`, `pdf-generation`)
- [ ] eventos `public_validation_legacy_contract`
- [ ] eventos `refresh_csrf_missing`/`refresh_csrf_mismatch`
- Dashboard/queries:
- Observacoes:

## Rollback Imediato (se trigger)
### Triggers
- [ ] aumento anormal de 401 refresh
- [ ] falha de validacao publica legitima
- [ ] falha relevante em worker/queue

### Acoes
- [ ] `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- [ ] `REFRESH_CSRF_ENFORCED=false`
- [ ] manter `REFRESH_CSRF_REPORT_ONLY=true`
- [ ] rollback release backend/worker anterior
- [ ] se necessario: `cd backend && npm run migration:revert`
- Evidencia/horario:

## D+1
- [ ] Revisar incidentes das ultimas 24h
- [ ] Validar fluxo multi-tenant e jobs por tenant
- [ ] Atualizar `SECURITY_HARDENING_PHASE=phase2`
- Evidencia:

## D+3 a D+7 (Corte Progressivo)
- [ ] Confirmar frontend enviando `x-refresh-csrf` em 100%
- [ ] Ativar `REFRESH_CSRF_ENFORCED=true` (quando pronto)
- [ ] Rodar smoke completo
- [ ] Medir uso legado por `public_validation_legacy_contract`
- [ ] Desativar `PUBLIC_VALIDATION_LEGACY_COMPAT` quando residual ~0
- [ ] Rodar smoke completo novamente

## Criterio de aceite final
- [ ] Sem regressao funcional critica
- [ ] Sem leak de metadados em rotas publicas
- [ ] Refresh enforced estavel
- [ ] Uso legado residual controlado
- [ ] Sem evidencia de cross-tenant em validacoes operacionais
