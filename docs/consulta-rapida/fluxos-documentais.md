# Fluxos Documentais

## PDF final

O sistema vem migrando para um contrato explicito de disponibilidade, em vez de usar `404` como semantica normal.

A ideia atual e:

- informar explicitamente se existe PDF final
- diferenciar documento pronto de documento registrado sem signed URL
- manter mensagem e metadados no contrato

Observacao importante:

- PDF final oficial deve ficar no storage oficial
- nao deve existir fallback local tratado como documento final oficial
- para detalhes praticos, consulte `pdfs-finais-e-storage.md`

## Read-only e lock

Padrao esperado:

- documento fechado nao recebe edicao comum
- frontend mostra o estado visual
- backend valida e bloqueia a mutacao real

APR e um caso importante que ja foi endurecido de ponta a ponta.

## Registry documental

O registry funciona como trilha governada de documentos finais e artefatos documentais relevantes.

Quando investigar governanca documental, olhar:

- `backend/src/document-registry`
- `frontend/app/dashboard/document-registry`

## Importacao documental

O fluxo atual mais importante:

- upload entra na API
- operacao e enfileirada
- existe status consultavel
- retries sao controlados
- timeout e controlado
- falha final vai para estado previsivel, incluindo `DEAD_LETTER`
- idempotencia formal evita duplicidade por reenvio/retry/replay

Onde olhar:

- `backend/src/document-import`
- `frontend/services/documentImportService.ts`
- `frontend/app/dashboard/documentos/importar`

## Assinatura e aceite

O sistema distingue:

- aceite operacional
- assinatura verificavel server-side
- legado quando ainda existir compatibilidade

Em modulos mais endurecidos, o hash relevante nao deve vir arbitrariamente do cliente.

## Trilha forense

Eventos criticos relevantes entram em trilha append-only.

Use isso quando a pergunta for:

- quem anexou
- quem assinou
- quem removeu
- qual artefato foi usado
- quando a mudanca aconteceu

## Videos governados

Nesta rodada, video foi restringido a:

- DDS
- RDO
- Relatorio de Inspecao

Regras principais:

- upload governado
- metadados persistidos
- URL assinada ou fallback explicito `registered_without_signed_url`
- trilha de upload, acesso e remocao
- backend valida permissao e lock

Nao deve funcionar em:

- APR
- PT
- CAT
- Checklist
- Nao Conformidade
- outros modulos fora do recorte

## Email documental

Politica consolidada:

- priorizar documento final governado quando existir
- fallback local so quando explicitamente permitido
- fallback precisa ser rastreavel e auditavel
