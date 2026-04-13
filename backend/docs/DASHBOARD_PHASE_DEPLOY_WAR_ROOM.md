# Dashboard Phase Deploy War Room

Checklist direto para executar o deploy desta fase hoje.

## 1. Donos

- Responsavel backend-web
- Responsavel backend-worker
- Responsavel banco/Redis
- Responsavel validacao funcional

## 2. T-30 min

- Confirmar backup/log de recovery do banco
- Confirmar Redis operacional
- Confirmar `CORS_ALLOWED_ORIGINS`
- Confirmar `VALIDATION_TOKEN_SECRET`
- Confirmar `JWT_SECRET` e `JWT_REFRESH_SECRET`
- Confirmar `DATABASE_SSL=true`
- Confirmar `DATABASE_SSL_CA` ou aceite formal do fallback temporario

## 3. T-15 min

Executar:

```bash
npm run build
npm run smoke:db:readonly
npm run verify:rls
```

Critico:

- `smoke:db:readonly` deve passar
- `verify:rls` deve passar
- se houver fallback TLS no banco, registrar como risco operacional

## 4. T-10 min

Aplicar envs no provedor:

- `backend-web`
- `backend-worker`

Referencia:

- [DASHBOARD_PHASE_PRODUCTION_CUTOVER.md](C:/Users/User/Documents/trae_projects/sgs-seguraca/backend/docs/DASHBOARD_PHASE_PRODUCTION_CUTOVER.md)

## 5. T-5 min

Executar migration:

```bash
npm run migration:run
```

Nao prosseguir se migration falhar.

## 6. T0

Subir `backend-web`.

Validar imediatamente:

```bash
curl https://api.sgsseguranca.com.br/health/public
curl https://api.sgsseguranca.com.br/health
```

Depois subir `backend-worker`.

## 7. T+5 min

Smoke obrigatorio:

1. login real
2. `GET /dashboard/summary`
3. `GET /dashboard/kpis`
4. `GET /dashboard/pending-queue`
5. `GET /dashboard/document-pendencies?page=1&limit=20`
6. `POST /dashboard/invalidate` para `summary`
7. `POST /dashboard/invalidate` para `kpis`
8. `POST /dashboard/invalidate` para `pending-queue`

## 8. T+10 min

Checar logs e metricas:

- sem `Redis unavailable`
- sem `bootstrap_failed`
- sem `db_slow_query` recorrente em RBAC
- sem erro de RLS
- sem crescimento anormal de 5xx

## 9. T+20 min

Rodar smoke curto de carga:

```bash
npm run loadtest:login:smoke
```

Esperado:

- login sem falha de CSRF
- sem 429 anormal
- sem 5xx

## 10. Decisao go/no-go

Go se:

- health ok
- login ok
- dashboard ok
- worker ok
- filas ok
- sem erro de isolamento multi-tenant

No-go se:

- login quebrar
- dashboard retornar erro
- worker nao consumir
- Redis indisponivel
- banco com falha TLS ou latencia fora de controle

## 11. Rollback

Rollback imediato:

1. reverter release de `backend-web`
2. reverter release de `backend-worker`
3. limpar cache do dashboard se necessario
4. validar novamente:

```bash
curl https://api.sgsseguranca.com.br/health/public
curl https://api.sgsseguranca.com.br/health
```

## 12. Observacao pratica

O codigo desta fase esta pronto.

Os dois alertas reais para hoje sao:

- segredos/envs corretas no provedor
- TLS do Postgres/Supabase sem fallback inseguro permanente
