# Redis hardening e rollout

Este runbook cobre a ativação das correções de segurança, cache distribuído e
isolamento dos tiers Redis do SGS.

## Addendum 2026-08-21 — execução para a topologia atual (VPS Hostinger srv1870554)

O bloqueador original abaixo assumia TLS via `rediss://` como único caminho.
Revisado: `backend/src/shared/redis/redis-connection.util.ts:31`
(`assertSecureRedisConnection`) já prevê deliberadamente este cenário —
Redis na mesma rede Docker interna da VPS, tráfego que nunca sai da máquina —
e permite dispensar TLS via `REDIS_ALLOW_INSECURE_INTERNAL=true`, mantendo
senha obrigatória. O firewall (`docs/deploy/hostinger-coolify-infra-atual.md`)
confirma que a porta 6379 não está na allowlist do `ufw`, ou seja, não é
alcançável fora da VPS. TLS real entre os 4 containers exigiria também mudar
o código para aceitar uma CA própria (hoje só existe `rejectUnauthorized`),
o que é escopo novo e não faz parte deste rollout.

**Decisão:** separar os 4 tiers em containers próprios (resolve o problema de
fundo — hoje uma única instância `noeviction` global impede o Cache de
liberar memória sozinho) usando senha forte + `REDIS_ALLOW_INSECURE_INTERNAL=true`,
em vez de TLS certificado. Config em `ops/docker/redis/`.

### Passo a passo (executar na VPS via SSH, um app por vez)

1. `git pull` no clone da VPS (ou `scp -r ops/docker/redis root@179.198.107.5:/opt/sgs/`).
2. `cp ops/docker/redis/.env.example ops/docker/redis/.env` e gerar 4 senhas
   distintas com `openssl rand -base64 32`, uma por linha. Nunca reaproveitar
   a senha do `sgs-redis` atual.
3. `cd ops/docker/redis && docker compose -f docker-compose.redis.yml up -d`
   — sobe os 4 containers vazios na rede `coolify`, sem publicar porta no host.
4. Confirmar saúde: `docker exec sgs-redis-auth redis-cli -a "<senha>" --no-auth-warning ping`
   (repetir para os 4).
5. Migrar sessões ativas sem derrubar login: para cada chave `auth:*` do
   `sgs-redis` atual, usar `MIGRATE` (preserva TTL):
   ```
   redis-cli -a "<senha-antiga>" --no-auth-warning --scan --pattern 'auth:*' | \
     xargs -I{} redis-cli -a "<senha-antiga>" --no-auth-warning \
       MIGRATE sgs-redis-auth 6379 {} 0 5000 AUTH "<senha-nova>"
   ```
6. Parar o worker no Coolify (garante `active=0` nas filas BullMQ antes de mexer no Queue).
7. Rodar `npm run ai-recovery:sanitize:apply` ainda apontando para o
   `REDIS_QUEUE_URL` **antigo** e depois `ai-recovery:sanitize:dry` — exigir
   `legacy=0` antes de prosseguir.
8. Migrar as chaves BullMQ válidas (prefixo `bull:*`) do `sgs-redis` antigo
   para `sgs-redis-queue` com o mesmo padrão `MIGRATE` do passo 5.
9. No Coolify, atualizar as variáveis de ambiente da API **e** do Worker:
   - `REDIS_AUTH_URL=redis://:<senha>@sgs-redis-auth:6379`
   - `REDIS_RATE_LIMIT_URL=redis://:<senha>@sgs-redis-ratelimit:6379`
   - `REDIS_CACHE_URL=redis://:<senha>@sgs-redis-cache:6379`
   - `REDIS_QUEUE_URL=redis://:<senha>@sgs-redis-queue:6379`
   - `REDIS_ALLOW_INSECURE_INTERNAL=true`
   - `SECURITY_AUDIT_HMAC_KEY=<gerar com openssl rand -hex 32, mínimo 32 chars>`
10. Deploy do Worker primeiro; validar consumo de filas, delayed e repeatable
    jobs. Só então deploy da Web; validar login, refresh, MFA e dashboard.
11. Rodar `ai-recovery:sanitize:dry` de novo, agora contra o `sgs-redis-queue`
    novo — confirmar `legacy=0`.
12. Manter o `sgs-redis` antigo parado (não remover) até a janela de rollback
    fechar; só então `docker rm`/remover o volume.

### Item pendente separado — restringir `/health/ready` externamente

`/health/ready` é público hoje e faz probe pesado (banco + 4 Redis); `/health/live`
já é leve e público e serve como probe externo. Como o domínio já está atrás
do Cloudflare (proxy laranja), o bloqueio mais simples é uma **WAF Custom Rule**
no Cloudflare: expressão `(http.request.uri.path eq "/health/ready")` → Block.
Isso barra o acesso externo antes mesmo de chegar no Traefik, sem precisar
descobrir o CIDR interno do Docker. Confirmar antes, no painel do Coolify, se
o healthcheck interno do app usa `/health/ready` pela rede Docker (não pelo
domínio público) — se usar o domínio público, o bloqueio no Cloudflare também
quebraria o healthcheck do Coolify e precisa de outra rota.

## Bloqueador original (histórico)

O endpoint de produção auditado aceita conexão plaintext na porta configurada e
recusa handshake TLS. O código novo falha fechado em produção quando Redis
remoto não usa TLS e valida `noeviction` nos tiers críticos.

Não promover esta mudança enquanto os endpoints TLS e as políticas abaixo não
estiverem prontos — **ou** enquanto a topologia de containers separados do
addendum acima, com `REDIS_ALLOW_INSECURE_INTERNAL=true`, não estiver validada.

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
- [ ] Logs mostram `tls=true` em todos os tiers **ou**, na topologia do
      addendum 2026-08-21, `REDIS_ALLOW_INSECURE_INTERNAL=true` com senha
      obrigatória confirmada nos 4 tiers e porta 6379 fora da allowlist do
      firewall.
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
