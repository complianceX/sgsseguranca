# SGS — Documentação de Arquitetura

Pasta única com toda a documentação arquitetural do SGS: diagramas, fluxogramas, ADRs, mapa de rotas, fluxos documentais e referências visuais.

---

## Diagramas e Fluxogramas

| Documento | Conteúdo |
|---|---|
| [SGS-SYSTEM-ARCHITECTURE-DIAGRAM.md](./SGS-SYSTEM-ARCHITECTURE-DIAGRAM.md) | Diagrama executivo Mermaid: frontend, backend web, worker, dados e integrações |
| [SGS-FLUXOGRAMA-COMPLETO.md](./SGS-FLUXOGRAMA-COMPLETO.md) | 5 fluxogramas detalhados: topologia, ciclo documental, pipeline de middleware, filas, validação por QR |
| [diagrama-banco.md](./diagrama-banco.md) | Diagrama ER completo do banco (Mermaid) — todas as tabelas, colunas e relacionamentos |

---

## Mapa do Sistema

| Documento | Conteúdo |
|---|---|
| [stack-e-tecnologias.md](./stack-e-tecnologias.md) | Stack resumida: frontend, backend, worker, infra, temas e fluxos estruturais |
| [rotas-e-endpoints.md](./rotas-e-endpoints.md) | Mapa completo de todas as rotas do frontend e todos os endpoints REST do backend |
| [fluxos-documentais.md](./fluxos-documentais.md) | Fluxos de PDF final, read-only/lock, registry documental, importação, assinaturas, vídeos governados |

---

## ADRs — Decisões Arquiteturais

Todos os ADRs estão em [`adr/`](./adr/README.md).

### Arquitetura de Aplicação (ADR-001 a ADR-005)

| ADR | Título |
|---|---|
| [ADR-001](./adr/ADR-001-frontend-modular-architecture.md) | Arquitetura modular do frontend |
| [ADR-002](./adr/ADR-002-backend-layering.md) | Camadas explícitas no backend (api / application / domain / infrastructure) |
| [ADR-003](./adr/ADR-003-api-result-error-contracts.md) | Contratos de resultado e erro das APIs |
| [ADR-004](./adr/ADR-004-tenant-aware-module-contract.md) | Contrato de módulo ciente de tenant |
| [ADR-005](./adr/ADR-005-design-system-ui-state-contracts.md) | Contratos de UI state no design system |

### Infraestrutura e Segurança (ADR-006 a ADR-012)

| ADR | Título |
|---|---|
| [ADR-006](./adr/ADR-006-rls-async-local-storage.md) | Isolamento multi-tenant com RLS + AsyncLocalStorage |
| [ADR-007](./adr/ADR-007-refresh-token-rotation.md) | Rotação de refresh tokens |
| [ADR-008](./adr/ADR-008-fail-closed-multi-tenant.md) | Fail-closed em contexto multi-tenant |
| [ADR-009](./adr/ADR-009-bullmq-job-architecture.md) | Arquitetura de jobs com BullMQ |
| [ADR-010](./adr/ADR-010-ai-rate-limiting-consent.md) | Rate limiting e consentimento para IA |
| [ADR-011](./adr/ADR-011-lgpd-remediation-decisions.md) | Decisões de remediação LGPD |
| [ADR-012](./adr/ADR-012-expenses-data-encryption-phasing.md) | Faseamento de criptografia de dados de despesas |

---

## Roadmap e Auditoria

| Documento | Conteúdo |
|---|---|
| [AUDIT-2026-03-remediation-roadmap.md](./AUDIT-2026-03-remediation-roadmap.md) | Roadmap de remediação pós-auditoria Mar/2026 |

---

## Assets Visuais

Todos os arquivos visuais estão em [`assets/`](./assets/).

### Fluxogramas exportados (SVG)

| Arquivo | Conteúdo |
|---|---|
| [sgs-fluxo-1-topologia.svg](./assets/sgs-fluxo-1-topologia.svg) | Topologia macro do sistema |
| [sgs-fluxo-2-ciclo-documento.svg](./assets/sgs-fluxo-2-ciclo-documento.svg) | Ciclo de vida de documento governado |
| [sgs-fluxo-3-request-tenant.svg](./assets/sgs-fluxo-3-request-tenant.svg) | Pipeline de middleware e scoping de tenant |
| [sgs-fluxo-4-filas.svg](./assets/sgs-fluxo-4-filas.svg) | Processamento assíncrono (13 filas BullMQ) |
| [sgs-fluxo-5-validacao-qr.svg](./assets/sgs-fluxo-5-validacao-qr.svg) | Validação pública por QR |

### Fluxograma completo do sistema

| Arquivo | Conteúdo |
|---|---|
| [sgs-fluxograma-sistema.png](./assets/sgs-fluxograma-sistema.png) | Painel único com os 54 módulos (4000×3184 px) |
| [sgs-fluxograma-sistema.pdf](./assets/sgs-fluxograma-sistema.pdf) | Versão vetorial para apresentação/impressão |
| [assets/src/sgs-fluxograma-sistema.html](./assets/src/sgs-fluxograma-sistema.html) | Fonte HTML do fluxograma (editar aqui) |
| [assets/src/render.js](./assets/src/render.js) | Script Puppeteer para regerar PNG e PDF |

### Diagramas de governança

| Arquivo | Conteúdo |
|---|---|
| [sgs-gov-1-ciclo.svg](./assets/sgs-gov-1-ciclo.svg) | Ciclo de governança documental |
| [sgs-gov-2-validacao.svg](./assets/sgs-gov-2-validacao.svg) | Fluxo de validação |
| [sgs-gov-3-isolamento.svg](./assets/sgs-gov-3-isolamento.svg) | Isolamento multi-tenant |

---

## Como regerar os assets visuais

```bash
# Regerar PNG e PDF do fluxograma completo (da raiz do repo)
node docs/architecture/assets/src/render.js \
  docs/architecture/assets/src/sgs-fluxograma-sistema.html \
  docs/architecture/assets/sgs-fluxograma-sistema.png 2

node docs/architecture/assets/src/render.js \
  docs/architecture/assets/src/sgs-fluxograma-sistema.html \
  docs/architecture/assets/sgs-fluxograma-sistema.pdf

# Regerar SVGs dos fluxogramas Mermaid (ver SGS-FLUXOGRAMA-COMPLETO.md para o script completo)
```

---

## O que está em outras pastas de docs

Esta pasta contém **toda a documentação arquitetural**. Documentação operacional e de referência fica em:

| Pasta / Arquivo | Conteúdo |
|---|---|
| `docs/database-schema.md` | Schema descritivo completo (colunas, tipos, índices) |
| `docs/api-reference.md` | Referência completa de endpoints REST com exemplos |
| `docs/state-machines.md` | Máquinas de estado de todas as entidades (APR, DDS, PT…) |
| `docs/deploy/` | Runbooks de deploy (Coolify, Vercel, workers) |
| `docs/consulta-rapida/` | Consultas rápidas operacionais (onde alterar X, disaster recovery…) |
| `docs/troubleshooting.md` | Guia de problemas comuns e soluções |

---

## Fontes de verdade dos diagramas

Diagramas conferidos contra o código, não contra documentação anterior:

- `backend/src/app.module.ts` · `worker.module.ts` · `main.ts`
- `backend/src/infra/config/modules.config.ts`
- `backend/src/shared/tenant/` · `shared/guards/` · `shared/security/file-inspection.service.ts`
- `backend/src/modules/document-registry/`
- Filas: `grep -r "registerQueue" backend/src`
