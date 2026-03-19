# GST - Gestão de Segurança do Trabalho

Sistema SaaS para gestão de segurança do trabalho com frontend em Next.js e backend em NestJS.

## Estado real do projeto

- Deploy e migrations já seguem contrato determinístico para Railway.
- Frontend usa configuração explícita de ambiente e falha cedo sem URLs públicas válidas.
- Quality gate local/CI já executa lint, testes e build reais.
- Observabilidade atual:
  - logs HTTP e operacionais em JSON estruturado
  - métricas e tracing via OpenTelemetry **opcionais**, ativados somente com `OTEL_ENABLED=true`
  - exporter de métricas Prometheus em porta dedicada
  - tracing via Jaeger configurável por `JAEGER_ENDPOINT`
  - Sentry **opcional** e **não vem instalado por padrão**
- O projeto **não** deve ser tratado como “observabilidade completa pronta por default”. Sem configuração explícita, o runtime sobe com logging estruturado, mas sem exporter de traces/métricas.

## Arquitetura resumida

- `frontend/`: Next.js 15
- `backend/`: NestJS 11 + TypeORM + PostgreSQL + Redis + BullMQ
- `worker`: processo separado para filas pesadas, PDFs e jobs assíncronos
- `Railway`: web, worker e pre-deploy de migrations separados

## Observabilidade

### Logging

- O backend escreve logs estruturados em JSON no stdout/stderr.
- Logs de request/response, exceções HTTP e banco usam payload coerente e correlacionável.
- Quando existir span ativo de OpenTelemetry, `traceId` e `spanId` entram automaticamente no log.

Exemplo:

```json
{
  "timestamp": "2026-03-18T20:10:15.221Z",
  "level": "INFO",
  "service": "wanderson-gandra-backend",
  "context": "HTTP",
  "type": "REQUEST",
  "requestId": "req-123",
  "method": "GET",
  "url": "/health",
  "ip": "::1"
}
```

### Telemetry

- `OTEL_ENABLED=true`: ativa bootstrap real de OpenTelemetry antes do carregamento do Nest, permitindo auto-instrumentação coerente.
- Web: exporter Prometheus em `PROMETHEUS_PORT` ou `9464`.
- Worker: exporter Prometheus em `PROMETHEUS_PORT` ou `9465`.
- Traces: enviados para `JAEGER_ENDPOINT` quando OTEL está ativo.
- Se `OTEL_ENABLED` estiver desligado, o código de métricas continua inofensivo, mas não há exportação ativa.

### Sentry

- `SENTRY_DSN` habilita captura de exceções 5xx no filtro global.
- A dependência `@sentry/node` não faz parte do `package.json` atualmente.
- Se alguém configurar `SENTRY_DSN` sem instalar o pacote, o runtime registra status `unavailable` na inicialização e segue operando.

## Health checks

- `GET /health/public`: liveness leve do serviço web
- `GET /health`: prontidão do web, validando banco, Redis e política de migrations

## Execução local

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Worker

```bash
cd backend
npm run start:worker
```

## Deploy Railway

- `preDeploy`: migrations
- `web`: apenas API HTTP
- `worker`: apenas processamento assíncrono
- `healthcheckPath`: `/health/public`

## Documentação complementar

- [backend/README.md](backend/README.md)
- [backend/docs/OBSERVABILITY.md](backend/docs/OBSERVABILITY.md)
- [backend/docs/RUNBOOK_PRODUCTION.md](backend/docs/RUNBOOK_PRODUCTION.md)
