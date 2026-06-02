# Onde Alterar o Que

## Login e autenticacao

### Frontend

- `frontend/app/(auth)/login/`
- `frontend/src/services/authService.ts`

### Backend

- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/`

## Shell autenticado

- `frontend/app/dashboard/layout.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/Header.tsx`

## Tema, cores e acabamento visual

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

## Dashboard principal

- `frontend/app/dashboard/page.tsx`
- `frontend/src/services/dashboardService.ts`
- `backend/src/modules/dashboard/`

## APR

### Frontend

- `frontend/app/dashboard/aprs/`
- `frontend/app/dashboard/aprs/components/`
- `frontend/src/services/aprsService.ts`

### Backend

- `backend/src/modules/aprs/`

Quando a duvida for lock/read-only, comece por:

- `backend/src/modules/aprs/aprs.service.ts`

## DDS

### Frontend

- `frontend/app/dashboard/dds/`
- `frontend/src/components/DdsForm.tsx`
- `frontend/src/services/ddsService.ts`

### Backend

- `backend/src/modules/dds/`

## Relatórios

### Frontend

- `frontend/app/dashboard/relatorios/rdos/`
- `frontend/src/services/rdosService.ts`

### Backend

- `backend/src/modules/rdos/`

## Videos governados

### Frontend

- `frontend/src/hooks/useDocumentVideos.ts`
- `frontend/src/components/document-videos/DocumentVideoPanel.tsx`
- `frontend/src/lib/videos/documentVideos.ts`

### Backend

- `backend/src/modules/document-videos/`

## Importacao documental

### Frontend

- `frontend/app/dashboard/documentos/importar`
- `frontend/src/services/documentImportService.ts`

### Backend

- `backend/src/modules/document-import/`

## Assinaturas

### Frontend

- `frontend/src/services/signaturesService.ts`

### Backend

- `backend/src/modules/signatures/`

## Registry documental

### Frontend

- `frontend/app/dashboard/document-registry/`
- `frontend/src/services/documentRegistryService.ts`

### Backend

- `backend/src/modules/document-registry/`

## Dica pratica

Se voce precisa mudar um fluxo e nao sabe onde:

1. encontre a pagina no `frontend/app/dashboard`
2. encontre o componente/formulario usado
3. encontre o service HTTP correspondente
4. encontre o modulo de backend do mesmo dominio
5. revise DTO, service e testes antes de editar
