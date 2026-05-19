# Contributing

Este repositorio contem o SGS (SaaS multi-tenant de SST). A prioridade e:
1. Isolamento por tenant (nunca remover filtro/contrato de tenant).
2. LGPD (nao enviar PII bruto para terceiros; sempre sanitizar antes de OpenAI).
3. Confiabilidade (migracoes retrocompativeis; sem downtime desnecessario).

## Setup (alto nivel)
- `backend/`: NestJS + TypeORM + Postgres + Redis
- `frontend/`: Next.js

Scripts principais (exemplos):
- `npm --prefix backend test:ci`
- `npm --prefix backend build`
- `npm --prefix frontend test:ci`
- `npm --prefix frontend build`

## Padrões
- Nada de `any` sem justificativa.
- Exceptions tipadas do NestJS (nunca `throw new Error()` em runtime web).
- Mudancas de schema: sempre migration TypeORM e retrocompatibilidade.
- Operacoes sensiveis: step-up (`/auth/step-up/verify`) quando aplicavel.

## Pull Requests
- PR pequeno, com descricao objetiva.
- Inclua como testar e riscos (LGPD / multi-tenant / performance).

