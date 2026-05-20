# ADR 007: Despesas - criptografia app-level faseada

## Status

Aceita em 2026-05-19.

## Contexto

O módulo de despesas persiste hoje, em claro:

- `expense_reports.notes`
- `expense_advances.description`
- `expense_items.description`
- `expense_items.vendor`
- `expense_items.location`
- `expense_items.receipt_original_name`
- `expense_items.receipt_mime_type`
- `expense_items.receipt_file_key`

Também persiste, em claro por desenho operacional:

- valores financeiros (`amount`, `total_advances`, `total_expenses`, `balance`)
- datas (`period_start`, `period_end`, `advance_date`, `expense_date`)
- categoria/status/ids relacionais

Uso observado na implementação atual:

- filtros/listagem do módulo usam `site_id`, `status`, `period_start`, `period_end` e ordenação por `created_at`
- exports Excel exibem `description`, `vendor`, `location` e `advance.description`
- detalhes do relatório carregam `items` e `advances` completos para UI
- comprovantes usam `receipt_file_key` para gerar signed URL

## Decisão

Não criptografar app-level o módulo de despesas nesta rodada.

## Justificativa

- `amount` e agregados financeiros precisam permanecer em claro para soma, fechamento e relatórios sem redesign adicional.
- `receipt_file_key` participa diretamente do acesso governado ao comprovante; cifrar agora exigiria adaptação cuidadosa do caminho de download e compensação de upload.
- `description`, `vendor`, `location`, `notes` e `advance.description` poderiam ser cifrados com padrão semelhante a `medical-exams`, mas isso exigiria:
  - migração/backfill para três tabelas
  - decrypt explícito em leitura para UI/export
  - revisão de compatibilidade em `findOne`, `findPaginated`, `close` e `exportReport`
- Como o módulo é recente e a superfície ainda está estabilizando por obra/site, o risco operacional de um hardening apressado supera o ganho imediato desta rodada.

## Threat model resumido

- risco principal: operador de infraestrutura ou leitura indevida do banco enxergar texto livre de despesas e metadados de comprovante
- mitigadores atuais:
  - isolamento por tenant via RLS
  - URLs assinadas para comprovantes
  - controle de acesso por obra e responsável no service
  - ausência de busca textual pública sobre esses campos
- lacuna remanescente:
  - texto livre e nomes de comprovantes continuam legíveis em repouso no banco

## Próximos passos recomendados

1. Fase 1: cifrar apenas texto livre sem impacto em cálculo:
   - `expense_reports.notes`
   - `expense_advances.description`
   - `expense_items.description`
   - `expense_items.vendor`
   - `expense_items.location`
2. Manter valores financeiros, datas, categoria e status em claro.
3. Avaliar separadamente se `receipt_original_name` deve virar metadata minimizada em vez de texto livre do usuário.
4. Antes da implementação:
   - adicionar transformers/helpers dedicados
   - preparar backfill idempotente
   - validar export Excel e fluxo de signed URL

## Consequência

O módulo permanece funcional e compatível em produção nesta rodada, com dívida de confidencialidade documentada e escopo de remediação explícito para a próxima fase.
