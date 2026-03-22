# Arquitetura e Stack

## Visao em uma frase

O sistema e uma plataforma SaaS de SST/GST com frontend web, backend API, worker assincrono e storage governado para documentos e evidencias.

## Blocos principais

### Frontend

- stack: Next.js 15
- pasta: `frontend/`
- papel: login, dashboard, CRUDs, formularios densos, fluxos documentais e shell autenticado

### Backend

- stack: NestJS 11 + TypeORM
- pasta: `backend/`
- papel: API, regras de negocio, RBAC, tenant scoping, storage, contratos documentais e jobs

### Worker

- roda a partir do backend
- comando: `npm run start:worker`
- papel: processamento assincrono e filas pesadas

## Infra principal

- banco: PostgreSQL
- fila/cache: Redis
- filas: BullMQ
- storage governado: S3 ou equivalente via modulo de storage
- observabilidade base: logs estruturados JSON

## Processos importantes

### Web API

- health leve: `GET /health/public`
- health de prontidao: `GET /health`

### Worker

- processa jobs assincronos
- importante em fluxos como importacao documental

## Tema e UI

O frontend ja tem uma base visual centralizada:

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

Essa base define:

- fundo branco dominante
- sidebar clara
- cards brancos com borda suave
- azul corporativo controlado
- classes utilitarias enterprise

## Fluxos estruturais que ja foram endurecidos

- contrato explicito de disponibilidade de PDF final
- importacao documental assincrona
- idempotencia formal na importacao
- trilha forense append-only para eventos criticos
- lock/read-only em documentos fechados
- videos governados restritos a DDS, RDO e Inspecao

## Documentacao relacionada

- `README.md`
- `backend/README.md`
- `docs/architecture/README.md`
- `docs/architecture/AUDIT-2026-03-remediation-roadmap.md`
