# Backend production readiness - secrets e controles obrigatorios

Data: 2026-04-28

Este checklist existe para impedir venda/deploy com controle de seguranca invisivel ou ausente. Nao registrar valores de segredo neste arquivo.

## Obrigatorios antes de campanha comercial

| Variavel                           | Ambiente        | Motivo                                                         | Como validar sem expor segredo                   |
| ---------------------------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `ADMIN_IP_ALLOWLIST_REQUIRED=true` | web             | Faz `/admin/*` falhar fechado se a allowlist estiver ausente   | `render env get`/dashboard mostra chave presente |
| `ADMIN_IP_ALLOWLIST`               | web             | Restringe rotas administrativas por IP/CIDR confiavel          | Confirmar quantidade de entradas, nao o valor    |
| `BULL_BOARD_PASS`                  | web             | Protege `/admin/queues` com segredo dedicado                   | Confirmar preenchimento no dashboard             |
| `TENANT_BACKUP_ENCRYPTION_KEY`     | web/worker/cron | Criptografa backup de tenant em producao                       | Confirmar preenchimento e backup criptografado   |
| `REDIS_AUTH_URL`                   | web/worker      | Sessao, refresh, blacklist e brute-force em Redis sem eviction | Deve apontar para `sgs-redis-auth`               |
| `REDIS_CACHE_URL`                  | web/worker      | Cache/rate-limit em Redis evictable                            | Deve apontar para `sgs-redis-cache`              |
| `REDIS_QUEUE_URL`                  | web/worker      | BullMQ sem eviction                                            | Deve apontar para `sgs-redis-queue`              |
| `ANTIVIRUS_PROVIDER=clamav`        | web/worker      | Uploads governados falham fechado em producao                  | Health/log mostra provider ativo                 |
| `CLAMAV_HOST=sgs-clamav-internal`  | web/worker      | Liga runtime ao servico ClamAV privado                         | Confirmar DNS interno do Render                  |
| `CLAMAV_PORT=3310`                 | web/worker      | Porta ClamAV                                                   | Confirmar conexao em runtime                     |
| `MFA_TOTP_ENCRYPTION_KEY`          | web/worker      | Segredos TOTP em repouso                                       | AppModule bloqueia se ausente quando MFA ativo   |
| `FIELD_ENCRYPTION_KEY`             | web/worker      | CPF/dados medicos em repouso                                   | AppModule bloqueia se field encryption ativo     |
| `ALERTS_WEBHOOK_URL`               | web/worker      | Alertas operacionais reais                                     | Enviar alerta de teste                           |

## Redis por criticidade

O blueprint agora separa Redis em tres recursos:

- `sgs-redis-auth`: `noeviction`, para dados de seguranca.
- `sgs-redis-cache`: `allkeys-lru`, para cache e rate limit recalculavel.
- `sgs-redis-queue`: `noeviction`, para BullMQ.

`REDIS_URL` permanece como compatibilidade legada apontando para cache, mas producao deve ter `REDIS_AUTH_URL`, `REDIS_CACHE_URL` e `REDIS_QUEUE_URL`.

## Gates obrigatorios

Antes de vender ou fazer deploy comercial:

```bash
cd backend
npm run type-check
npm run build
npm run lint
npm run test:ci
npm run ci:migration:check
npm run verify:rls:json
```

O gate `verify:rls:json` deve retornar `status: "pass"` e `failuresCount: 0`.
