# Troubleshooting

## Frontend sobe, mas nao autentica

Verifique:

- `frontend/.env.local`
- URL da API
- CORS do backend
- cookies/sessao

Se o frontend estiver em `localhost` e a API em outro dominio, problemas de CORS podem parecer bug de UI quando na verdade sao bloqueio de ambiente.

## Backend nao sobe

Verifique:

- `backend/.env`
- conexao com PostgreSQL
- conexao com Redis
- `GET /health/public`
- logs de startup

## Lint/build falham no frontend

Verifique:

- imports quebrados
- tokens/classes fora do padrao
- variaveis de ambiente obrigatorias do build

## Lint/build falham no backend

Verifique:

- DTOs
- imports de modulo
- decorators do Nest
- erros de TypeORM/entity

## Documento travado ainda altera

Audite os dois lados:

- frontend: estado read-only, fieldset, handlers laterais
- backend: service do modulo, regras de lock e mutacoes indiretas

## Video nao sobe

Verifique:

- modulo suportado: somente DDS e RDO
- MIME permitido
- tamanho maximo
- lock/read-only do documento
- storage configurado

## Video aparece onde nao devia

Audite:

- `frontend/components/document-videos/`
- integracao do formulario
- service do modulo
- backend `document-videos`

## Importacao documental fica presa

Verifique:

- worker rodando
- Redis disponivel
- status da operacao
- estado da fila
- idempotency key e file hash

## E-mail nao envia

Verifique nesta ordem:

1. existe servico `Worker` rodando em producao
2. o `Worker` esta subindo com:
   - `npm run start:worker`
3. a fila `mail` esta sendo consumida
4. o provedor ativo de envio
5. se a Brevo API esta aceitando o IP de saida atual do Railway

Diagnostico atual do projeto:

- o backend apenas enfileira o envio
- o processamento real acontece no `Worker`
- o fluxo canonico atual usa `BREVO_API_KEY`, portanto o provedor principal e a Brevo API
- SMTP so deve ser tratado como contingencia, nao como caminho principal de producao

Como saber qual provedor esta ativo:

- se existir `BREVO_API_KEY`, o `MailService` prioriza Brevo API
- sem `BREVO_API_KEY` e com `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_PORT` e `MAIL_SECURE`, o sistema usa SMTP

O que checar no Railway:

- servico `Backend`
- servico `Worker`
- variaveis:
  - `BREVO_API_KEY`
  - `MAIL_HOST`
  - `MAIL_PORT`
  - `MAIL_USER`
  - `MAIL_PASS`
  - `MAIL_SECURE`
  - `MAIL_FROM_EMAIL`
  - `MAIL_FROM_NAME`

O que checar na Brevo:

- `Security > Authorised IPs`
- se o IP de saida do Railway apareceu como nao autorizado
- se o IP foi realmente movido para a lista de autorizados

Sintomas comuns e causa raiz:

- request `201` no backend, PDF salvo e job criado, mas o e-mail nao chega
  - normalmente indica fila/worker ou falha do provedor, nao problema do PDF
- log com `Brevo bloqueou o IP de saída do servidor (...)`
  - causa raiz: IP atual do Railway nao autorizado em `Brevo > Security > Authorised IPs`
- log com `Circuit breaker integration:brevo_email is OPEN`
  - a integracao entrou em protecao apos falhas consecutivas; aguarde a janela de reset e confirme os IPs autorizados
- job `queued` com `attemptsMade = 0`
  - normalmente indica que o `Worker` nao esta consumindo a fila
- job falhado apos consumir a fila
  - normalmente indica problema real no provedor (Brevo/IP, timeout ou credencial)

Se houver jobs antigos com falha:

- eles nao se reenviam automaticamente depois que esgotam as tentativas
- depois da correcao, crie um novo envio para validar o fluxo
- so depois disso vale reprocessar manualmente os jobs falhados

Onde olhar no codigo:

- `backend/src/mail/mail.service.ts`
- `backend/src/mail/mail.controller.ts`
- `backend/src/mail/mail.processor.ts`
- `backend/src/worker.module.ts`

## PDF final indisponivel

Quando o documento esta registrado mas sem URL assinada, o contrato pode indicar algo como `registered_without_signed_url`. Isso normalmente aponta para problema de storage ou emissao de signed URL, nao necessariamente ausencia do documento.

## Tema visual parece antigo ou inconsistente

Audite:

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- componentes que ainda usam classes antigas muito especificas
