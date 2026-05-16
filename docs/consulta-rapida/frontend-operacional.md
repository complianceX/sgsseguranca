# Frontend Operacional

## Onde o frontend esta hoje

O frontend ainda mistura um pouco de estrutura antiga com uma direcao mais modular. Na pratica, estas pastas sao as mais importantes:

- `frontend/app/`: rotas
- `frontend/app/dashboard/`: telas autenticadas
- `frontend/components/`: componentes e formularios reutilizaveis
- `frontend/services/`: clientes HTTP por modulo
- `frontend/hooks/`: hooks compartilhados
- `frontend/lib/`: utilitarios e contratos cross-cutting
- `frontend/styles/`: tokens, temas e base visual

## Shell principal

Arquivos de shell e navegacao:

- `frontend/app/layout.tsx`
- `frontend/app/dashboard/layout.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/Header.tsx`

Se a duvida for sobre:

- navegacao lateral: `Sidebar.tsx`
- topbar, notificacoes e acoes globais: `Header.tsx`
- estrutura da area autenticada: `dashboard/layout.tsx`

## Tema e identidade visual

Arquivos principais:

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

O que cada um faz:

- `tokens.css`: tokens base
- `theme-light.css`: mapeamento do tema claro
- `globals.css`: classes utilitarias, overrides e acabamentos globais
- `tailwind.config.ts`: paleta e shadow/radius para utilitarios Tailwind

## Como uma tela normalmente se conecta

Fluxo mais comum:

1. rota em `frontend/app/dashboard/.../page.tsx`
2. composicao com componentes em `frontend/components/...`
3. service HTTP em `frontend/services/...`
4. backend correspondente em `backend/src/...`

## Services mais relevantes

Alguns services importantes:

- `authService.ts`
- `dashboardService.ts`
- `aprsService.ts`
- `ptsService.ts`
- `ddsService.ts`
- `rdosService.ts`
- `documentImportService.ts`
- `documentRegistryService.ts`
- `signaturesService.ts`
- `systemThemeService.ts`

## Geracao de contratos

Existem scripts para gerar clientes tipados:

- `npm run api:generate:document-import`
- `npm run api:generate:governed-contracts`

Isso e importante quando houver drift entre frontend e backend em contratos criticos.

## Estados visuais importantes

Ao tocar uma tela operacional, confira:

- loading
- empty
- error
- success
- read-only
- disabled

## Ponto de atencao

Como o frontend ainda tem bastante codigo em `components/` e `page.tsx`, sempre leia o fluxo real antes de editar. Em formularios densos, o estado visual e a regra de bloqueio podem estar espalhados entre:

- `page.tsx`
- formulario principal
- hook/service
- componente de suporte
