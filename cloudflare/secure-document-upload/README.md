# Upload seguro com Cloudflare R2 + Worker + Container ClamAV

## Decisao formal

- O estado autoritativo do upload fica no banco principal do sistema.
- O Worker nao usa D1 no caminho produtivo.
- O Worker conversa com o backend principal por endpoints internos autenticados por service token.

Motivo tecnico:

- evita duplicidade de estado entre edge e PostgreSQL/Supabase;
- reaproveita auditoria, trilha forense, multi-tenant e governanca documental ja existentes;
- elimina reconciliacao entre bancos diferentes para o mesmo documento.

## Fluxo

1. frontend pede um ticket ao backend principal;
2. frontend chama `POST /storage/presigned-url` no Worker com esse ticket;
3. Worker valida o ticket e registra a sessao no backend principal;
4. Worker gera PUT URL curta para `quarantine/{tenantId}/{uuid}.pdf`;
5. frontend faz PUT direto no R2 privado;
6. frontend chama `POST /storage/complete-upload`;
7. Worker baixa o arquivo de `quarantine/`, valida tamanho, `content-type` e magic bytes;
8. Worker chama o Container ClamAV;
9. se limpo, promove para `documents/{tenantId}/{uuid}.pdf` e confirma no backend principal;
10. se infectado, timeout ou scanner indisponivel, o arquivo fica em `quarantine/`.

## Contratos internos esperados no backend principal

- `POST /internal/storage/upload-sessions/issue`
- `POST /internal/storage/upload-sessions/:uploadId/uploaded`
- `POST /internal/storage/upload-sessions/:uploadId/scan-result`
- `POST /internal/storage/upload-sessions/:uploadId/promoted`
- `POST /internal/storage/upload-sessions/:uploadId/blocked`

Todos devem aceitar apenas chamadas de servico com:

- `Authorization: Bearer <BACKEND_INTERNAL_SERVICE_TOKEN>`
- ou `x-service-token`

## Cold start e assinaturas do ClamAV

Estrategia aplicada no container:

1. a imagem deve ser rebuildada diariamente com base atualizada;
2. no boot, o container roda `freshclam`;
3. o endpoint `/ready` so responde `200` quando:
   - existe base de assinaturas local;
   - a idade da base esta dentro da janela configurada;
   - `clamd` esta aceitando `INSTREAM`;
4. se a base estiver ausente ou velha demais, o container responde `503` e o Worker bloqueia a promocao.

Parametros operacionais recomendados:

- `CLAMAV_SIGNATURE_MAX_AGE_HOURS=24`
- keep-warm via cron de 5 em 5 minutos em `/ready`
- `sleepAfter` do Container maior que a janela de keep-warm

## Retries

### Permitidos

- PUT para `quarantine/`: retry do cliente enquanto a URL estiver valida
- `POST /storage/complete-upload`: idempotente
- Worker -> scanner:
  - 1 retry com backoff curto e jitter
  - apenas para timeout, reset de conexao ou `503`

### Nao permitidos

- arquivo infectado
- magic bytes invalido
- tamanho excedido
- `content-type` invalido

## Politica de falha

- scanner indisponivel => fail-closed
- threat detectada => fail-closed
- erro de promocao => arquivo permanece em `quarantine/`
- erro externo nao expoe stack nem detalhe bruto do scanner para o cliente

## Observabilidade minima

### Logs estruturados

- `uploadId`
- `tenantId`
- `userId`
- `quarantineKey`
- `documentKey`
- `sha256`
- `statusBefore`
- `statusAfter`
- `scannerResult`
- `scannerReasonInternal`
- `retryCount`
- `latencyMs`
- `traceId`

### Metricas

- `upload_presigned_issued_total`
- `upload_complete_total`
- `upload_scan_clean_total`
- `upload_scan_infected_total`
- `upload_scan_blocked_transient_total`
- `upload_scan_blocked_terminal_total`
- `upload_promoted_total`
- `scanner_unavailable_total`
- `scanner_latency_ms`
- `quarantine_objects_pending_scan`
- `clamav_signature_age_hours`

### Alertas

- scanner indisponivel por mais de 5 minutos
- idade de assinatura acima do limite
- crescimento anormal de `quarantine/`
- taxa de `blocked_transient` acima do baseline
- promocao falhando apos `scan=clean`

## Checklist de rollout

- bucket R2 privado criado
- prefixos `quarantine/` e `documents/` validados
- `BACKEND_INTERNAL_BASE_URL` configurado
- `BACKEND_INTERNAL_SERVICE_TOKEN` configurado
- `R2_*` configurado no Worker
- Container ClamAV com `/ready` e `/health`
- cron de keep-warm ativo
- dashboards e alertas configurados
- purge operacional de `quarantine/` infectado/bloqueado expirado
