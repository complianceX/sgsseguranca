# 🔍 Observabilidade - Wanderson Gandra

## 1. ARQUITETURA DE OBSERVABILIDADE

```
┌─────────────────────────────────────────────────────────────┐
│                    Aplicação (NestJS)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Logs       │  │   Metrics    │  │   Traces     │      │
│  │  (Winston)   │  │ (Prometheus) │  │  (Jaeger)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Elasticsearch   │ │  Prometheus      │ │  Jaeger          │
│  (Log Storage)   │ │  (Metrics Store) │ │  (Trace Storage) │
└──────────────────┘ └──────────────────┘ └──────────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
                    ┌──────────────────┐
                    │   Grafana        │
                    │  (Visualization) │
                    └──────────────────┘
```

---

## 2. LOGS ESTRUTURADOS

### Formato
```json
{
  "timestamp": "2026-02-24T10:30:45.123Z",
  "level": "INFO",
  "requestId": "req-123-abc",
  "service": "wanderson-gandra-backend",
  "context": "ComplianceService",
  "message": "Security score calculated",
  "metadata": {
    "companyId": "company-123",
    "score": 85,
    "duration": 245
  }
}
```

### Níveis
- **ERROR:** Erros que precisam de ação
- **WARN:** Avisos de situações anormais
- **INFO:** Informações importantes
- **DEBUG:** Informações de debug (dev only)

### Implementação
```typescript
import { LoggerService } from './common/logger/logger.service';

constructor(private logger: LoggerService) {}

this.logger.log('Message', 'Context', { meta: 'data' });
this.logger.error('Error', trace, 'Context');
this.logger.warn('Warning', 'Context');
this.logger.debug('Debug', 'Context');
```

---

## 3. MÉTRICAS

### Métricas de Negócio
```
# PDFs gerados
pdfs_generated_total{company_id="company-123"} 1234

# Erros de PDF
pdfs_error_total{company_id="company-123",error_type="timeout"} 5

# Requisições da API
api_requests_total{method="GET",path="/api/users",status_code="200"} 5000

# Erros da API
api_errors_total{method="POST",path="/api/login",error_type="invalid_credentials"} 10
```

### Métricas de Infraestrutura
```
# Duração de queries
db_query_duration_ms{query_type="SELECT",success="true"} 45

# Conexões ativas
active_connections{connection_type="database"} 15

# Taxa de acerto do cache
cache_hit_ratio 0.85
```

### Implementação
```typescript
import { MetricsService } from './common/observability/metrics.service';

constructor(private metrics: MetricsService) {}

this.metrics.recordPdfGenerated(companyId, durationMs);
this.metrics.recordApiRequest(method, path, statusCode, durationMs);
this.metrics.recordDbQuery(query, durationMs, success);
```

---

## 4. TRACING DISTRIBUÍDO

### Exemplo de Trace
```
POST /api/compliance/generate-report
├── Validate Request (5ms)
├── Check Permissions (10ms)
├── Query Database (150ms)
│   ├── SELECT incidents (80ms)
│   ├── SELECT users (40ms)
│   └── SELECT audit_logs (30ms)
├── Generate PDF (500ms)
│   ├── Create Document (100ms)
│   ├── Add Charts (200ms)
│   └── Render (200ms)
├── Upload to S3 (200ms)
└── Return Response (5ms)
Total: 870ms
```

### Implementação
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('wanderson-gandra');

const span = tracer.startSpan('generateReport');
try {
  // Operação
  span.setAttributes({
    'company_id': companyId,
    'duration': durationMs,
  });
} finally {
  span.end();
}
```

---

## 5. ALERTAS

### Alertas Críticos
```yaml
# Taxa de erro > 1%
alert: HighErrorRate
expr: rate(api_errors_total[5m]) > 0.01
for: 5m
annotations:
  summary: "High error rate detected"
  action: "Check logs and incident playbook"

# Latência P95 > 1s
alert: HighLatency
expr: histogram_quantile(0.95, api_duration) > 1000
for: 5m
annotations:
  summary: "High API latency detected"
  action: "Check database performance"

# Uptime < 99%
alert: LowUptime
expr: up{job="api"} == 0
for: 1m
annotations:
  summary: "API is down"
  action: "Trigger incident response"
```

### Canais de Notificação
- Email
- Slack
- PagerDuty
- SMS (P1 only)

---

## 6. DASHBOARDS

### Dashboard Principal
- Uptime (últimas 24h)
- Taxa de erro (últimas 24h)
- Latência P95 (últimas 24h)
- Requisições/segundo
- Usuários ativos
- Espaço em disco

### Dashboard de Performance
- Latência por endpoint
- Taxa de erro por endpoint
- Duração de queries
- Conexões ativas
- Cache hit ratio
- Memória usada

### Dashboard de Negócio
- PDFs gerados
- Erros de PDF
- Usuários por empresa
- Incidentes de segurança
- Backup status
- Uptime por cliente

---

## 7. SETUP LOCAL

### Instalar Stack de Observabilidade
```bash
# Docker Compose com ELK + Prometheus + Jaeger
docker-compose -f docker-compose.observability.yml up -d

# Elasticsearch
curl http://localhost:9200

# Kibana (Logs)
http://localhost:5601

# Prometheus (Métricas)
http://localhost:9090

# Grafana (Dashboards)
http://localhost:3000

# Jaeger (Traces)
http://localhost:16686
```

### Configurar Aplicação
```bash
# .env
ELASTICSEARCH_HOST=localhost:9200
PROMETHEUS_PORT=9464
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

---

## 8. SETUP PRODUÇÃO

### AWS
```bash
# CloudWatch Logs
# CloudWatch Metrics
# X-Ray (Tracing)
# CloudWatch Dashboards
```

### Datadog
```bash
# Logs
# Metrics
# APM (Tracing)
# Dashboards
# Alertas
```

### Grafana Cloud
```bash
# Loki (Logs)
# Prometheus (Métricas)
# Tempo (Traces)
# Grafana (Dashboards)
```

---

## 9. BOAS PRÁTICAS

### Logs
- ✅ Use níveis apropriados
- ✅ Inclua request ID
- ✅ Inclua contexto relevante
- ✅ Não log dados sensíveis
- ❌ Não use console.log

### Métricas
- ✅ Use nomes descritivos
- ✅ Inclua labels relevantes
- ✅ Agregue dados
- ✅ Mantenha cardinalidade baixa
- ❌ Não crie métricas com alta cardinalidade

### Traces
- ✅ Trace operações críticas
- ✅ Inclua atributos relevantes
- ✅ Use sampling em produção
- ✅ Correlacione com logs
- ❌ Não trace tudo (performance)

---

## 10. TROUBLESHOOTING

### Logs não aparecem
```bash
# Verificar se Winston está configurado
docker-compose logs api | grep "OBSERVABILITY"

# Verificar se Elasticsearch está rodando
curl http://localhost:9200

# Verificar se Kibana consegue conectar
http://localhost:5601
```

### Métricas não aparecem
```bash
# Verificar se Prometheus está rodando
curl http://localhost:9090/api/v1/query?query=up

# Verificar se aplicação está expondo métricas
curl http://localhost:9464/metrics

# Verificar se Grafana consegue conectar
http://localhost:3000
```

### Traces não aparecem
```bash
# Verificar se Jaeger está rodando
curl http://localhost:16686/api/services

# Verificar se aplicação está enviando traces
docker-compose logs api | grep "OBSERVABILITY"

# Verificar se OpenTelemetry está inicializado
docker-compose logs api | grep "OpenTelemetry"
```

---

**Última atualização:** 2026-02-24
