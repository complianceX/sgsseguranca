# ADR-004: Arquitetura de Jobs com BullMQ, Retentativa e DLQ
Status: Accepted | Date: 2026-03-24

## Contexto
O sistema executa processamento assíncrono crítico (PDF, importação documental, notificações, escalonamento SLA e retenção). Era necessário padronizar filas e observabilidade operacional.

## Decisão
Padronizamos BullMQ com módulos dedicados de worker e filas nomeadas:

- `mail`
- `pdf-generation`
- `document-import`
- `document-import-dlq`
- `sla-escalation`
- `expiry-notifications`
- `document-retention`

Princípios aplicados:
- retry com backoff exponencial em jobs críticos
- DLQ para análise e reprocesso controlado
- monitoramento via Bull Board (`/admin/queues`) e `QueueMonitorService`
- suporte a modo degradado com `REDIS_DISABLED` (providers no-op explícitos)

## Consequências (prós e contras)
Prós:
- Maior resiliência operacional em pico e falha parcial
- Visibilidade de backlog, falhas e jobs mortos
- Menor impacto de integrações lentas no tráfego síncrono

Contras:
- Maior complexidade de operação (fila, workers, runbook)
- Necessidade de housekeeping de backlog/DLQ
- Dependência de Redis para capacidade completa

## Alternativas consideradas
- Processamento síncrono em request-response
: rejeitado por latência e risco de timeout.
- Cron sem fila para tudo
: rejeitado por falta de controle de retry, visibilidade e isolamento.
- Única fila para todos os jobs
: rejeitado por contenção e baixa governança operacional.
