# Load Test (k6)

Este diretório expõe os comandos operacionais de carga no caminho padrão `test/load`.

## Scripts

- `test/load/k6-load-test.js`
: suíte principal (login, dashboard, paginação APR, criação de APR, Sophie).
- `test/load/seed-tenants.ts`
: seed de carga (100 tenants, 500 APRs por tenant).
- `test/load/k6-50-companies.js`
: cenário legado de baseline simplificado.

## Pré-requisitos

- `k6` instalado: <https://k6.io/docs/get-started/installation/>
- backend e banco ativos
- dependências do backend instaladas (`npm install` em `backend/`)

## Seed de massa

PowerShell:

```powershell
cd backend
node ./node_modules/ts-node/dist/bin.js -r tsconfig-paths/register ../test/load/seed-tenants.ts
```

## Execução da suíte principal

PowerShell:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:K6_SCENARIO_PROFILE="baseline"  # smoke | baseline | stress
k6 run test/load/k6-load-test.js
```

## Thresholds esperados (baseline)

- `http_req_duration{name:dashboard}`: `p(95) < 500ms`
- `http_req_duration{name:create_apr}`: `p(95) < 1000ms`
- `http_req_failed`: `rate < 0.01`

Interpretação rápida:

- verde: todos os thresholds passaram
- amarelo: p99 muito acima do p95 (outliers e gargalos intermitentes)
- vermelho: falha de threshold (investigar DB, filas, integração externa)
