# Onde Fica Cada Coisa

## Raiz do repositorio

- `frontend/`: aplicacao web
- `backend/`: API, jobs, storage, auth e dominio
- `docs/`: documentacao tecnica e consulta
- `ops/docker/docker-compose.local.yml`: stack local
- `README.md`: visao geral do projeto

## Frontend

### Pastas mais importantes

- `frontend/app/`: rotas do App Router
- `frontend/app/dashboard/`: telas autenticadas
- `frontend/app/dashboard/relatorios/`: hub de relatórios documentais, incluindo RDO
- `frontend/src/components/`: componentes reutilizaveis e formularios
- `frontend/src/services/`: clientes HTTP por modulo
- `frontend/src/hooks/`: hooks compartilhados
- `frontend/styles/`: tokens, temas e estilos globais
- `frontend/src/lib/`: utilitarios e contratos compartilhados

### Exemplos uteis

- login: `frontend/app/(auth)/login/`
- dashboard principal: `frontend/app/dashboard/page.tsx`
- shell autenticado: `frontend/app/dashboard/layout.tsx`
- sidebar: `frontend/src/components/Sidebar.tsx`
- header/topbar: `frontend/src/components/Header.tsx`

## Backend

### Pastas mais importantes

- `backend/src/modules/auth/`: autenticacao e sessao
- `backend/src/modules/rbac/`: permissoes e papeis
- `backend/src/infra/storage/`: integracao com storage governado
- `backend/src/modules/forensic-trail/`: trilha imutavel dos eventos criticos
- `backend/src/modules/document-import/`: importacao documental
- `backend/src/modules/document-videos/`: videos governados
- `backend/src/modules/signatures/`: assinatura e aceite
- `backend/src/modules/reports/`: agregador de relatórios documentais (reports, photographic-reports, RDO)

### Modulos documentais principais

- `backend/src/modules/aprs/`
- `backend/src/modules/pts/`
- `backend/src/modules/dds/`
- `backend/src/modules/rdos/`
- `backend/src/modules/nonconformities/`
- `backend/src/modules/checklists/`
- `backend/src/modules/cats/`
- `backend/src/modules/dossiers/`
- `backend/src/modules/audits/`

## Documentacao existente

- `docs/architecture/`: ADRs e baseline de arquitetura
- `docs/conventions/`: convencoes de backend, frontend e naming
- `docs/checklists/`: checklists de tenant, observabilidade e design system

## Dica pratica

Se voce quiser encontrar um fluxo rapidamente:

1. abra a tela em `frontend/app/dashboard/...`
2. veja qual componente/formulario ela usa em `frontend/src/components/...`
3. veja o service HTTP correspondente em `frontend/src/services/...`
4. procure o modulo de backend equivalente em `backend/src/modules/...`
