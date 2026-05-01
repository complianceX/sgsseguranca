# Observabilidade do Backend

## Estado atual

Esta é a situação operacional real do backend hoje:

- Logs estruturados em JSON: **ativos**
- Correlação por `requestId`: **ativa**
- Captura de exceções 5xx via Sentry: **opcional**
- New Relic APM (Node agent): **opcional, ativado apenas com `NEW_RELIC_ENABLED=true`**
- OpenTelemetry auto-instrumentado: **opcional, ativado apenas com `OTEL_ENABLED=true`**
- Exporter de métricas Prometheus: **opcional, ativado apenas com OTEL**
- Tracing via Jaeger: **opcional, ativado apenas com OTEL**

Sem `OTEL_ENABLED=true`, o sistema continua operando normalmente, mas não expõe exporter Prometheus nem envia traces.

## New Relic (APM)

### Como funciona

O backend já inclui o agente Node do New Relic e o carrega apenas quando `NEW_RELIC_ENABLED=true`.
O arquivo `backend/newrelic.js` precisa estar na raiz do pacote `backend` (ele já está).

### Variáveis

```bash
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=...
NEW_RELIC_APP_NAME=sgs-backend-web
```

## Logging

O backend usa logging estruturado no stdout/stderr. O formatter central normaliza:

- `timestamp`
- `level`
- `service`
- `context`
- `requestId` quando existir
- `companyId` e `userId` quando existirem no contexto da requisição
- `traceId` e `spanId` quando houver span ativo

Exemplo:

```json
{
  "timestamp": "2026-03-18T20:20:10.522Z",
  "level": "WARN",
  "service": "wanderson-gandra-backend",
  "context": "HTTP",
  "type": "HTTP_EXCEPTION",
  "statusCode": 404,
  "requestId": "req-abc",
  "method": "GET",
  "path": "/inspections/123/pdf",
  "responseTimeMs": 125,
  "message": "Relatório de inspeção 123 não possui PDF final armazenado"
}
```

## OpenTelemetry

### Como funciona

O bootstrap do web e do worker inicializa OTEL antes de carregar Nest/TypeORM/Express. Isso é necessário para auto-instrumentação coerente.

### Variáveis

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=wanderson-gandra-backend
OTEL_SERVICE_VERSION=1.0.0
JAEGER_ENDPOINT=http://localhost:14268/api/traces
PROMETHEUS_PORT=9464
```

### Portas padrão

- Web: `9464`
- Worker: `9465`

Se você definir a mesma `PROMETHEUS_PORT` para web e worker na mesma máquina, haverá conflito de porta.

## Sentry

### Variáveis

```bash
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Importante

- `@sentry/node` faz parte das dependências runtime do backend.
- Com `SENTRY_DSN` configurado, web e worker inicializam o SDK e passam a capturar exceções.
- Sem `SENTRY_DSN`, o runtime continua saudável e apenas mantém o Sentry desativado.

## Health endpoints

- `GET /health/public`: probe leve para liveness do web
- `GET /health`: probe de prontidão do web

O endpoint `/health` não depende do worker para declarar o web saudável.

## O que não está implementado por padrão

- Grafana provisionado automaticamente
- Prometheus/Jaeger/Grafana rodando por default no projeto
- ELK/Elasticsearch em produção
- dashboards “enterprise” prontos no runtime

Esses componentes podem ser integrados, mas não fazem parte do estado operacional padrão do código.

## Validação rápida

### Logs estruturados

```bash
cd backend
npm run start:prod
```

Verifique que os logs saem em JSON.

### Telemetry local

```bash
OTEL_ENABLED=true
PROMETHEUS_PORT=9464
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

Depois:

```bash
curl http://localhost:9464/metrics
```

Se o exporter estiver ativo, o endpoint responderá.
