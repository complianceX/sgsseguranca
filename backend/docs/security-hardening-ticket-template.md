# Template Jira/Linear — Security Hardening Rollout

## Metadados do ticket
- Tipo: Change / Security Hardening
- Owner:
- Revisor tecnico:
- Data/Hora da janela:
- Ambiente: Production (Railway)
- Servicos: Backend Web, Backend Worker, Frontend

## Objetivo
Executar hardening com rollout faseado, mantendo compatibilidade operacional e rollback imediato.

## Checklist D-1
- [ ] Flags de rollout aplicadas
- [ ] Baseline executado (`security:phase0:baseline`)
- [ ] Backup logico executado (`dr:backup`)
- [ ] Build/test backend verdes
- [ ] Build/test frontend verdes
- [ ] Janela aprovada

### Evidencias D-1
- Link log baseline:
- Link backup:
- Link build/test backend:
- Link build/test frontend:

## Plano D-Day (ordem)
1. Deploy backend web
2. Deploy backend worker
3. Rodar migration
4. Deploy frontend

### Evidencias D-Day
- Release backend web:
- Release backend worker:
- Migration output:
- Release frontend:

## Smoke test obrigatorio
- [ ] login OK
- [ ] refresh OK
- [ ] logout OK
- [ ] `/public/documents/validate` (`code+token`) OK
- [ ] `/public/checklists/validate` (`code+token`) OK
- [ ] `/public/cats/validate` (`code+token`) OK
- [ ] `/public/dossiers/validate` (`code+token`) OK
- [ ] legado `code-only` (se compat ativa) OK
- [ ] `/health/public` minimo
- [ ] `/health` sem detalhes internos

### Evidencias Smoke
- Links/prints:

## Monitoramento 0–120 min
- [ ] 401 em `/auth/refresh` dentro do normal
- [ ] 429 em rotas sensiveis sem impacto legitimo
- [ ] workers sem erro critico
- [ ] eventos `public_validation_legacy_contract` acompanhados
- [ ] eventos `refresh_csrf_missing`/`refresh_csrf_mismatch` acompanhados

### Evidencias Monitoramento
- Dashboard:
- Query/log:
- Observacoes:

## Criterios de rollback
- [ ] pico de 401 refresh
- [ ] validacao publica legitima quebrada
- [ ] incidente operacional severo em filas/jobs

## Plano de rollback (checklist rapido)
- [ ] `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- [ ] `REFRESH_CSRF_ENFORCED=false`
- [ ] manter `REFRESH_CSRF_REPORT_ONLY=true`
- [ ] rollback release backend/worker
- [ ] se necessario: `migration:revert`

### Evidencias Rollback (se aplicado)
- Horario:
- Acao:
- Resultado:

## D+1 / D+7
- [ ] Revisao de incidentes 24h
- [ ] Validacao multi-tenant e workers por tenant
- [ ] Ativar `REFRESH_CSRF_ENFORCED=true` quando aderencia estiver estavel
- [ ] Desativar `PUBLIC_VALIDATION_LEGACY_COMPAT` quando legado residual ~0

### Aceite final
- [ ] Sem regressao critica
- [ ] Sem leak de metadados em rotas publicas
- [ ] Fluxo refresh estavel com CSRF
- [ ] Zero sinais de cross-tenant em operacao
