# Checklist: Security and Observability

## Seguranca
- [ ] JWT access token curto
- [ ] refresh token seguro
- [ ] protecao contra brute force
- [ ] rate limiting por IP e por tenant
- [ ] DTO validation com `whitelist`
- [ ] `helmet` e headers de seguranca ativos
- [ ] CORS restritivo em producao
- [ ] uploads com validacao de tamanho e MIME
- [ ] auditoria para login, edicao, exclusao e download
- [ ] secrets apenas via ambiente

## Observabilidade
- [ ] `requestId` em todas as requests
- [ ] logs estruturados em producao
- [ ] latencia e erro por endpoint
- [ ] metricas de fila e banco
- [ ] tracing distribuido
- [ ] alertas para 5xx, p95 alto e fila travada
- [ ] eventos de negocio padronizados
- [ ] dashboards operacionais definidos

## Confiabilidade
- [ ] retries apenas para operacoes idempotentes
- [ ] circuit breaker para integracoes externas
- [ ] health checks de dependencias criticas
- [ ] strategy de graceful shutdown
