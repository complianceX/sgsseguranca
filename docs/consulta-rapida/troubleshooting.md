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

- modulo suportado: somente DDS, RDO e Inspecao
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
5. se as credenciais SMTP autenticam corretamente

Diagnostico atual do projeto:

- o backend apenas enfileira o envio
- o processamento real acontece no `Worker`
- o sistema hoje usa SMTP quando `BREVO_API_KEY` nao existe
- se `BREVO_API_KEY` voltar ao ambiente, a prioridade muda e o sistema volta a tentar Brevo API

Como saber qual provedor esta ativo:

- se existir `BREVO_API_KEY`, o `MailService` prioriza Brevo API
- sem `BREVO_API_KEY` e com `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_PORT` e `MAIL_SECURE`, o sistema usa SMTP

O que checar no Railway:

- servico `Backend`
- servico `Worker`
- variaveis:
  - `MAIL_HOST`
  - `MAIL_PORT`
  - `MAIL_USER`
  - `MAIL_PASS`
  - `MAIL_SECURE`
  - `MAIL_FROM_EMAIL`
  - `MAIL_FROM_NAME`
- ausencia de `BREVO_API_KEY` se a estrategia atual for SMTP

Se houver jobs antigos com falha:

- eles nao se reenviam automaticamente
- depois da correcao, crie um novo envio para validar o fluxo

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
