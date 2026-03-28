# War-Room Checklist (Slack) — Security Hardening

## Antes do deploy
- [ ] Flags iniciais aplicadas (`LEGACY_COMPAT=true`, `CSRF_REPORT_ONLY=true`, `CSRF_ENFORCED=false`)
- [ ] Backup concluido
- [ ] Build/test backend e frontend verdes
- [ ] Janela e owners confirmados

## Ordem de corte
1. Deploy backend web
2. Deploy backend worker
3. Rodar migration
4. Deploy frontend

## Smoke rapido (10 min)
- [ ] login OK
- [ ] refresh OK
- [ ] logout OK
- [ ] `/public/*/validate` com `code+token` OK
- [ ] legado `code-only` ainda OK (fase de transicao)
- [ ] `/health/public` minimo e `/health` sem detalhes internos

## Monitoracao (primeiros 120 min)
- [ ] 401 em `/auth/refresh` dentro do normal
- [ ] 429 nao impactando usuario legitimo
- [ ] sem erros criticos em workers
- [ ] acompanhar `public_validation_legacy_contract`
- [ ] acompanhar `refresh_csrf_missing` / `refresh_csrf_mismatch`

## Gatilhos de rollback
- [ ] aumento brusco de 401 refresh
- [ ] validacao publica legitima quebrada
- [ ] impacto operacional grave em filas/jobs

## Rollback rapido
- [ ] `PUBLIC_VALIDATION_LEGACY_COMPAT=true`
- [ ] `REFRESH_CSRF_ENFORCED=false`
- [ ] rollback release backend/worker
- [ ] se preciso: `migration:revert`

## Pos-corte (D+1/D+7)
- [ ] revisar incidentes 24h
- [ ] ativar `REFRESH_CSRF_ENFORCED=true` quando aderencia 100%
- [ ] desativar legado quando uso residual ~0
