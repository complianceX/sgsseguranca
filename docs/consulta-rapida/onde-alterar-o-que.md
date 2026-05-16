# Onde Alterar o Que

## Login e autenticacao

### Frontend

- `frontend/app/(auth)/login/`
- `frontend/services/authService.ts`

### Backend

- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/`

## Shell autenticado

- `frontend/app/dashboard/layout.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/Header.tsx`

## Tema, cores e acabamento visual

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

## Dashboard principal

- `frontend/app/dashboard/page.tsx`
- `frontend/services/dashboardService.ts`
- `backend/src/dashboard/`

## APR

### Frontend

- `frontend/app/dashboard/aprs/`
- `frontend/app/dashboard/aprs/components/`
- `frontend/services/aprsService.ts`

### Backend

- `backend/src/aprs/`

Quando a duvida for lock/read-only, comece por:

- `backend/src/aprs/aprs.service.ts`

## DDS

### Frontend

- `frontend/app/dashboard/dds/`
- `frontend/components/DdsForm.tsx`
- `frontend/services/ddsService.ts`

### Backend

- `backend/src/dds/`

## RDO

### Frontend

- `frontend/app/dashboard/rdos/`
- `frontend/services/rdosService.ts`

### Backend

- `backend/src/rdos/`

## Videos governados

### Frontend

- `frontend/hooks/useDocumentVideos.ts`
- `frontend/components/document-videos/DocumentVideoPanel.tsx`
- `frontend/lib/videos/documentVideos.ts`

### Backend

- `backend/src/document-videos/`

## Importacao documental

### Frontend

- `frontend/app/dashboard/documentos/importar`
- `frontend/services/documentImportService.ts`

### Backend

- `backend/src/document-import/`

## Assinaturas

### Frontend

- `frontend/services/signaturesService.ts`

### Backend

- `backend/src/signatures/`

## Registry documental

### Frontend

- `frontend/app/dashboard/document-registry/`
- `frontend/services/documentRegistryService.ts`

### Backend

- `backend/src/document-registry/`

## Dica pratica

Se voce precisa mudar um fluxo e nao sabe onde:

1. encontre a pagina no `frontend/app/dashboard`
2. encontre o componente/formulario usado
3. encontre o service HTTP correspondente
4. encontre o modulo de backend do mesmo dominio
5. revise DTO, service e testes antes de editar
