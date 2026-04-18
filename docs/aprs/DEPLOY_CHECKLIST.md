# Deploy Checklist — Módulo APR

## PRÉ-DEPLOY

- [ ] Migrations testadas em ambiente de staging
- [ ] Feature flags novas verificadas (todas `enabled = false` por padrão)
- [ ] Testes e2e rodando e passando (`npm run test:e2e`)
- [ ] Backup do banco confirmado
- [ ] Versão anterior tagueada no Git (`git tag vX.Y.Z`)

---

## DEPLOY

- [ ] Rodar migrations (`typeorm migration:run`) — **nunca rollback automático em produção**
- [ ] Deploy do backend
- [ ] Deploy do frontend
- [ ] Smoke test:
  - Abrir APR existente
  - Salvar edição mínima
  - Verificar geração de PDF

---

## PÓS-DEPLOY

- [ ] Checar métricas de erro nas primeiras 2h (Sentry)
- [ ] Verificar `APR_STEP_ERROR` na tabela `apr_metrics`
- [ ] Se crítico: reverter via feature flag — **não via rollback de código**
  ```sql
  UPDATE apr_feature_flags SET enabled = false WHERE key = 'APR_<FUNCIONALIDADE>';
  ```

---

## ROLLBACK (apenas se não houver migration de dados)

- [ ] Desabilitar feature flag da funcionalidade problemática
- [ ] Reverter deploy para tag anterior (`git checkout vX.Y.Z`)
- [ ] **NÃO reverter migrations** — criar migration de correção em vez disso
- [ ] Registrar incidente no Sentry com referência à APR impactada

---

## Flags disponíveis (todas `disabled` por padrão)

| Key                       | Descrição                                          |
|---------------------------|----------------------------------------------------|
| `APR_WORKFLOW_CONFIGURAVEL` | Workflow de aprovação configurável por tenant    |
| `APR_RULES_ENGINE`         | Motor de regras para validações avançadas         |
| `APR_TEMPLATES_ENTERPRISE` | Templates enterprise reutilizáveis               |
| `APR_PDF_PREMIUM`          | Geração de PDF premium com layout avançado       |
| `APR_ANALYTICS`            | Dashboard de analytics do módulo APR             |
| `APR_IA_SUGGESTIONS`       | Sugestões de controle de risco via IA            |
