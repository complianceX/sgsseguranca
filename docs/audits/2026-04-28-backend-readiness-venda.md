# Auditoria critica do backend para venda - SGS

Data: 2026-04-28  
Escopo: `backend/`, blueprint Render, gates de build/test/seguranca e superficies admin/tenant/LGPD.

## Veredito

O backend esta em bom nivel tecnico para operacao controlada e piloto comercial: build, type-check, lint, testes CI, auditoria npm e migration check passaram. Para vender com mais seguranca, eu nao colocaria como "pronto enterprise" antes de corrigir os pontos P0/P1 abaixo.

O risco dominante nao e qualidade geral de codigo. O risco dominante e operacional/compliance: superficies admin sensiveis, verificacao RLS falhando no ambiente auditado, backup potencialmente sem criptografia obrigatoria e Redis compartilhado com politica que pode afetar filas/cache sob pressao.

## Gates executados

| Gate                                        | Resultado                       |
| ------------------------------------------- | ------------------------------- |
| `cd backend && npm run type-check`          | Passou                          |
| `cd backend && npm run build`               | Passou                          |
| `cd backend && npm run lint`                | Passou                          |
| `cd backend && npm run test:ci`             | Passou: 209 suites, 1483 testes |
| `cd backend && npm audit --omit=dev --json` | 0 vulnerabilidades de producao  |
| `cd backend && npm run ci:migration:check`  | Passou: 174 migrations          |
| `cd backend && npm run verify:rls:json`     | Falhou: 2 tabelas               |
| Render health web/worker/migrations         | Live, health 200 no ciclo atual |

## Achados criticos

### P0 - Restore/backup de tenant exige hardening antes de venda

Evidencias:

- `backend/src/disaster-recovery/tenant-backup.admin.controller.ts:43` expõe controller `admin` com `ADMIN_GERAL`.
- `backend/src/disaster-recovery/tenant-backup.admin.controller.ts:53` permite `POST /admin/tenants/:id/backup`.
- `backend/src/disaster-recovery/tenant-backup.admin.controller.ts:95` permite `POST /admin/tenants/:id/restore` com upload ate 200 MB.
- `backend/src/disaster-recovery/tenant-backup.service.ts:921` executa restore transacional.
- `backend/src/disaster-recovery/tenant-backup.service.ts:952` usa `SET LOCAL session_replication_role = replica`.

Risco:
Um token de `ADMIN_GERAL` comprometido consegue acionar uma operacao de alto impacto sobre tenant. O service tem confirmacoes importantes, mas para venda isso precisa de step-up, permissao explicita, auditoria forte e validacao de entrada mais estrita.

Correcao recomendada:

- Adicionar `@Authorize('can_manage_disaster_recovery')` ou permissao equivalente.
- Adicionar `SensitiveActionGuard` e `@SensitiveAction('tenant_restore')` no restore, e idealmente no backup.
- Usar `ParseUUIDPipe` em `:id`.
- Exigir motivo/auditoria do operador.
- Validar extensao, magic/decompression e limite anti-zip-bomb no upload.
- Rever fluxo assíncrono com arquivo em `tmpdir`: se worker estiver em outra instancia, o path local pode nao existir.

### P1 - Superficie `/admin/*` nao deve ficar fail-open em producao

Evidencias:

- Render web esta com `ipAllowList` aberto para `0.0.0.0/0`.
- `backend/src/common/middleware/admin-ip-allowlist.middleware.ts:22` documenta comportamento transparente quando a allowlist esta ausente.
- `backend/src/common/middleware/admin-ip-allowlist.middleware.ts:35` lê `ADMIN_IP_ALLOWLIST`.
- `backend/src/common/middleware/admin-ip-allowlist.middleware.ts:77` falha aberta em erro interno.
- `backend/src/app.module.ts:1620` aplica o middleware em `admin/*`.
- `backend/src/main.ts:170` monta Bull Board em `/admin/queues` com Basic Auth, mas sem allowlist obrigatoria no codigo.

