# SGS - Sistema de Gestao de Seguranca

<p align="left">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square">
  <img alt="Multi-tenant" src="https://img.shields.io/badge/SaaS-multi--tenant-0F766E?style=flat-square">
  <img alt="LGPD" src="https://img.shields.io/badge/LGPD-by--design-1F2937?style=flat-square">
</p>

Plataforma SaaS B2B para gestao de SST, operacao de seguranca do trabalho, evidencias, inspecoes, documentos governados, permissoes, indicadores e controle operacional por tenant.

O SGS foi desenhado para empresas que precisam manter processos de seguranca rastreaveis, multi-unidade e auditaveis, com isolamento por cliente, governanca documental e operacao em tempo real.

## Visao rapida

- **Produto:** cockpit operacional e administrativo para SST.
- **Publico:** gestores, tecnicos de seguranca, administradores e equipes operacionais.
- **Arquitetura:** monorepo com frontend Next.js, backend NestJS, worker assincrono, PostgreSQL, Redis/BullMQ e storage governado.
- **Deploy atual:** frontend na Vercel; backend web e worker em Vultr/Coolify; banco no Neon.
- **Prioridades tecnicas:** multi-tenancy, LGPD, observabilidade, migrations seguras e performance operacional.

## Principais capacidades

| Area | O que o SGS cobre |
| --- | --- |
| Dashboard SST | KPIs, fila critica, SLA, conformidade, notificacoes e leitura operacional |
| Empresas e sites | Gestao multi-tenant, unidades, obras/sites, usuarios e permissoes |
| Documentos governados | PDFs, assinaturas, evidencias, trilha de auditoria e storage S3 compativel |
| APR e RDO | Fluxos operacionais, validacoes, score, aprovacao e registros de campo |
| Treinamentos e exames | Controle de obrigacoes, vencimentos, trabalhadores e conformidade |
| Sophie IA | Assistente interno de SST com consentimento, sanitizacao de PII e rate limiting |
| Operacao e auditoria | Logs estruturados, health checks, runbooks, DR e controles de seguranca |

## Arquitetura

```text
frontend/  Next.js 16, React 19, design system por tokens, Sentry frontend
backend/   NestJS 11, TypeORM, PostgreSQL, Redis, BullMQ, Sentry backend
worker     Processo separado para filas, PDFs, jobs assincronos e rotinas pesadas
docs/      Runbooks, arquitetura, checklists, auditorias e guias de operacao
ops/       Scripts e ferramentas compartilhadas de build, lint e geracao de clientes
```

### Stack principal

- **Frontend:** Next.js, React, TypeScript, SCSS/CSS tokens, Recharts, Radix UI.
- **Backend:** NestJS, TypeORM, PostgreSQL, Redis, BullMQ, OpenAPI, Sentry.
- **Infra:** Vercel, Vultr/Coolify, Neon, Backblaze B2/S3 compativel, Cloudflare.
- **Qualidade:** lint, testes, build, secret scanning, templates de PR/issue e checks de seguranca.

## Principios de engenharia

1. **Tenant primeiro:** nenhuma query critica deve perder isolamento por `tenantId`, `companyId` ou escopo equivalente.
2. **LGPD por padrao:** dados pessoais e sensiveis nao devem ser expostos em logs, issues, PRs, prompts ou servicos externos sem sanitizacao.
3. **Mudanca segura:** alteracoes de schema exigem migration TypeORM retrocompativel.
4. **Operacao real:** features devem considerar health checks, rollback, observabilidade e impacto em producao.
5. **UX operacional:** telas devem priorizar decisao, fila critica, SLA, clareza e baixa friccao.

## Execucao local

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Worker

```bash
cd backend
npm run start:worker
```

## Validacao

Use os comandos abaixo conforme a area alterada:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:ci

npm --prefix backend run lint
npm --prefix backend run test:ci
npm --prefix backend run build
```

Para alteracoes de banco e tenancy, valide tambem migrations, RLS e checks especificos de seguranca descritos na documentacao operacional.

## Deploy e operacao

- **Frontend:** Vercel
- **Backend web:** Vultr/Coolify com `npm run start:web`
- **Backend worker:** Vultr/Coolify com `npm run start:worker`
- **Banco:** Neon/PostgreSQL com role runtime separada da role owner/DDL
- **Storage:** Backblaze B2/S3 compativel para artefatos governados
- **Health checks:** `GET /health/public` e `GET /health`

Observabilidade completa depende de configuracao explicita. O runtime sobe com logs estruturados por padrao; OpenTelemetry, Prometheus e Sentry sao ativados por variaveis de ambiente.

## Documentacao essencial

- [Backend README](backend/README.md)
- [Docs gerais](docs/README.md)
- [Arquitetura e stack](docs/consulta-rapida/arquitetura-e-stack.md)
- [Mapa de modulos](docs/consulta-rapida/mapa-de-modulos.md)
- [Seguranca e governanca](docs/consulta-rapida/seguranca-e-governanca.md)
- [Deploy Vultr/Coolify](docs/deploy/coolify-vultr-backend-web-worker.md)
- [Runbook de producao](backend/docs/RUNBOOK_PRODUCTION.md)
- [Observabilidade](backend/docs/OBSERVABILITY.md)

## Contribuicao

Antes de abrir PR:

- leia [CONTRIBUTING.md](CONTRIBUTING.md);
- descreva impacto em multi-tenancy, LGPD e performance;
- inclua comandos de validacao executados;
- nao publique dados pessoais, tokens, cookies, dumps ou logs sensiveis.

## Seguranca

Vulnerabilidades nao devem ser reportadas por issue publica. Use o fluxo descrito em [SECURITY.md](SECURITY.md) e redija qualquer evidencia que contenha dados pessoais, credenciais, tokens ou identificadores sensiveis.

## Licenca

Codigo e documentacao de uso privado/proprietario. Todos os direitos reservados.
