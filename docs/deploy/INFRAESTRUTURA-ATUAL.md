# Infraestrutura atual do SGS

**Fonte de verdade operacional — verificada em 2026-08-15**

Este documento separa produção, load test e infraestrutura histórica. Não contém
tokens, senhas, chaves privadas ou valores de variáveis sensíveis.

## Produção

| Componente | Plataforma | Estado/contrato |
|---|---|---|
| Frontend | Vercel | Deploy manual; alias `app.sgsseguranca.com.br` |
| API web | Hostinger VPS + Coolify | App `backend-web`; domínio `api.sgsseguranca.com.br` |
| Worker | Hostinger VPS + Coolify | App separado `backend-worker`; sem domínio público |
| Redis | Container self-hosted `sgs-redis` na mesma VPS | Rede Docker interna `coolify`; não público |
| ClamAV | Container self-hosted na mesma VPS | Rede Docker interna `coolify` |
| PostgreSQL | Neon | Região São Paulo; acesso direto para operações DDL |
| Storage oficial | Backblaze B2 compatível com S3 | PDFs, anexos e vídeos governados |
| Observabilidade | Sentry, OpenTelemetry, Prometheus/Grafana | Conforme variáveis de cada serviço |

### Hostinger/Coolify

- VPS: `179.198.107.5`, hostname `srv1870554`.
- Painel Coolify: `http://179.198.107.5:8000`.
- Projeto: `My first project` (`k4tvj4jbsu1vc7jqggwzvv1f`).
- Environment: `production` (`r2j049cg1r2ocoi4lx57xzuj`).
- Server no Coolify: `localhost` (`sa80fcnx6zqhdeyypcyge6oc`).
- Web: `s2jgvkq9trtm8c9itahmn7og`.
- Worker: `x3k7efj1x3pcl4ipcuswwmll`.

Web e worker usam o mesmo repositório/branch de produção, mas são aplicações
Coolify independentes. Deploys devem ser feitos um por vez e só o próximo deve
ser disparado após o anterior terminar (`finished` ou `failed`). Migrations são
manuais e não rodam no boot.

## Load test isolado

O ambiente de carga não usa produção, Neon, B2 de produção, Redis de produção ou
credenciais de produção.

| Item | Valor operacional |
|---|---|
| VPS | `83.229.115.37` (`sgs-loadtest`) |
| Usuário SSH | `sgsops` |
| Chave local | `C:\Users\User\.ssh\sgs-loadtest-vps_ed25519` |
| Projeto remoto | `/opt/sgs-loadtest` |
| Domínio | `https://api-loadtest.sgsseguranca.com.br` |
| Aplicação | `APP_ENV=loadtest` |
| Banco | `sgs_loadtest` |
| Tenant sintético | `00000000-0000-4000-8000-000000000001` |
| Proteção de borda | `X-Loadtest-Key`, somente via secret local da VPS/Grafana |

Containers esperados:

- `postgres-loadtest`
- `redis-loadtest`
- `api-loadtest`
- `proxy-loadtest`
- `edge-loadtest`

O guard `infra/load-test/scripts/guard-environment.mjs` deve continuar bloqueando
produção, Neon, Upstash, B2 e bancos fora de `sgs_loadtest`. Nunca remover esse
guard para acelerar uma campanha.

### Evidências de carga já concluídas

Registradas em `docs/auditoria/2026-08-13-loadtest-vs-producao.md`:

- spike: 25 VUs por 60 segundos, aprovado;
- stress: 20 VUs por 3 minutos, aprovado;
- soak: 5 VUs por 10 minutos, aprovado.

A campanha autenticada Grafana de 10 VUs possui script preparado em
`tests/load/grafana/03-auth-load-10vus.js`, mas só deve ser considerada concluída
com Run ID e resumo oficial do Grafana Cloud.

## Local e CI

- Compose local de integração: `backend/docker-compose.test.yml`.
- Compose do load test: `infra/load-test/compose.yml`.
- CI: `.github/workflows/ci.yml` e `.github/workflows/security-scan.yml`.
- Smoke/load scripts: `tests/load/` e `backend/test/load/`.
- Frontend: `frontend/`, publicado manualmente na Vercel.

## Infraestrutura histórica — não usar

- Vultr API: `216.238.99.177`.
- Vultr worker: `216.238.127.254`.
- Integrator: `216.22.43.246`.
- Railway, Render, Cloudflare R2 e Upstash aparecem somente em documentação e
  histórico de migração; não são o runtime atual.

## Regras de operação

1. Confirmar o alvo antes de qualquer teste ou deploy.
2. Para carga, exigir `APP_ENV=loadtest`, banco `sgs_loadtest` e tenant sintético.
3. Não usar secrets de produção em scripts, logs, tags ou relatórios.
4. Não executar deploys concorrentes no Coolify.
5. Após qualquer alteração, validar SHA, health público, worker heartbeat e logs
   sem expor PII ou credenciais.

## Documentos relacionados

- [Hostinger + Coolify](./hostinger-coolify-infra-atual.md)
- [Operação de produção](./COMO-COLOCAR-EM-PRODUCAO.md)
- [Load test isolado](../../infra/load-test/README.md)
- [Auditoria loadtest versus produção](../auditoria/2026-08-13-loadtest-vs-producao.md)
