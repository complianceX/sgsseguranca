# Mapa de Modulos

Para o desenho macro do sistema e a arvore completa de rotas, consulte tambem:

- [arquitetura-e-rotas.md](./arquitetura-e-rotas.md)

## Modulos documentais principais

| Dominio | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| APR | `frontend/app/dashboard/aprs` | `backend/src/aprs` | modulo com lock forte e nova versao como fluxo legitimo |
| PT | `frontend/app/dashboard/pts` | `backend/src/pts` | fluxo documental e assinatura relevantes |
| Inspecao | `frontend/app/dashboard/inspections` | `backend/src/inspections` | suporta video governado |
| DDS | `frontend/app/dashboard/dds` | `backend/src/dds` | suporta video governado |
| RDO | `frontend/app/dashboard/rdos` | `backend/src/rdos` | suporta video governado |
| CAT | `frontend/app/dashboard/cats` | `backend/src/cats` | nesta rodada nao deve expor video |
| Checklist | `frontend/app/dashboard/checklists` | `backend/src/checklists` | documental, sem video nesta rodada |
| Nao Conformidade | `frontend/app/dashboard/nonconformities` | `backend/src/nonconformities` | documental, sem video nesta rodada |
| Dossie | `frontend/app/dashboard/dossiers` | `backend/src/dossiers` | governanca documental relevante |
| Auditoria | `frontend/app/dashboard/audits` | `backend/src/audits` | modulo documental e operacional |

## Modulos operacionais e de plataforma

| Dominio | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| Dashboard | `frontend/app/dashboard/page.tsx` | `backend/src/dashboard` | shell principal autenticado |
| Auth | `frontend/app/(auth)` | `backend/src/auth` | login, sessao, refresh e seguranca |
| Empresas | `frontend/app/dashboard/companies` | `backend/src/companies` | tenant/company context |
| Usuarios | `frontend/app/dashboard/users` | `backend/src/users` | acesso e gestao de contas |
| Sites | `frontend/app/dashboard/sites` | `backend/src/sites` | cadastro operacional |
| Riscos | `frontend/app/dashboard/risks` | `backend/src/risks` | base de risco e apoio aos fluxos |
| Treinamentos | `frontend/app/dashboard/trainings` | `backend/src/trainings` | operacional |
| Maquinas | `frontend/app/dashboard/machines` | `backend/src/machines` | operacional |
| Ferramentas | `frontend/app/dashboard/tools` | `backend/src/tools` | operacional |
| EPI | `frontend/app/dashboard/epis` | `backend/src/epis` | operacional |

## Modulos tecnicos centrais

| Tema | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| Importacao documental | `frontend/app/dashboard/documentos/importar`, `frontend/services/documentImportService.ts` | `backend/src/document-import` | assincrono, com idempotencia e DLQ |
| Registry documental | `frontend/app/dashboard/document-registry` | `backend/src/document-registry` | governanca e rastreio documental |
| Videos governados | `frontend/hooks/useDocumentVideos.ts`, `frontend/components/document-videos/` | `backend/src/document-videos` | restrito a DDS, RDO e Inspecao |
| Assinaturas | `frontend/services/signaturesService.ts` | `backend/src/signatures` | assinatura, aceite e verificacao |
| Tema do sistema | `frontend/components/ThemeProvider.tsx`, `frontend/services/systemThemeService.ts` | `backend/src/system-theme` | tema carregado do backend |
| IA / SOPHIE | `frontend/services/sophieService.ts`, `frontend/app/dashboard/sst-agent` | `backend/src/sophie`, `backend/src/ai` | area em consolidacao |

## Como navegar

Se voce souber o nome do modulo:

1. abra a rota em `frontend/app/dashboard/<modulo>`
2. veja os services relacionados em `frontend/services`
3. abra o modulo correspondente em `backend/src/<modulo>`
