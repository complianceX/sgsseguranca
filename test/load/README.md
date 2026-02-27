# Load Test - 50 Empresas (k6)

Este teste valida capacidade do backend para operar com multiplas empresas ativas.

## 1) Pre-requisitos

- k6 instalado: https://k6.io/docs/get-started/installation/
- URL do backend online (ex.: Railway)
- Usuarios validos para login

## 2) Variaveis de ambiente

Obrigatorias:

- `BASE_URL` (ex.: `https://seu-backend.up.railway.app`)
- `K6_USERS_JSON` com lista de usuarios de teste

Exemplo de `K6_USERS_JSON`:

```json
[
  {"cpf":"15082302698","password":"GANDRA2026","companyId":"empresa-1"},
  {"cpf":"00000000000","password":"admin","companyId":"empresa-2"}
]
```

Observacao: idealmente use 50 usuarios/empresas para representar o cenario real.

## 3) Perfis de teste

- `smoke`: validacao rapida
- `baseline`: cenario principal para 50 empresas
- `stress`: pressao acima do baseline

## 4) Comandos

PowerShell:

```powershell
$env:BASE_URL="https://seu-backend.up.railway.app"
$env:TEST_PROFILE="baseline"
$env:K6_USERS_JSON='[{"cpf":"15082302698","password":"GANDRA2026","companyId":"empresa-1"}]'
k6 run test/load/k6-50-companies.js
```

Bash:

```bash
BASE_URL="https://seu-backend.up.railway.app" \
TEST_PROFILE="baseline" \
K6_USERS_JSON='[{"cpf":"15082302698","password":"GANDRA2026","companyId":"empresa-1"}]' \
k6 run test/load/k6-50-companies.js
```

## 5) Criterios de aprovacao (baseline)

- `http_req_failed < 5%`
- `http_req_duration p95 < 1500ms`
- `login_duration p95 < 1200ms`
- `dashboard_duration p95 < 1500ms`
- Sem reinicio/crash do backend durante o teste

## 6) Leitura do resultado

Se os thresholds passarem no baseline, seu sistema esta apto para operar 50 empresas com margem.
Se falhar:

1. Aumentar recursos (CPU/RAM) do backend e banco.
2. Revisar indices de banco e queries mais lentas.
3. Reduzir trabalho sincrono em login/dashboard (cache e filas).

