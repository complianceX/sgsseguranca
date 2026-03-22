# Variaveis de Ambiente no Railway

Este guia resume como o projeto esta configurado no Railway e quais variaveis sao:

- obrigatorias para o runtime
- opcionais por feature
- usadas so para o grafo visual do Railway
- gerenciadas pela propria plataforma

## Topologia correta

O desenho esperado e este:

- Frontend -> Backend
- Backend -> Postgres
- Backend -> Redis

O frontend nao deve ter acesso direto a Postgres nem Redis.

## Frontend

### Obrigatorias

- `NEXT_PUBLIC_API_URL`
  URL publica explicita da API consumida pelo frontend.

- `NEXT_PUBLIC_APP_URL`
  URL publica do proprio frontend. E usada para links absolutos, validacoes server-side e geracao de URLs fora do navegador.

- `NEXT_PUBLIC_SITE_URL`
  Alias funcional do endereco publico do frontend. Mantem compatibilidade com partes do sistema que ainda leem esse nome.

### Opcionais por feature

- `NEXT_PUBLIC_FEATURE_AI_ENABLED`
  Liga ou desliga a experiencia assistida no frontend.

- `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`
- `NEXT_PUBLIC_ELEVENLABS_BRANCH_ID`
  So sao necessarias se a integracao de voz/agent estiver em uso.

### Usadas so para o grafo do Railway

- `BACKEND_SERVICE_REFERENCE`
  Referencia explicita ao servico Backend para ajudar o Railway a desenhar a linha entre Frontend e Backend.

### Gerenciadas pelo Railway

- `RAILWAY_ENVIRONMENT`
- `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_ENVIRONMENT_NAME`
- `RAILWAY_PRIVATE_DOMAIN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_PROJECT_NAME`
- `RAILWAY_PUBLIC_DOMAIN`
- `RAILWAY_SERVICE_BACKEND_URL`
- `RAILWAY_SERVICE_FRONTEND_URL`
- `RAILWAY_SERVICE_ID`
- `RAILWAY_SERVICE_NAME`
- `RAILWAY_STATIC_URL`

Essas variaveis nao devem ser tratadas como configuracao de negocio do app.

## Backend

### Obrigatorias para runtime principal

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
  Conexao principal com Postgres.

- `DATABASE_SSL`
- `DATABASE_SSL_ALLOW_INSECURE`
  Mantem a estrategia de SSL compativel com o ambiente atual.

- `REDIS_URL`
  Conexao principal com Redis.

- `REDIS_PUBLIC_URL`
  Fallback/compatibilidade para cenarios onde a URL publica ainda e usada.

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
  Segredos obrigatorios da autenticacao.

- `CORS_ALLOWED_ORIGINS`
  Lista de origens permitidas no ambiente publicado.

### Obrigatorias para governanca documental

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`
- `AWS_REGION`
- `AWS_ENDPOINT`

Essas variaveis sustentam o storage governado oficial. PDFs finais oficiais, videos governados e outros artefatos documentais devem ficar nesse storage, nao em fallback local.

### Opcionais por feature

- `MAIL_ENABLED`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_SECURE`
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM_NAME`
- `MAIL_FROM_EMAIL`
- `BREVO_API_KEY`
  Necessarias para envio de email e alertas por email.

- `FEATURE_AI_ENABLED`
- `AI_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_REASONING_EFFORT`
- `ANTHROPIC_API_KEY`
  Necessarias para fluxos assistidos/IA.

- `DEV_ADMIN_CPF`
- `DEV_ADMIN_PASSWORD`
  Conveniencias operacionais. Exigem cuidado extra em producao.

- `REDIS_DISABLED`
- `REDIS_FAIL_OPEN`
  Controle operacional de degradacao.

- `SMTP_EMAIL_TIMEOUT_MS`
  Ajuste fino do timeout do email.

### Usadas so para o grafo do Railway

- `POSTGRES_SERVICE_REFERENCE`
  Referencia explicita ao Postgres para reforcar a linha Backend -> Postgres no canvas do Railway.

- `REDIS_SERVICE_REFERENCE`
  Referencia explicita ao Redis para reforcar a linha Backend -> Redis no canvas do Railway.

### Gerenciadas pelo Railway

- `RAILWAY_ENVIRONMENT`
- `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_ENVIRONMENT_NAME`
- `RAILWAY_PRIVATE_DOMAIN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_PROJECT_NAME`
- `RAILWAY_PUBLIC_DOMAIN`
- `RAILWAY_SERVICE_BACKEND_URL`
- `RAILWAY_SERVICE_FRONTEND_URL`
- `RAILWAY_SERVICE_ID`
- `RAILWAY_SERVICE_NAME`
- `RAILWAY_STATIC_URL`

Tambem nao devem ser tratadas como configuracao de negocio.

## Variaveis legadas/removidas nesta limpeza

Estas deixaram de ser necessarias como configuracao customizada principal no Backend:

- `DATABASE_URL`
- `DATABASE_PUBLIC_URL`

O runtime agora esta alinhado prioritariamente em variaveis individuais de banco (`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`), o que deixa o ambiente mais previsivel e mais coerente com o grafo de servicos.

Tambem foram removidas variaveis redundantes ou sem uso operacional atual:

- Backend:
  - `NEXT_PUBLIC_FEATURE_AI_ENABLED`
  - `ANTHROPIC_API_KEY`
  - `ELEVENLABS_AGENT_ID`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_BRANCH_ID`
  - `DEV_ADMIN_CPF`
  - `DEV_ADMIN_PASSWORD`
  - `AI_PROVIDER`

