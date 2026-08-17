# Ambiente de testes isolado

Este diretório concentra a operação do ambiente de testes local/isolado. Ele
não é usado por produção e não deve receber credenciais, dados pessoais ou
artefatos gerados de uma execução.

## Estrutura

- `compose/`: PostgreSQL, Redis, ClamAV e overrides de storage para E2E.
- `load/`: wrappers e cenários k6 operacionais; a implementação específica do
  backend permanece em `backend/test/load/`.
- `storage/`: bootstrap, limpeza e smoke tests do storage S3-compatible de
  teste. O padrão local é MinIO privado; um provider externo só deve ser usado
  com bucket/prefixo de staging isolado e credenciais temporárias.
- `infra/load-test/`: runbook da VPS isolada; não misture seus manifestos
  remotos com os Compose portáveis deste diretório.

## Comandos principais

Executados a partir de `backend/`:

```powershell
npm run test:e2e:up
npm run test:e2e:ci
npm run test:e2e:down
```

Para carga, use `ops/test/load/` e mantenha a massa sintética fora do Git.
Para storage, configure apenas um arquivo local baseado nos exemplos e rode os
scripts em `ops/test/storage/`.

## Isolamento obrigatório

- banco, Redis e volumes devem ter nomes/portas do ambiente de teste;
- storage deve usar bucket/prefixo exclusivo de teste;
- testes devem usar tenants, usuários e PDFs sintéticos;
- tokens e secrets devem entrar somente por variáveis locais/secret store e
  nunca aparecer em logs ou relatórios;
- toda execução deve registrar um `run-id` e gravar evidências em
  `artifacts/test-runs/<run-id>/`, diretório ignorado pelo Git.

## Limpeza

O teardown E2E remove os volumes do Compose. Scripts de storage devem limpar os
prefixos `quarantine/` e `documents/` do ambiente de teste ao final. Não use
comandos de limpeza contra produção ou contra buckets sem validação explícita.