Risco:
Mesmo com guards e Basic Auth, superficie administrativa sensivel fica exposta publicamente quando a env nao esta configurada ou quando o middleware falha. Para SaaS vendavel, admin deve ser fail-closed ou protegido por rede/WAF/Access.

Correcao recomendada:

- Tornar `ADMIN_IP_ALLOWLIST` obrigatoria em producao.
- Falhar fechado em erro de parsing/config do middleware.
- Aplicar protecao tambem ao Bull Board ou restringir no proxy/Render/Cloudflare.
- Registrar evidencia operacional de allowlist/WAF no runbook de venda.

### P1 - Gate RLS falha no ambiente auditado

Evidencias:

- `npm run verify:rls:json` retornou `status: fail`.
- Falhas em `privacy_request_events` e `privacy_requests`.
- Motivo reportado: policy tenant-aware com `USING + WITH CHECK + is_super_admin()` nao encontrada.
- As migrations dessas tabelas usam condicao `OR is_super_admin()`; o verificador espera a forma padronizada reconhecida pelo gate.

Risco:
Mesmo que a policy real ainda esteja isolando tenant, o gate oficial de RLS falhando impede afirmar readiness com seguranca. Em venda, esse tipo de falha vira risco de auditoria, deploy e regressao silenciosa.

Correcao recomendada:

- Padronizar as policies para a forma aceita pelo verificador, por migration nova, sem remover filtro de tenant.
- Alternativamente ajustar o verificador se a forma booleana atual for intencional, mas manter contrato unico.
- Rerodar `npm run verify:rls:json` como gate obrigatorio.

### P1 - Backup de tenant pode ficar sem criptografia obrigatoria

Evidencias:

- `backend/src/disaster-recovery/tenant-backup.service.ts:1590` só criptografa backup quando `TENANT_BACKUP_ENCRYPTION_KEY` existe.
- `backend/src/disaster-recovery/tenant-backup.service.ts:1593` retorna o payload sem criptografia quando a chave esta ausente.
- `render.yaml` nao evidencia `TENANT_BACKUP_ENCRYPTION_KEY`.

Risco:
Backup de tenant pode conter dados sensiveis de SST/LGPD. Gzip e checksum nao sao criptografia. Para comercializacao, backup deve ser criptografado por padrao e falhar fechado em producao se a chave nao existir.

Correcao recomendada:

- Exigir `TENANT_BACKUP_ENCRYPTION_KEY` em producao.
- Adicionar env secret ao blueprint/runbook.
- Testar restore criptografado.
- Documentar rotacao e custodia da chave.

### P2 - Redis compartilhado com `volatile_lru` precisa revisao antes de escala

Evidencias:

- Render Redis esta no plano starter com `maxmemoryPolicy: volatile_lru`.
- `render.yaml` usa `REDIS_URL` generico para varios usos.
- O proprio blueprint comenta o dilema entre nao evictar chaves sem TTL e proteger auth/rate limit.

Risco:
BullMQ, rate limit, blacklist, cache e sessoes nao tem o mesmo perfil de persistencia. Sob pressao, politica compartilhada pode gerar perda de cache/fila, comportamento intermitente e dificuldade de diagnostico.

Correcao recomendada:

- Separar Redis por funcao: auth/rate-limit, queue e cache.
- Queue Redis deve usar politica adequada para BullMQ, preferencialmente sem eviction.
- Configurar `REDIS_AUTH_URL`, `REDIS_QUEUE_URL`, `REDIS_CACHE_URL` quando aplicavel.
- Subir plano antes de campanhas comerciais.

### P2 - Evidencia operacional de secrets ainda precisa fechamento

Evidencias:

