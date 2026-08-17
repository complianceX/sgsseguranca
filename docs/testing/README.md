# Arquitetura de testes e evidências

## Objetivo

Separar código de teste, infraestrutura descartável e evidências emitidas. A
estrutura reduz o risco de executar um teste com configuração de produção e
torna cada resultado reproduzível por `run-id`.

## Mapa canônico

| Tipo | Local | Conteúdo | Versionado |
| --- | --- | --- | --- |
| E2E/integration backend | `backend/test/` | specs, setup e fixtures de teste | sim, sem secrets |
| E2E frontend | `frontend/e2e/` | Playwright e acessibilidade | sim |
| Operação de testes | `ops/test/` | Compose, k6 wrappers e storage smoke | sim |
| Documentação | `docs/testing/` | runbooks, critérios e evidências esperadas | sim |
| Evidência por execução | `artifacts/test-runs/<run-id>/` | logs redigidos, JSON e screenshots | não |
| Temporários locais | `tmp/`, `output/`, `coverage/` | PDFs, renders, relatórios e cobertura | não |

## Contrato de uma execução

Toda execução deve informar:

1. commit/SHA testado;
2. ambiente e URLs não sensíveis;
3. perfil e `run-id`;
4. massa sintética usada e quantidade de tenants;
5. comandos executados e resultado (`PASS`, `FAIL`, `INCOMPLETE` ou
   `NOT_RUN`);
6. evidência redigida e limpeza confirmada.

Não registrar cookies, tokens, senhas, chaves S3, CPF, conteúdo de documentos
reais ou URLs presigned completas. Para storage, registrar apenas status HTTP,
hash sintético/identificador redigido, magic bytes e resultado de isolamento.

## Critérios de segurança

- isolamento tenant/site deve ser provado no servidor, não apenas na UI;
- RLS, Redis, storage externo, restore e concorrência precisam de teste de
  runtime próprio;
- provider configurado ou credencial presente não é evidência funcional;
- uma execução local com MinIO não certifica automaticamente o provider de
  staging;
- falha de infraestrutura deve permanecer explícita como `INCOMPLETE` ou
  `BLOCKED`, nunca ser convertida em aprovação.

## Artefatos

Relatórios permanentes devem ser curados em `docs/audits/`. Saídas brutas,
PDFs, PNGs, dumps e logs ficam em `artifacts/test-runs/`, `tmp/` ou `output/`
e não devem ser commitados. Antes de compartilhar uma evidência, remover
segredos e dados pessoais.
