# Operations Runbook

## Objetivo

Runbook operacional para backup, restore e resposta a incidentes em produção.

## SLO, RTO e RPO

- `RTO` alvo: 60 minutos
- `RPO` alvo: 15 minutos
- Backup lógico diário + retenção mínima de 7 dias

## Pré-requisitos

- Variáveis configuradas:
  - `DATABASE_URL` (ou `DATABASE_HOST/PGHOST` etc.)
  - `URL_REDIS` (ou `REDIS_URL`)
  - `BACKUP_SECRET_KEY`
  - `REQUIRE_NO_PENDING_MIGRATIONS=true`
- Banco com migrations aplicadas.

## Checklist Diário

1. Verificar saúde da API:
`GET /health/live`
`GET /health/ready`
2. Confirmar último backup em `GET /compliance/backup-logs` (admin).
3. Verificar logs de erro e incidentes críticos das últimas 24h.

## Procedimento de Backup

1. Executar rotina de backup (cron/CI):
`backend/scripts/backup.sh`
2. Confirmar notificação de backup no endpoint:
`POST /compliance/backup-log` com header `x-backup-secret`.
3. Validar artefato gerado e tamanho final.

## Procedimento de Restore (Drill)

1. Criar banco de teste isolado (nunca restaurar direto em produção).
2. Restaurar backup:
`psql -d <db_restore_target> -f <backup.sql>`
3. Rodar migrations pendentes:
`npm run migration:run:safe`
4. Subir aplicação apontando para banco restaurado.
5. Validar:
`GET /health/ready` deve retornar `200`.
6. Registrar resultado do drill (tempo total e problemas).

## Rotina de Drill Mensal

1. Executar:
`npm run ops:dr:check -- --strict`
2. Rodar restore completo em ambiente de homologação.
3. Medir tempo de recuperação (RTO real).
4. Comparar perda máxima de dados (RPO real).
5. Abrir ação corretiva para qualquer desvio.

## Resposta a Incidentes (Sev1)

1. Conter:
   - bloquear mudanças e deploys
   - preservar evidências (logs/auditoria)
2. Diagnosticar:
   - verificar `health/ready`, banco, redis, fila, erro 5xx
3. Mitigar:
   - rollback de versão ou failover controlado
4. Recuperar:
   - restore parcial/total se necessário
5. Pós-incidente:
   - RCA em até 48h
   - plano de prevenção com prazo e responsável
