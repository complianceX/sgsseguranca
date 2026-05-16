# Backend Operacional

## Onde o backend esta hoje

O backend esta em NestJS e ainda mistura estrutura modular tradicional com uma direcao mais explicita de camadas.

Pastas mais importantes em `backend/src/`:

- `auth/`
- `rbac/`
- `storage/`
- `document-import/`
- `document-videos/`
- `document-registry/`
- `forensic-trail/`
- `signatures/`
- `health/`
- modulos de dominio como `aprs/`, `pts/`, `dds/`, `rdos/`

## Como um modulo normalmente funciona

Fluxo mais comum:

1. controller recebe request
2. DTO valida o payload
3. service aplica regra de negocio
4. repositorio/TypeORM persiste
5. modulos cross-cutting fazem storage, fila, assinatura, trilha ou notificacao

## Modulos cross-cutting importantes

### Auth

- login, sessao, JWT, refresh e controles de sessao

### RBAC

- autorizacao por papeis e permissoes

### Storage

- upload e acesso governado a arquivos

### Document Import

- importacao documental assincrona
- fila
- status consultavel
- retry e timeout
- idempotencia

### Document Videos

- videos governados
- hoje restritos a `dds` e `rdo`

### Signatures

- assinatura e aceite
- parte do endurecimento recente usa verificacao server-side

### Forensic Trail

- trilha append-only para eventos criticos

## Health e observabilidade

Pontos principais:

- `GET /health/public`
- `GET /health`
- logs estruturados JSON

## Scripts importantes

- `npm run build`
- `npm run start:dev`
- `npm run start:worker`
- `npm run migration:run`
- `npm run release:migrate`
- `npm run openapi:export`
- `npm run openapi:export:governed`
- `npm run test:smoke`

## Quando mexer no backend

Leia sempre:

- controller do modulo
- service principal
- DTOs
- entidades
- specs do modulo, se existirem

Se o tema envolver:

- tenant
- lock
- RBAC
- storage
- assinatura
- PDF final

assuma que a regra final precisa ser reforcada no backend, nao so no frontend.
