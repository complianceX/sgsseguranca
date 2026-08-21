# Relatório de segurança das modificações atuais

Data da revisão e remediação: 27/07/2026
Escopo: diff local da branch `fix/redis-hardening`
Stack: TypeScript, NestJS 11/Express 5, Redis/ioredis, Keyv e BullMQ

## Resultado

Os oito achados confirmados na primeira varredura foram corrigidos no código:
**2 altos, 4 médios e 2 baixos**. A revisão final não deixou achado de código
aberto dentro deste escopo.

Isso não equivale a afirmar que produção já foi saneada. Status do rollout
(verificado em 2026-08-21 via API do Coolify, evidência redigida — nenhum
valor de segredo foi exibido):

1. ~~configurar `SECURITY_AUDIT_HMAC_KEY` na web e no worker~~ — **CONFIRMADO**:
   tentativa de criação via `POST /applications/{uuid}/envs` retornou `409
   Conflict` nos dois apps (`backend-web` e `backend-worker`), confirmando que
   a chave já existe em ambos. Nenhuma ação necessária; não rotacionado sem
   motivo para não invalidar pseudônimos já gravados.
2. ~~executar `ai-recovery:sanitize:dry`, `ai-recovery:sanitize:apply` e novo
   dry-run com `legacy=0` na fila real~~ — **CONFIRMADO** em 2026-08-21, via
   terminal do servidor no Coolify: `{"mode":"dry-run","queue":"ai-recovery",
   "inspected":0,"legacy":0,"sanitized":0}`. Fila vazia no momento da
   checagem; `:apply` não foi necessário.
3. restringir `/health/ready` no proxy e usar `/health/live` ou
   `/health/public` como probe externo — **pendente**, ver recomendação de
   regra WAF no Cloudflare em `docs/deploy/redis-hardening-rollout.md`.
4. cumprir o bloqueador de TLS/política de eviction descrito em
   `docs/deploy/redis-hardening-rollout.md` — **pendente**, ver addendum
   2026-08-21 no mesmo arquivo (topologia de 4 containers com
   `REDIS_ALLOW_INSECURE_INTERNAL=true`, config pronta em `ops/docker/redis/`).

## Evidências de validação

- Testes focados de Redis e remediações: **12 suítes, 96 testes aprovados**.
- Suíte completa: **278 suítes, 2.277 testes aprovados**.
- `npm run lint`: aprovado, zero warnings.
- `npm run type-check`: aprovado.
- `npm run build`: aprovado.
- `npm audit --omit=dev`: **0 vulnerabilidades**.
- Busca de segredos no diff: nenhum segredo real confirmado; somente fixtures
  e nomes de variáveis.

## Achados corrigidos

### SEC-001 — Falha pós-mutação podia permitir repetição

**Severidade original:** Alta
**Estado:** Corrigido

O fluxo agora diferencia erro do handler de erro ao persistir a resposta. Erro
da operação remove a chave e permite retry; erro posterior do Redis mantém o
marcador `processing`, devolve o resultado já produzido e adiciona
`X-Idempotency-Status: persistence-degraded`, sem induzir o cliente a repetir a
mutação.

Evidência:

- `backend/src/shared/idempotency/idempotency.interceptor.ts:260`
- `backend/src/shared/idempotency/idempotency.interceptor.ts:289`
- `backend/src/shared/idempotency/idempotency.interceptor.spec.ts`

### SEC-002 — Respostas idempotentes sem limite no tier `noeviction`

**Severidade original:** Alta
**Estado:** Corrigido por contenção estrita

O armazenamento passou a ter TTL padrão de uma hora, limite serializado de
64 KiB e quota de 100 chaves por tenant/usuário. Respostas acima do limite ou
não serializáveis não são copiadas; fica apenas o marcador de conclusão e uma
repetição recebe `409`, sem reexecutar a operação. Os limites são validados no
bootstrap e documentados para o rollout.

Evidência:

- `backend/src/shared/idempotency/idempotency.service.ts:36`
- `backend/src/shared/idempotency/idempotency.service.ts:118`
- `backend/src/shared/idempotency/idempotency.service.ts:165`
- `backend/src/app.module.ts:330`
- `backend/src/shared/idempotency/idempotency.service.spec.ts`

Risco residual aceito: o marcador continua no tier Rate Limit. A combinação de
TTL, quota e corpo limitado torna o consumo previsível, mas a capacidade do
tier deve continuar monitorada.

### SEC-003 — Chave não vinculada ao conteúdo da requisição