- Blueprint nao evidencia algumas chaves sensiveis: `ADMIN_IP_ALLOWLIST`, `ANTIVIRUS_PROVIDER`, `CLAMAV_HOST`, `BULL_BOARD_PASS`, `MFA_TOTP_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY`, `TENANT_BACKUP_ENCRYPTION_KEY`, `ALERTS_WEBHOOK_URL`.
- Existe servico ClamAV no Render, mas o binding efetivo por env deve ser confirmado no dashboard/CLI seguro.
- `npm run security:phase0:baseline` carregou `.env` local com `REFRESH_CSRF_ENFORCED=false` e `REFRESH_CSRF_REPORT_ONLY=true`; em `render.yaml` producao esta endurecida.

Risco:
O codigo tem controles importantes, mas venda exige evidencia operacional: segredo presente, enforcement ativo, alerta roteado e antivirus de fato conectado.

Correcao recomendada:

- Criar checklist de secrets por ambiente.
- Confirmar live env sem expor valores.
- Alinhar `.env.example`/`.env.audit` para nao induzir baseline local inseguro.

## Pontos fortes encontrados

- Guards globais de auth, tenant e contrato de autorizacao estao aplicados em `app.module.ts`.
- Headers HTTP, CORS, body limits, `ValidationPipe` e Swagger desabilitado em producao estao bem posicionados em `main.ts`.
- Sophie/OpenAI usa guard de consentimento, rate limit por usuario/tenant, sanitizacao de payload e circuit breaker.
- Fluxos principais de upload documental validam magic bytes e integram inspecao antivirus com falha fechada em producao.
- Suite automatizada do backend esta grande e verde no ciclo auditado.
- Deploy atual no Render ficou live e com health checks respondendo.

## Plano minimo antes de campanha comercial

1. Fechar P0/P1 de Disaster Recovery admin.
2. Tornar `/admin/*` fail-closed por allowlist/WAF em producao.
3. Corrigir o gate RLS e fazer ele passar no banco alvo.
4. Exigir criptografia de backup em producao.
5. Separar Redis ou, no minimo, definir plano/politica compatível com fila e auth.
6. Gerar evidencia operacional de secrets/controles por ambiente.

Depois desses itens, o backend fica muito mais defensavel para vender: nao apenas "funciona", mas tem controles verificaveis para tenant, LGPD e operacao.

## Remediação executada em 2026-04-28

Status após autorização para executar fase por fase:

| Item                               | Status                        | Evidência                                                               |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| DR admin com permissão explícita   | Corrigido                     | `TenantBackupAdminController` exige `can_manage_disaster_recovery`      |
| Backup/restore com step-up         | Corrigido                     | `tenant_backup` e `tenant_restore` usam `SensitiveActionGuard`          |
| Upload de restore `.json.gz`       | Corrigido                     | Validação de extensão e assinatura gzip antes do restore                |
| RLS `privacy_requests`             | Corrigido                     | Migration `1709000000166` padroniza `is_super_admin() = true`           |
| RLS `ai_interactions` particionada | Corrigido                     | Migration `1709000000167` aplica RLS/FORCE/policy no parent e partições |
| `/admin/*` fail-closed             | Corrigido em código/blueprint | `ADMIN_IP_ALLOWLIST_REQUIRED=true` e bloqueio quando allowlist ausente  |
| Backup criptografado obrigatório   | Corrigido em código/blueprint | `TENANT_BACKUP_ENCRYPTION_KEY` obrigatória em produção                  |
| Redis por criticidade              | Corrigido no blueprint        | `sgs-redis-auth`, `sgs-redis-cache`, `sgs-redis-queue`                  |
| Checklist operacional de secrets   | Criado                        | `docs/operations/backend-production-readiness-secrets.md`               |

Validação local após as correções:

- `npm run type-check`: passou.
- `npm run build`: passou.
- `npm run test -- src/disaster-recovery/tenant-backup.admin.controller.spec.ts src/common/middleware/admin-ip-allowlist.middleware.spec.ts`: passou, 7 testes.
- `npm run ci:migration:check`: passou, 176 migrations.
- `npm run verify:rls:json`: passou, 56 tabelas, 0 falhas.
