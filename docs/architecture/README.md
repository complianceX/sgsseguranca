# Compliance X Architecture Baseline

## Objetivo
Estabelecer a base arquitetural do `Compliance X` antes de novas refatoracoes visuais e funcionais.

Este baseline define:
- arquitetura alvo de frontend e backend
- convencoes de organizacao por dominio
- contratos de API, erro e estados visuais
- checklists de multi-tenant, seguranca, observabilidade e design system
- plano de migracao incremental sem `big bang`

## Diagnostico curto
- O backend ja possui fundamentos fortes: multi-tenant, guards globais, middleware de tenant, cache, BullMQ, throttling e observabilidade inicial.
- O frontend ainda esta muito `page-first`, com fetch, estado, composicao visual e regras de tela misturados nas `page.tsx`.
- O design system existe apenas de forma parcial. Ha primitives isoladas, mas os tokens e contratos de uso ainda nao estao institucionalizados.
- Os modulos backend ainda concentram regra, persistencia, exportacao e tenancy em services extensos.

## Arquitetura alvo

### Frontend
- `app/` deve ser fino: roteamento, composicao e guards de pagina.
- `modules/` deve concentrar dominio, hooks, schemas, mappers, componentes e telas.
- `components/ui/` deve ser o design system oficial.
- `components/shared/` deve conter blocos cross-domain, nunca regras de negocio.
- `lib/` deve concentrar infraestrutura cliente: `api`, `auth`, `tenant`, `query`, `format`, `telemetry`, `pdf`.

### Backend
- Manter NestJS e modulos atuais.
- Evoluir gradualmente para camadas explicitas:
  - `api`
  - `application`
  - `domain`
  - `infrastructure`
- Controllers nao acessam repositorios diretamente.
- Use cases concentram comandos de negocio.
- Queries concentram leitura, exportacao e analytics.
- Repositories encapsulam TypeORM e regras de acesso a dados.

## Estruturas de pastas oficiais
- Frontend: [frontend.md](../conventions/frontend.md)
- Backend: [backend.md](../conventions/backend.md)
- Convencoes de nomes: [naming.md](../conventions/naming.md)

## ADRs deste baseline
- [ADR-001-frontend-modular-architecture.md](./ADR-001-frontend-modular-architecture.md)
- [ADR-002-backend-layering.md](./ADR-002-backend-layering.md)
- [ADR-003-api-result-error-contracts.md](./ADR-003-api-result-error-contracts.md)
- [ADR-004-tenant-aware-module-contract.md](./ADR-004-tenant-aware-module-contract.md)
- [ADR-005-design-system-ui-state-contracts.md](./ADR-005-design-system-ui-state-contracts.md)
- [AUDIT-2026-03-remediation-roadmap.md](./AUDIT-2026-03-remediation-roadmap.md)

## Checklists operacionais
- [module-tenant-aware.md](../checklists/module-tenant-aware.md)
- [security-observability.md](../checklists/security-observability.md)
- [design-system-component.md](../checklists/design-system-component.md)

## Regras de migracao
- Sem reescrever tudo do zero.
- Novos modulos ja nascem no padrao novo.
- Modulos existentes migram apenas quando forem tocados.
- Nenhuma renomeacao massiva antes da criacao do baseline e dos componentes base.
- Prioridade inicial: design tokens, states padrao, shell da aplicacao, modulo piloto frontend e modulo piloto backend.

## Ordem recomendada
1. Formalizar contratos e checklists.
2. Criar design tokens, `ui` base e estados visuais padrao.
3. Migrar um modulo medio do frontend.
4. Migrar um modulo medio do backend para `application/domain/infrastructure`.
5. Refatorar dashboard e shell.
6. Expandir por dominio.
