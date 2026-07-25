# Contributing

Este repositorio contem o SGS, uma plataforma SaaS multi-tenant para SST. A contribuicao deve priorizar confiabilidade operacional, seguranca e clareza de manutencao.

## Regras nao negociaveis

1. Preserve isolamento por tenant em todas as consultas e fluxos.
2. Nao exponha PII em logs, issues, prompts, PRs, screenshots ou servicos externos.
3. Mudancas de schema exigem migration TypeORM retrocompativel.
4. Nao use `any` sem justificativa tecnica explicita.
5. Evite refactors fora do escopo do problema.

## Setup rapido

```bash
npm --prefix backend install
npm --prefix frontend install
```

Backend:

```bash
npm --prefix backend run start:dev
```

Frontend:

```bash
npm --prefix frontend run dev
```

## Validacao recomendada

Use a menor bateria que cubra o risco da mudanca:

```bash
npm --prefix backend run lint
npm --prefix backend run test:ci
npm --prefix backend run build

npm --prefix frontend run lint
npm --prefix frontend run test:ci
npm --prefix frontend run build
```

Para banco, tenancy, auth, PDFs, IA ou storage, inclua testes especificos e evidencias de runtime quando aplicavel.

## Padroes de PR

Todo PR deve explicar:

- contexto e motivacao;
- mudancas principais;
- impacto em LGPD, multi-tenancy e performance;
- plano de rollout/rollback;
- comandos de validacao executados;
- riscos residuais ou pontos nao verificados.

## Convencao de commits

Use Conventional Commits:

- `feat:`
- `fix:`
- `refactor:`
- `perf:`
- `docs:`
- `test:`
- `ci:`
- `chore:`

## Dados sensiveis

Nunca inclua no repositorio:

- tokens, cookies, chaves privadas ou `.env` reais;
- dumps de banco;
- CPF, ASO, dados medicos, assinatura ou documento pessoal bruto;
- logs com dados pessoais sem redacao.

Quando precisar anexar evidencia, redija identificadores sensiveis e prefira `requestId`, `traceId`, timestamp, modulo e status code.
