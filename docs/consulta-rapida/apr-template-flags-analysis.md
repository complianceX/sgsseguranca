# APR — Análise dos flags `is_modelo` e `is_modelo_padrao`

Data da análise: 24/03/2026

## 1) Locais onde os flags são lidos/escritos

### Escrita (mutação)
- `backend/src/aprs/aprs.service.ts:1418-1420`
  - Se `is_modelo_padrao = true`, força `is_modelo = true` no create.
- `backend/src/aprs/aprs.service.ts:1443-1450`
  - Após create de modelo padrão, limpa `is_modelo_padrao` dos demais registros da empresa e marca o registro salvo como padrão.
- `backend/src/aprs/aprs.service.ts:1655-1656`
  - No update: `is_modelo_padrao = true` força `is_modelo = true`.
  - No update: `is_modelo = false` força `is_modelo_padrao = false`.
- `backend/src/aprs/aprs.service.ts:1756-1763`
  - Reaplica regra de “um único padrão por empresa” após update.
- `backend/src/aprs/aprs.service.ts:1927-1928`
  - Na nova versão (`createNewVersion`), copia `is_modelo` da origem e sempre seta `is_modelo_padrao = false`.

### Leitura (regras/comportamento)
- `backend/src/aprs/aprs.service.ts:188`
  - `is_modelo = true` bloqueia emissão de PDF final oficial.
- `backend/src/aprs/aprs.service.ts:1553-1554`
  - Retorna os dois flags na listagem paginada.
- `backend/src/aprs/aprs.service.ts:1582`
  - Filtro de listagem por `is_modelo_padrao`.
- `backend/src/aprs/aprs.controller.ts:112`
  - Exposição do filtro `is_modelo_padrao` via query param.
- `backend/src/dashboard/dashboard.service.ts:272,278,284`
  - Métricas de templates usam `is_modelo = true`.
- `backend/src/dashboard/dashboard-document-pendencies.service.ts:317,360,375,547,568,579`
  - Pendências documentais ignoram modelos (`is_modelo = false`).
- `backend/src/dashboard/dashboard-pending-queue.service.ts:132`
  - Fila operacional considera apenas APR operacional (`is_modelo = false`).
- `backend/src/dossiers/dossiers.service.ts:1448`
  - Dossiê considera APRs não-modelo (`is_modelo = false`).

### Contrato/API (DTO/Entity)
- `backend/src/aprs/entities/apr.entity.ts:63,66`
- `backend/src/aprs/dto/create-apr.dto.ts:48,52`
- `backend/src/aprs/dto/apr-response.dto.ts:223,226`
- `backend/src/aprs/dto/apr-list-item.dto.ts:30,33`

## 2) Diferença real de comportamento (semântica atual)

- `is_modelo`:
  - Indica que a APR é template/reutilizável.
  - Impacto operacional direto: modelos não seguem o fluxo de PDF final oficial.
- `is_modelo_padrao`:
  - Subconjunto de `is_modelo` com semântica de “template padrão da empresa”.
  - Regra vigente: no máximo um `is_modelo_padrao = true` por empresa.

Em termos de domínio atual:
- `is_modelo = false` e `is_modelo_padrao = false` => APR operacional.
- `is_modelo = true` e `is_modelo_padrao = false` => template da empresa.
- `is_modelo = true` e `is_modelo_padrao = true` => template padrão (sistema/empresa, conforme regra de produto vigente).
- `is_modelo = false` e `is_modelo_padrao = true` => combinação inconsistente (não deveria existir).

## 3) Verificação de combinações inconsistentes no banco

Consulta utilizada:

```sql
SELECT
  COUNT(*) FILTER (WHERE is_modelo = false AND is_modelo_padrao = false) AS none_count,
  COUNT(*) FILTER (WHERE is_modelo = true  AND is_modelo_padrao = false) AS company_template_count,
  COUNT(*) FILTER (WHERE is_modelo = true  AND is_modelo_padrao = true)  AS system_template_count,
  COUNT(*) FILTER (WHERE is_modelo = false AND is_modelo_padrao = true)  AS inconsistent_count,
  COUNT(*) AS total
FROM aprs
WHERE deleted_at IS NULL;
```

Resultado da tentativa local nesta máquina:
- conexão indisponível (`ECONNREFUSED 127.0.0.1:5433`);
- portanto, sem leitura do banco de execução neste ambiente local.

Checklist operacional para concluir a verificação em ambiente com banco acessível:
1. Executar a query acima.
2. Confirmar `inconsistent_count = 0`.
3. Se `inconsistent_count > 0`, corrigir dados antes de migrar para `template_type`.

