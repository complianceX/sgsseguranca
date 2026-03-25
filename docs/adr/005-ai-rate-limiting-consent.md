# ADR-005: Consentimento LGPD e Rate Limiting para IA (Sophie)
Status: Accepted | Date: 2026-03-24

## Contexto
O módulo de IA processa texto operacional que pode conter dados sensíveis do contexto SST. Era necessário combinar controle legal (consentimento) com proteção operacional (rate limiting e degradacão segura).

## Decisão
Aplicamos dupla barreira em endpoints de IA:

- `AiConsentGuard`: bloqueia acesso quando `users.ai_processing_consent = false`
- Rate limiting por usuário/rota com Redis (`UserRateLimitService` + `@UserThrottle`)

Fluxo de proteção:
1. feature flag de IA
2. autenticação JWT
3. consentimento explícito LGPD
4. tenant guard + RBAC
5. limite por usuário e rota

Também há fallback de indisponibilidade para OpenAI via circuit breaker (`OpenAiCircuitBreakerService`), reduzindo cascata de timeout.

## Consequências (prós e contras)
Prós:
- Conformidade prática (consent gate em runtime)
- Proteção contra abuso e saturação de IA
- Melhor previsibilidade do custo e da UX em instabilidade externa

Contras:
- Mais verificações por request (pequeno overhead)
- Dependência de Redis para enforcement ideal do rate limiting
- Exige comunicação clara de erro para usuário final (403/429/503)

## Alternativas consideradas
- Consentimento apenas em UI
: rejeitado, backend deve ser autoridade final.
- Rate limiting apenas por IP
: rejeitado para SaaS autenticado multi-tenant (menos preciso).
- Sem circuit breaker
: rejeitado por degradar UX e recursos em falha externa prolongada.