**Severidade original:** Média
**Estado:** Corrigido

Método, caminho, content type, query, parâmetros e corpo canônico agora formam
um SHA-256 armazenado no registro. A mesma chave com outro conteúdo recebe
`409 Conflict`. Uploads multipart/binários ficam fora do interceptor global.

Evidência:

- `backend/src/shared/idempotency/idempotency.interceptor.ts:107`
- `backend/src/shared/idempotency/idempotency.interceptor.ts:198`
- `backend/src/shared/idempotency/idempotency.interceptor.ts:205`

### SEC-004 — Readiness público amplificava carga nas dependências

**Severidade original:** Média
**Estado:** Corrigido no código; restrição de edge pendente no rollout

Chamadas concorrentes compartilham uma única sondagem. Resultados saudáveis
ficam em cache por 5 segundos e falhas por 1 segundo, evitando que cada request
dispare banco, quatro Redis e cache distribuído.

Evidência:

- `backend/src/modules/health/health.controller.ts:39`
- `backend/src/modules/health/health.controller.ts:225`
- `backend/src/modules/health/health.controller.spec.ts`

### SEC-005 — Jobs legados da Sophie podiam manter pergunta/histórico

**Severidade original:** Média, condicionalmente Alta
**Estado:** Corrigido no código; saneamento da fila real pendente

O worker aplica allowlist e chama `job.updateData()` antes de validar timestamp
ou UUID. Assim, até jobs inválidos e expirados perdem `question`, `history`,
`userId` e qualquer campo inesperado. O script operacional inspeciona
waiting/delayed/paused/completed/failed, é dry-run por padrão e só mostra
contagens.

Evidência:

- `backend/src/modules/ai/sst-agent/ai-recovery-job-data.ts:26`
- `backend/src/modules/ai/sst-agent/ai-recovery.processor.ts:27`
- `backend/scripts/sanitize-ai-recovery-jobs.ts:49`
- scripts npm `ai-recovery:sanitize:dry` e `ai-recovery:sanitize:apply`

### SEC-006 — Confiança direta no `X-Forwarded-For`

**Severidade original:** Média
**Estado:** Corrigido

O interceptor ignora o header bruto. Ele usa somente `request.ip`, já
normalizado pela configuração `trust proxy`, com validação `net.isIP()`, e
fallback também validado para `socket.remoteAddress`.

Evidência:

- `backend/src/shared/security/forbidden-spike.interceptor.ts:200`
- `backend/src/shared/security/forbidden-spike.interceptor.spec.ts`

### SEC-007 — SHA-256 sem chave permitia enumeração de IPv4

**Severidade original:** Baixa
**Estado:** Corrigido

Os pseudônimos usam HMAC-SHA-256 com domínio separado e segredo exclusivo. A
web e o worker falham no bootstrap de produção se
`SECURITY_AUDIT_HMAC_KEY` estiver ausente ou tiver menos de 32 caracteres.

Evidência:

- `backend/src/modules/auth/services/pdf-rate-limit.service.ts:34`
- `backend/src/modules/auth/services/pdf-rate-limit.service.ts:99`
- `backend/src/app.module.ts:345`
- `backend/src/worker.module.ts:205`
- `backend/src/app.module.production-env.spec.ts`

Os valores continuam sendo dados pessoais pseudonimizados, não dados anônimos;
retenção e acesso a logs permanecem sujeitos à LGPD.

### SEC-008 — Redis opcional permitia rate limit local acidental

**Severidade original:** Baixa
**Estado:** Corrigido

`SstRateLimitService` não usa mais `@Optional()` nem aceita cliente nulo. Uma
regressão no grafo de DI agora impede o bootstrap. Falhas de runtime continuam
fail-closed em produção; fallback local existe somente fora de produção.

Evidência:

- `backend/src/modules/ai/sst-agent/sst-rate-limit.service.ts:51`
- `backend/src/modules/ai/sst-agent/sst-rate-limit.service.spec.ts`

## Controles positivos preservados

- Isolamento tenant + usuário nas chaves idempotentes.
- Redis remoto em produção exige TLS e autenticação.
- Auth, Rate Limit e Queue exigem `noeviction`; Cache aceita política de cache.
- Locks distribuídos mantêm token aleatório e compare-and-delete.
- Recovery da Sophie mantém somente tenant, interação, timestamp e motivo.
- Mensagem externa de readiness continua genérica.
- Nenhum filtro de tenant foi removido e nenhuma migration de schema foi
  necessária nesta remediação.
