# ADR-002: Refresh Token Rotation com Reuse Detection Atômico
Status: Accepted | Date: 2026-03-24

## Contexto
Sessões longas em SaaS multi-tenant exigem controle forte de sequestro de sessão. O fluxo de refresh precisa impedir replay de token antigo e suportar revogação em massa.

No sistema atual:
- Auth usa access token curto + refresh token
- Refresh é armazenado no Redis por hash
- Regras de sessão vivem em `AuthService` + `RedisService`

## Decisão
Adotamos rotação de refresh token com consumo atômico em Redis via Lua:

- `atomicConsumeRefreshToken()` faz `GET + DEL + SREM + SETEX(tombstone)` em uma única execução
- Se token já consumido reaparece, tratamos como reuse/suspeita de hijacking
- Em reuse detectado, revogamos todas as sessões do usuário (`clearAllRefreshTokens`)

A escolha por Lua garante atomicidade sem race condition entre requisições concorrentes.

## Consequências (prós e contras)
Prós:
- Reduz janela de replay de refresh token
- Detecta uso indevido de token já rotacionado
- Revogação centralizada e rápida por usuário

Contras:
- Dependência de Redis saudável para melhor proteção
- Complexidade maior que sessão stateful simples
- Exige observabilidade para eventos de reuse

## Alternativas consideradas
- Sessão stateful tradicional em banco
: maior latência e lock contention em alta concorrência.
- Rotação sem atomicidade (GET/DEL separado)
: vulnerável a condição de corrida.
- JWT longo sem refresh rotation
: risco de comprometimento por tempo excessivo.
