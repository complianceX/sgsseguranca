# Compliance X Docs

## Comece por aqui

| Você é… | Leia |
|---|---|
| **Dev novo no projeto** | [consulta-rapida/visao-geral.md](./consulta-rapida/visao-geral.md) → [architecture/SGS-FLUXOGRAMA-COMPLETO.md](./architecture/SGS-FLUXOGRAMA-COMPLETO.md) → [consulta-rapida/onde-alterar-o-que.md](./consulta-rapida/onde-alterar-o-que.md) |
| **Cliente, auditor ou certificadora** | [SGS-GOVERNANCA-DOCUMENTAL.md](./SGS-GOVERNANCA-DOCUMENTAL.md) — o que o sistema garante, e o que não garante |
| **Quem vai colocar em produção** | [deploy/COMO-COLOCAR-EM-PRODUCAO.md](./deploy/COMO-COLOCAR-EM-PRODUCAO.md) — passo a passo e armadilhas |
| **Quem está com um incidente** | [consulta-rapida/troubleshooting.md](./consulta-rapida/troubleshooting.md) · [../backend/docs/INCIDENT_PLAYBOOK.md](../backend/docs/INCIDENT_PLAYBOOK.md) |

## Architecture Baseline
- [architecture/SGS-FLUXOGRAMA-COMPLETO.md](./architecture/SGS-FLUXOGRAMA-COMPLETO.md) — **painel visual do sistema** ([PNG](./architecture/assets/sgs-fluxograma-sistema.png) · [PDF](./architecture/assets/sgs-fluxograma-sistema.pdf)) + 5 fluxogramas Mermaid: topologia, ciclo do documento, request/tenant, filas, validação por QR
- [architecture/SGS-SYSTEM-ARCHITECTURE-DIAGRAM.md](./architecture/SGS-SYSTEM-ARCHITECTURE-DIAGRAM.md) — visão executiva da arquitetura
- [architecture/README.md](./architecture/README.md)
- [architecture/AUDIT-2026-03-remediation-roadmap.md](./architecture/AUDIT-2026-03-remediation-roadmap.md)

## Governança e conformidade
- [SGS-GOVERNANCA-DOCUMENTAL.md](./SGS-GOVERNANCA-DOCUMENTAL.md) — autenticidade, prova de assinatura, LGPD, isolamento (linguagem de processo, para auditoria)
- [state-machines.md](./state-machines.md) — estados e transições de cada entidade

## Deploy
- [deploy/INFRAESTRUTURA-ATUAL.md](./deploy/INFRAESTRUTURA-ATUAL.md) — fonte de verdade da infraestrutura atual, produção e load test
- [deploy/COMO-COLOCAR-EM-PRODUCAO.md](./deploy/COMO-COLOCAR-EM-PRODUCAO.md) — **nada sobe sozinho neste projeto**; checklist real
- [deploy/coolify-vultr-backend-web-worker.md](./deploy/coolify-vultr-backend-web-worker.md) — configuração da infra (histórico da migração)

## Consulta Rapida
- [consulta-rapida/README.md](./consulta-rapida/README.md)
- [consulta-rapida/visao-geral.md](./consulta-rapida/visao-geral.md)
- [architecture/stack-e-tecnologias.md](./architecture/stack-e-tecnologias.md)
- [architecture/rotas-e-endpoints.md](./architecture/rotas-e-endpoints.md)
- [consulta-rapida/frontend-operacional.md](./consulta-rapida/frontend-operacional.md)
- [consulta-rapida/backend-operacional.md](./consulta-rapida/backend-operacional.md)
- [consulta-rapida/onde-fica-cada-coisa.md](./consulta-rapida/onde-fica-cada-coisa.md)
- [consulta-rapida/mapa-de-modulos.md](./consulta-rapida/mapa-de-modulos.md)
- [consulta-rapida/modulos-e-regras.md](./consulta-rapida/modulos-e-regras.md)
- [architecture/fluxos-documentais.md](./architecture/fluxos-documentais.md)
- [consulta-rapida/disaster-recovery-e-backup.md](./consulta-rapida/disaster-recovery-e-backup.md)
- [consulta-rapida/implementacoes-recentes.md](./consulta-rapida/implementacoes-recentes.md)
- [consulta-rapida/pdfs-finais-e-storage.md](./consulta-rapida/pdfs-finais-e-storage.md)
- [consulta-rapida/seguranca-e-governanca.md](./consulta-rapida/seguranca-e-governanca.md)
- [consulta-rapida/onde-alterar-o-que.md](./consulta-rapida/onde-alterar-o-que.md)
- [consulta-rapida/troubleshooting.md](./consulta-rapida/troubleshooting.md)
- [consulta-rapida/faq.md](./consulta-rapida/faq.md)
- [consulta-rapida/comandos-e-validacao.md](./consulta-rapida/comandos-e-validacao.md)

## Conventions
- [conventions/frontend.md](./conventions/frontend.md)
- [conventions/backend.md](./conventions/backend.md)
- [conventions/naming.md](./conventions/naming.md)

## Checklists
- [checklists/module-tenant-aware.md](./checklists/module-tenant-aware.md)
- [checklists/security-observability.md](./checklists/security-observability.md)
- [checklists/design-system-component.md](./checklists/design-system-component.md)
