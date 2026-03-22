# Comandos e Validacao

## Frontend

### Rodar local

```bash
cd frontend
npm install
npm run dev
```

### Validar

```bash
cd frontend
npm run lint
npm run build
npm test
```

## Backend

### Rodar local

```bash
cd backend
npm install
npm run start:dev
```

### Worker

```bash
cd backend
npm run start:worker
```

### Validar

```bash
cd backend
npm run lint
npm run build
npm test
```

## Health checks

- web liveness: `GET /health/public`
- web readiness: `GET /health`

## Comandos uteis do backend

### Migrations

```bash
cd backend
npm run migration:run
npm run migration:revert
npm run release:migrate
```

### OpenAPI

```bash
cd backend
npm run openapi:export
npm run openapi:export:governed
```

### Smoke tests

```bash
cd backend
npm run test:smoke
```

## Regra pratica de validacao

Quando fizer mudanca relevante:

1. rode lint
2. rode build
3. rode testes
4. se o fluxo for visual/importante, valide tambem no browser real

## Diagnostico rapido

Se algo nao sobe:

- confira `frontend/.env.local`
- confira `backend/.env`
- confira se banco e Redis estao disponiveis
- confira se a API responde em `/health/public`
- confira se o frontend esta apontando para a URL correta da API

## Dica de trabalho

Para descobrir rapidamente se um problema esta no frontend ou no backend:

- se a UI nao renderiza ou quebra antes da chamada HTTP, comece no frontend
- se a UI chama a API mas recebe erro, comece no backend
- se envolve lock, permissao, tenant ou storage, assuma que o backend precisa ser auditado
