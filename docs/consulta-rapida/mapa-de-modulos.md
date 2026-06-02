# Mapa de Modulos

Para o desenho macro do sistema e a arvore completa de rotas, consulte tambem:

- [arquitetura-e-rotas.md](./arquitetura-e-rotas.md)

## Modulos documentais principais

| Dominio | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| APR | `frontend/app/dashboard/aprs` | `backend/src/modules/aprs` | modulo com lock forte e nova versao como fluxo legitimo |
| PT | `frontend/app/dashboard/pts` | `backend/src/modules/pts` | fluxo documental e assinatura relevantes |
| DDS | `frontend/app/dashboard/dds` | `backend/src/modules/dds` | suporta video governado |
| RDO | `frontend/app/dashboard/relatorios/rdos` | `backend/src/modules/rdos` | suporta video governado |
| CAT | `frontend/app/dashboard/cats` | `backend/src/modules/cats` | nesta rodada nao deve expor video |
| Checklist | `frontend/app/dashboard/checklists` | `backend/src/modules/checklists` | documental, sem video nesta rodada |
| Nao Conformidade | `frontend/app/dashboard/nonconformities` | `backend/src/modules/nonconformities` | documental, sem video nesta rodada |
| Dossie | `frontend/app/dashboard/dossiers` | `backend/src/modules/dossiers` | governanca documental relevante |
| Auditoria | `frontend/app/dashboard/audits` | `backend/src/modules/audits` | modulo documental e operacional |

## Modulos operacionais e de plataforma

| Dominio | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| Dashboard | `frontend/app/dashboard/page.tsx` | `backend/src/modules/dashboard` | shell principal autenticado |
| Auth | `frontend/app/(auth)` | `backend/src/modules/auth` | login, sessao, refresh e seguranca |
| Empresas | `frontend/app/dashboard/companies` | `backend/src/modules/companies` | tenant/company context |
| Usuarios | `frontend/app/dashboard/users` | `backend/src/modules/users` | acesso e gestao de contas |
| Sites | `frontend/app/dashboard/sites` | `backend/src/modules/sites` | cadastro operacional |
| Riscos | `frontend/app/dashboard/risks` | `backend/src/modules/risks` | base de risco e apoio aos fluxos |
| Treinamentos | `frontend/app/dashboard/trainings` | `backend/src/modules/trainings` | operacional |
| Maquinas | `frontend/app/dashboard/machines` | `backend/src/modules/machines` | operacional |
| Ferramentas | `frontend/app/dashboard/tools` | `backend/src/modules/tools` | operacional |
| EPI | `frontend/app/dashboard/epis` | `backend/src/modules/epis` | operacional |

## Modulos tecnicos centrais

| Tema | Frontend | Backend | Observacao |
| --- | --- | --- | --- |
| Importacao documental | `frontend/app/dashboard/documentos/importar`, `frontend/src/services/documentImportService.ts` | `backend/src/modules/document-import` | assincrono, com idempotencia e DLQ |
| Registry documental | `frontend/app/dashboard/document-registry` | `backend/src/modules/document-registry` | governanca e rastreio documental |
| Videos governados | `frontend/src/hooks/useDocumentVideos.ts`, `frontend/src/components/document-videos/` | `backend/src/modules/document-videos` | restrito a DDS e RDO |
| Assinaturas | `frontend/src/services/signaturesService.ts` | `backend/src/modules/signatures` | assinatura, aceite e verificacao |
| Tema do sistema | `frontend/src/components/ThemeProvider.tsx`, `frontend/src/services/systemThemeService.ts` | `backend/src/system-theme` | tema carregado do backend |
| IA / SOPHIE | `frontend/src/services/sophieService.ts`, `frontend/app/dashboard/sst-agent` | `backend/src/modules/sophie`, `backend/src/modules/ai` | area em consolidacao |

## Como navegar

Se voce souber o nome do modulo:

1. abra a rota em `frontend/app/dashboard/<modulo>`
2. veja os services relacionados em `frontend/src/services`
3. abra o modulo correspondente em `backend/src/modules/<modulo>`