- Frontend:
  - `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`
  - `NEXT_PUBLIC_ELEVENLABS_BRANCH_ID`

Essas variaveis nao tinham papel real no runtime atual publicado.

No caso de `DEV_ADMIN_CPF` e `DEV_ADMIN_PASSWORD`, a remocao foi segura porque:

- o ambiente atual e de producao
- `DEV_LOGIN_BYPASS` nao estava habilitado
- `ALLOW_DEV_LOGIN_BYPASS` nao estava habilitado
- `SEED_ON_BOOTSTRAP` nao estava habilitado

Ou seja, elas nao estavam exercendo funcao operacional real no ambiente publicado.

## O que manter e o que nao mexer sem necessidade

### Manter

- as variaveis `NEXT_PUBLIC_*` que o frontend realmente usa
- as variaveis `DATABASE_*`, `REDIS_*`, `JWT_*`, `AWS_*`
- as referencias `BACKEND_SERVICE_REFERENCE`, `POSTGRES_SERVICE_REFERENCE`, `REDIS_SERVICE_REFERENCE` se voce quiser manter o grafo visual do Railway

### Nao mexer sem necessidade

- variaveis `RAILWAY_*`
- segredos de autenticacao
- credenciais de storage/email/IA sem rotacao planejada

## Regra pratica

Se a variavel:

- e lida pelo codigo: ela e runtime
- nao e lida pelo codigo, mas aponta para outro servico: ela pode ser so de grafo/organizacao
- comeca com `RAILWAY_`: quase sempre e da plataforma

## Quando revisar de novo

Vale fazer uma nova auditoria quando:

- entrar novo servico no Railway
- migrar email, storage ou IA
- mudar dominio publico do frontend/backend
- surgir suspeita de variavel duplicada ou sem uso

## Resumo enxuto por servico

### Frontend - obrigatorias

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`

### Frontend - opcionais

- `NEXT_PUBLIC_FEATURE_AI_ENABLED`

### Frontend - apoio visual do Railway

- `BACKEND_SERVICE_REFERENCE`

### Frontend - nao mexer

- `RAILWAY_*`

### Backend - obrigatorias

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `DATABASE_SSL`
- `DATABASE_SSL_ALLOW_INSECURE`
- `REDIS_URL`
- `REDIS_PUBLIC_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`
- `AWS_REGION`
- `AWS_ENDPOINT`

### Backend - opcionais por feature

- `MAIL_ENABLED`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_SECURE`
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM_NAME`
- `MAIL_FROM_EMAIL`
- `BREVO_API_KEY`
- `FEATURE_AI_ENABLED`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_REASONING_EFFORT`
- `REDIS_DISABLED`
- `REDIS_FAIL_OPEN`
- `SMTP_EMAIL_TIMEOUT_MS`

### Backend - apoio visual do Railway

- `POSTGRES_SERVICE_REFERENCE`
- `REDIS_SERVICE_REFERENCE`

### Backend - nao mexer

- `RAILWAY_*`

### Pode apagar depois so com nova auditoria

- `REDISUSER`
- `RAILWAY_SERVICE_BACKEND_URL`
- `RAILWAY_SERVICE_FRONTEND_URL`

Essas ainda ficaram no ambiente, mas nao devem ser removidas automaticamente sem uma rodada final de confirmacao, porque algumas podem ser injetadas pela plataforma ou reaproveitadas por convencao operacional.
