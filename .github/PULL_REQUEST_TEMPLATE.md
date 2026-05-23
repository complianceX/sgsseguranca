## Contexto
Descreva o problema e a motivacao. Se houver incidente/bug em producao, inclua impacto e janela.

## Tipo de Mudanca
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] perf
- [ ] docs
- [ ] ci/infra

## Mudancas
- 

## Risco e Mitigacoes
- [ ] Multi-tenancy preservada (tenantId / RLS / header `x-company-id` quando aplicavel)
- [ ] Sem PII bruto enviado para terceiros (OpenAI etc) sem sanitizacao
- [ ] Backward-compatible (migracoes seguras; sem quebrar tenants existentes)

## Plano de Rollout / Rollback
- Rollout:
- Rollback:

## Evidencias
- [ ] Link de deploy Render (web/worker) quando aplicavel
- [ ] Link de deploy Vercel quando aplicavel
- [ ] Resultado de health checks (`/health/public`, `auth/csrf`, login)
- [ ] Logs/traces relevantes (requestId/traceId) quando houve incidente

## Como Testar
1. 

## Checklist
- [ ] `backend` build + tests OK
- [ ] `frontend` build + tests OK
- [ ] Logs/observabilidade: eventos importantes tem tracking (Sentry/NewRelic/OTEL quando aplicavel)
- [ ] Sem segredos em diff (tokens/keys/URLs privadas)
