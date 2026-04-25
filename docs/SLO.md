# SLOs — Service Level Objectives

SGS Segurança — Referência para monitoramento e critérios de aprovação de deploy.

---

## Endpoints críticos (HTTP)

| Endpoint | p50 | p95 | p99 | Erro < |
|---|---|---|---|---|
| `POST /auth/login` | 200 ms | 500 ms | 1 000 ms | 1 % |
| `GET /auth/me` | 50 ms | 150 ms | 400 ms | 0,5 % |
| `GET /aprs` (listagem paginada) | 150 ms | 500 ms | 1 200 ms | 1 % |
| `POST /aprs` (criação) | 200 ms | 600 ms | 1 500 ms | 1 % |
| `GET /dashboard` (agregados) | 300 ms | 800 ms | 2 000 ms | 1 % |
| `GET /reports/jobs` (scan DLQ) | 100 ms | 400 ms | 1 000 ms | 1 % |

> Medidos no backend (OTEL spans). Exclui latência de rede cliente-Render.

---

## Geração de PDF

| Operação | p50 | p95 | p99 |
|---|---|---|---|
| PDF simples (≤ 5 páginas) | 2 s | 8 s | 20 s |
| PDF complexo (APR completa) | 5 s | 20 s | 45 s |

Timeout Puppeteer configurado: `setContent` 30 s, `page.pdf` 60 s.

---

## Filas BullMQ

| Fila | Tempo máx. em espera | Throughput mínimo |
|---|---|---|
| `mail` | 60 s | 10 jobs/min |
| `pdf-generation` | 5 min | 2 jobs/min |
| `document-import` | 10 min | 1 job/min |

---

## Banco de dados (Neon PostgreSQL)

| Métrica | Alvo |
|---|---|
| Query p95 (OLTP) | < 100 ms |
| Query p95 (agregação dashboard) | < 2 000 ms |
| Conexões ativas (steady state) | < 60 % do pool máximo |
| Pool max por instância | 6 (ver `DB_POOL_MAX`) |

---

## Disponibilidade

| Serviço | Alvo mensal |
|---|---|
| API (`sgs-backend-web`) | 99,5 % |
| Worker (`sgs-backend-worker`) | 99,0 % |
| Frontend | 99,9 % |

---

## Critérios de aprovação de deploy (go/no-go)

Um deploy pode ser promovido para produção quando, durante 15 minutos de tráfego real:

- [ ] Taxa de erro HTTP < 2 % (todos os endpoints)
- [ ] p95 de latência ≤ 1,5× os alvos acima
- [ ] Worker heartbeat presente no Redis (`worker:heartbeat:queue-runtime`)
- [ ] Zero erros `PDF_GENERATION_FAILED` em série (> 3 consecutivos = rollback)
- [ ] Nenhum alerta Sentry com severidade `fatal` disparado
- [ ] `GET /health/public` retorna 200 em ambas as instâncias web

### Critérios de rollback automático

Render realiza rollback automático se `preDeployCommand` falhar. Rollback manual deve ser
considerado se qualquer um dos critérios acima for violado por mais de 5 minutos após deploy.

---

## Referências

- Dashboard Prometheus: `http://localhost:9464/metrics` (web), `:9465` (worker)
- Sentry: configurar DSN em `sgs-backend-common` (ver `docs/PRODUCAO-PENDENCIAS.md`)
- BullMQ DLQ: endpoint `GET /reports/jobs` — máx 200 jobs por estado (`REPORTS_QUEUE_SCAN_MAX_PER_STATE`)
