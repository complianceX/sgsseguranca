# Redis hardening e rollout

Este runbook cobre a ativação das correções de segurança, cache distribuído e
isolamento dos tiers Redis do SGS.

## Bloqueador atual

O endpoint de produção auditado aceita conexão plaintext na porta configurada e
recusa handshake TLS. O código novo falha fechado em produção quando Redis
remoto não usa TLS e valida `noeviction` nos tiers críticos.

Não promover esta mudança enquanto os endpoints TLS e as políticas abaixo não
estiverem prontos.

## Topologia esperada

| Tier | Variável | Política |
| --- | --- | --- |
| Auth | `REDIS_AUTH_URL` | `noeviction` |
| Rate limit/idempotência | `REDIS_RATE_LIMIT_URL` | `noeviction` |
| Cache | `REDIS_CACHE_URL` | `allkeys-lfu` ou `allkeys-lru` |
| BullMQ | `REDIS_QUEUE_URL` | `noeviction` |

Use URLs `rediss://` com certificado válido. Cada tier deve possuir credencial
ACL própria. `REDIS_FAIL_OPEN` e
`REDIS_ALLOW_IN_MEMORY_FALLBACK_IN_PROD` devem permanecer `false`.

Configure `SECURITY_AUDIT_HMAC_KEY` com um segredo exclusivo de pelo menos 32
caracteres tanto na web quanto no worker. Gere-o separadamente das chaves JWT e
de criptografia, por exemplo com `openssl rand -hex 32`.

Os registros idempotentes no tier Rate Limit têm controles adicionais:
`IDEMPOTENCY_TTL_SECONDS=3600`, `IDEMPOTENCY_MAX_RESPONSE_BYTES=65536` e
`IDEMPOTENCY_MAX_KEYS_PER_SCOPE=100`. Ajustes devem respeitar os limites
validados no bootstrap e a capacidade medida do tier `noeviction`.

O bootstrap executa `PING` e `INFO memory`; portanto, as ACLs dos tiers críticos
precisam permitir esses comandos além das operações de dados utilizadas por
Auth e Rate Limit. O usuário de Queue deve possuir as permissões exigidas pelo
BullMQ. Não conceder `CONFIG`, `FLUSHALL` ou `FLUSHDB` ao runtime.

## Pré-deploy

- [ ] Criar os quatro endpoints ou definir conscientemente os tiers que
      compartilharão uma instância `noeviction`.
- [ ] Confirmar handshake TLS de cada endpoint.
- [ ] Confirmar que URL e credencial separada resultam no mesmo usuário ACL
      esperado, sem fallback anônimo.
- [ ] Confirmar `maxmemory_policy` de Auth, Rate Limit e Queue.
- [ ] Validar credenciais com acesso somente ao endpoint correspondente.
- [ ] Registrar contagens agregadas de chaves e filas sem exportar payloads.
- [ ] Executar `npm run ai-recovery:sanitize:dry` e registrar apenas as
      contagens agregadas.
- [ ] Configurar `SECURITY_AUDIT_HMAC_KEY` na web e no worker.
- [ ] Confirmar CI verde, build e testes Redis.

## Migração

1. Implantar primeiro em staging usando os endpoints novos.
2. Iniciar Cache e Rate Limit vazios.
3. Para preservar sessões, migrar apenas chaves Auth com TTL remanescente.
4. Pausar produtores de jobs e aguardar `active=0`.
5. Parar o worker antigo.
6. Executar `npm run ai-recovery:sanitize:apply`; em seguida, repetir
   `npm run ai-recovery:sanitize:dry` e exigir `legacy=0`.
7. Migrar apenas chaves BullMQ válidas, preservando TTL e metadados.
8. Subir o worker novo e validar consumo, delayed e repeatable jobs.
9. Subir a web e validar login, refresh, MFA, dashboard e enfileiramento.
10. Comparar commit implantado com o `HEAD` da `main`.

Não copiar cache antigo, locks efêmeros, rate limits expirados ou falhas
históricas sem utilidade operacional.

## Critérios de aceite

- [ ] Web e worker iniciam sem fallback em memória.
- [ ] Logs mostram `tls=true` em todos os tiers.
- [ ] BullMQ não emite alerta de eviction policy.
- [ ] `/health` confirma Auth, Rate Limit, Cache, Cache Store e Queue.
- [ ] `/health/ready` retorna `200` somente com banco e quatro tiers saudáveis.
- [ ] O probe externo usa `/health/live` ou `/health/public`; o proxy restringe
      `/health/ready`. O cache/single-flight interno não substitui esse limite.
- [ ] Uma instância web grava cache e outra instância lê o mesmo valor.
- [ ] Login, refresh rotation, MFA e logout funcionam.
- [ ] Rate limiting permanece atômico e fail-closed.
- [ ] `ai-recovery` possui consumer, `legacy=0` no dry-run e não armazena
      pergunta/histórico no job.
- [ ] Dashboard revalidation executa com contexto tenant.
- [ ] Não há jobs ativos ou locks órfãos após o corte.

## Rollback

1. Parar web e worker novos.
2. Restaurar as quatro variáveis Redis anteriores.
3. Restaurar o SHA anterior no Coolify.
4. Reiniciar primeiro o worker e depois a web.
5. Validar filas, login e health.

O Redis anterior deve permanecer isolado e sem mutações após o corte até o fim
da janela de rollback. Credenciais antigas só devem ser revogadas depois da
validação final.
