## Contexto
Descreva o problema e a motivacao. Se houver incidente/bug em producao, inclua impacto e janela.

## Mudancas
- 

## Risco e Mitigacoes
- [ ] Multi-tenancy preservada (tenantId / RLS / header `x-company-id` quando aplicavel)
- [ ] Sem PII bruto enviado para terceiros (OpenAI etc) sem sanitizacao
- [ ] Backward-compatible (migracoes seguras; sem quebrar tenants existentes)

## Como Testar
1. 

## Checklist
- [ ] `backend` build + tests OK
- [ ] `frontend` build + tests OK
- [ ] Logs/observabilidade: eventos importantes tem tracking (Sentry/NewRelic/OTEL quando aplicavel)
- [ ] Sem segredos em diff (tokens/keys/URLs privadas)

