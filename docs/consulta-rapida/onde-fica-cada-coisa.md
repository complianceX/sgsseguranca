# Onde Fica Cada Coisa

## Raiz do repositorio

- `frontend/`: aplicacao web
- `backend/`: API, jobs, storage, auth e dominio
- `docs/`: documentacao tecnica e consulta
- `docker-compose.local.yml`: stack local
- `README.md`: visao geral do projeto

## Frontend

### Pastas mais importantes

- `frontend/app/`: rotas do App Router
- `frontend/app/dashboard/`: telas autenticadas
- `frontend/components/`: componentes reutilizaveis e formularios
- `frontend/services/`: clientes HTTP por modulo
- `frontend/hooks/`: hooks compartilhados
- `frontend/styles/`: tokens, temas e estilos globais
- `frontend/lib/`: utilitarios e contratos compartilhados

### Exemplos uteis

- login: `frontend/app/(auth)/login/`
- dashboard principal: `frontend/app/dashboard/page.tsx`
- shell autenticado: `frontend/app/dashboard/layout.tsx`
- sidebar: `frontend/components/Sidebar.tsx`
- header/topbar: `frontend/components/Header.tsx`

## Backend

### Pastas mais importantes

- `backend/src/auth/`: autenticacao e sessao
- `backend/src/rbac/`: permissoes e papeis
- `backend/src/storage/`: integracao com storage governado
- `backend/src/forensic-trail/`: trilha imutavel dos eventos criticos
- `backend/src/document-import/`: importacao documental
- `backend/src/document-videos/`: videos governados
- `backend/src/signatures/`: assinatura e aceite

### Modulos documentais principais

- `backend/src/aprs/`
- `backend/src/pts/`
- `backend/src/dds/`
- `backend/src/rdos/`
- `backend/src/nonconformities/`
- `backend/src/checklists/`
- `backend/src/cats/`
- `backend/src/dossiers/`
- `backend/src/audits/`

## Documentacao existente

- `docs/architecture/`: ADRs e baseline de arquitetura
- `docs/conventions/`: convencoes de backend, frontend e naming
- `docs/checklists/`: checklists de tenant, observabilidade e design system

## Dica pratica

Se voce quiser encontrar um fluxo rapidamente:

1. abra a tela em `frontend/app/dashboard/...`
2. veja qual componente/formulario ela usa em `frontend/components/...`
3. veja o service HTTP correspondente em `frontend/services/...`
4. procure o modulo de backend equivalente em `backend/src/...`
