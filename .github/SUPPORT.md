# Support

Use este guia para escolher o canal correto e evitar exposicao de dados sensiveis.

## Onde abrir cada demanda

- **Bug:** comportamento incorreto reproduzivel no produto.
- **Feature request:** nova capacidade, melhoria de UX ou ajuste de fluxo.
- **Incident report:** problema em producao com impacto real.
- **Security report:** vulnerabilidade ou risco de seguranca, sempre por canal privado.

## Canais

- **Issues do GitHub:** bugs, melhorias e incidentes sem dados sensiveis.
- **Security Advisory:** vulnerabilidades e riscos de seguranca.
- **Documentacao operacional:**
  - [README.md](../README.md)
  - [backend/docs/RUNBOOK_PRODUCTION.md](../backend/docs/RUNBOOK_PRODUCTION.md)
  - [backend/docs/OBSERVABILITY.md](../backend/docs/OBSERVABILITY.md)

## Escopo minimo de um chamado

Inclua:

- contexto objetivo do problema;
- modulo, tenant/site impactado e ambiente;
- passos de reproducao ou timeline do incidente;
- evidencia tecnica redigida: `requestId`, `traceId`, deployId, timestamp, status code;
- impacto percebido em operacao, SST, dashboard, documentos ou usuarios.

## Boas praticas

- Nao publique segredos, tokens, cookies ou credenciais.
- Nao publique CPF, dados medicos, assinaturas, documentos pessoais ou payloads brutos.
- Informe timezone em datas e horarios.
- Prefira evidencias tecnicas redigidas a prints com dados pessoais.
