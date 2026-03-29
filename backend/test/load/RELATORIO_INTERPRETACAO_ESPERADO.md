# RELATORIO_INTERPRETACAO_ESPERADO

## 1) Como identificar capacidade real de entrada (login)

Use o resultado do `login-load.js` por patamar de taxa:
- 10, 25, 50, 75, 100, 150, 200 logins/s.

Classificacao inicial (referencia):
- Estavel: `http_req_failed < 1%` e `p95 < 800ms` e `dropped_iterations ~ 0`
- Alerta: `p95 800-1500ms` com falha ainda controlada
- Degradado: `p95 > 1500ms` ou `http_req_failed >= 1%` ou crescimento forte de `dropped_iterations`

Capacidade operacional inicial = ultimo patamar estavel antes da degradacao.

## 2) Leitura das metricas do K6

Prioridade de leitura:
1. `http_req_failed`
2. `http_req_duration` p50/p95/p99 (tag `endpoint:auth_login`)
3. `dropped_iterations`
4. `login_success_rate` e `auth_flow_success_rate`
5. `login_rate_limited_rate` e contagem de status 429

Interpretacao rapida:
- `p95` sobe e `p99` explode -> fila interna/contencao.
- `dropped_iterations` sobe com `maxVUs` no teto -> gerador sem folga para sustentar arrival-rate.
- `429` dominante -> limite de protecao (throttle/bruteforce), nao gargalo puro de CPU/DB.

## 3) Como diferenciar gargalo por camada

### Node/NestJS
Sinais:
- CPU alta no processo app
- aumento de latencia sem erro claro de DB
- event loop lag alto
- tempo de resposta cresce em todas as rotas de auth

Coletar:
- CPU/RAM por instancia
- event loop lag
- GC pausas
- saturacao de worker threads (bcrypt/argon2/jwt/crypto)

### PostgreSQL
Sinais:
- aumento de `auth_login` + queries lentas
- pool esgotado/waits de conexao
- lock/wait em consultas de usuario/sessao

Coletar:
- conexoes ativas x max
- wait events
- tempo medio/p95 de queries de auth
- locks e deadlocks

### Redis (throttle/bruteforce/sessoes)
Sinais:
- aumento de latencia em comandos GET/SET/EVAL
- timeouts Redis
- mais 429/503 por protecoes e fallback de seguranca

Coletar:
- redis command latency
- ops/sec
- memoria/evictions
- logs do brute force e throttle

### Infra Railway
Sinais:
- restart de container
- CPU throttling/plano insuficiente
- erro 5xx sem correlacao clara no app

Coletar:
- CPU/RAM/restarts na plataforma
- tempo de rede externo
- limites de instancia/plano

## 4) Resultado esperado por rodada

No fim de cada rodada, registre:
- taxa alvo (req/s)
- throughput real atingido
- p50/p95/p99 login
- falha total
- percentual de 429
- dropped_iterations
- conclusao: estavel / alerta / degradado

Modelo de decisao:
- se 100 req/s estavel e 150 req/s degradado -> capacidade inicial pratica ~100 req/s.
- valide com `login-soak.js` no patamar escolhido por 60 min.

## 5) Proximos passos apos login

Depois de fechar capacidade de entrada:
1. repetir com `CALL_AUTH_ME=true` para validar sessao no mesmo fluxo
2. adicionar cenarios `auth/refresh`
3. expandir para dashboard e rotas principais
4. executar com massa multi-tenant realista
