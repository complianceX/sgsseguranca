# Support

## Quando abrir cada tipo de chamado

- **Bug**: comportamento incorreto reproduzivel no produto.
- **Feature request**: nova capacidade, melhoria de UX ou ajuste de fluxo.
- **Incident report**: problema em producao com impacto real (indisponibilidade/degradacao).
- **Security report**: vulnerabilidade ou risco de seguranca (usar canal privado).

## Canais

- **Issues do GitHub**: backlog de bugs, melhorias e incidentes.
- **Security Advisory (privado)**: reporte de vulnerabilidades.
- **Documentacao operacional**:
  - `README.md`
  - `backend/docs/RUNBOOK_PRODUCTION.md`
  - `backend/docs/OBSERVABILITY.md`

## Escopo minimo esperado no chamado

- Contexto objetivo do problema
- Passos de reproducao ou timeline do incidente
- Evidencia tecnica (requestId/traceId/deployId/timestamp)
- Impacto em tenant/modulo/site (sem expor PII)

## Boas praticas

- Nao publicar segredos, tokens ou credenciais
- Nao publicar dados pessoais de usuarios/trabalhadores
- Sempre informar timezone nas datas/horarios
