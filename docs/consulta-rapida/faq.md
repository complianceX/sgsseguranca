# FAQ

## Onde eu comeco quando nao sei por onde entrar?

Comece por:

1. `visao-geral.md`
2. `onde-fica-cada-coisa.md`
3. `onde-alterar-o-que.md`

## Como descubro o backend de uma tela?

Procure a rota em `frontend/app/dashboard`, depois o service em `frontend/services` e por fim o modulo correspondente em `backend/src`.

## Como sei se um documento esta travado?

Leia o formulario no frontend e, principalmente, o service do modulo no backend. O backend e a autoridade final do lock.

## Quais modulos suportam video hoje?

Somente:

- DDS
- RDO
- Relatorio de Inspecao

## Onde vejo a importacao documental?

- frontend: `frontend/app/dashboard/documentos/importar`
- frontend service: `frontend/services/documentImportService.ts`
- backend: `backend/src/document-import`

## Onde vejo a trilha forense?

- backend: `backend/src/forensic-trail`

## Onde vejo assinatura e aceite?

- frontend: `frontend/services/signaturesService.ts`
- backend: `backend/src/signatures`

## Onde vejo o tema e a identidade visual?

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

## O que rodar antes de considerar uma mudanca pronta?

Frontend:

```bash
cd frontend
npm run lint
npm run build
npm test
```

Backend:

```bash
cd backend
npm run lint
npm run build
npm test
```

## Quando preciso olhar o worker?

Quando o fluxo envolver:

- importacao documental
- filas
- retry
- timeout
- jobs assincronos
