# Consulta Rapida do Sistema

Esta pasta foi criada para servir como base de consulta local, com respostas curtas e objetivas sobre o sistema.

Para qualquer correção, teste ou decisão de promoção, siga primeiro [`../OPERACAO-CANONICA-SGS.md`](../OPERACAO-CANONICA-SGS.md). Esta pasta é consulta de domínio, não substitui o processo operacional.

Use estes arquivos como ponto de partida:

- [visao-geral.md](./visao-geral.md): o que o sistema e, como ele esta dividido e quais blocos sao mais importantes
- [../architecture/README.md](../architecture/README.md): stack, runtime, processos e infraestrutura principal
- [../architecture/rotas-e-endpoints.md](../architecture/rotas-e-endpoints.md): desenho macro da arquitetura e mapa completo de rotas do frontend e backend
- [frontend-operacional.md](./frontend-operacional.md): como o frontend esta organizado e onde tocar em UI
- [backend-operacional.md](./backend-operacional.md): como o backend esta organizado e onde tocar em API e dominio
- [onde-fica-cada-coisa.md](./onde-fica-cada-coisa.md): mapa rapido de arquivos e pastas
- [mapa-de-modulos.md](./mapa-de-modulos.md): mapa dos modulos principais do produto
- [modulos-e-regras.md](./modulos-e-regras.md): modulos principais, regras de governanca e pontos que ja foram endurecidos
- [../architecture/fluxos-documentais.md](../architecture/fluxos-documentais.md): PDF final, importacao, assinatura, registry, videos e trilha
- [disaster-recovery-e-backup.md](./disaster-recovery-e-backup.md): backup, proteção do storage, restore, recovery separado, scanner de integridade, runbook e metas iniciais de RPO/RTO
- [implementacoes-recentes.md](./implementacoes-recentes.md): histórico de mudanças; não é o manual operacional atual
- [pdfs-finais-e-storage.md](./pdfs-finais-e-storage.md): onde ficam os PDFs oficiais, como o storage funciona e quais modulos ja estao endurecidos
- [seguranca-e-governanca.md](./seguranca-e-governanca.md): tenant, RBAC, locks, storage e trilha forense
- [onde-alterar-o-que.md](./onde-alterar-o-que.md): guia pratico para manutencao e evolucao
- [troubleshooting.md](./troubleshooting.md): problemas comuns e onde investigar
- [faq.md](./faq.md): perguntas frequentes para consulta rapida
- [comandos-e-validacao.md](./comandos-e-validacao.md): comandos mais usados para rodar, validar e diagnosticar
- [../deploy/INFRAESTRUTURA-ATUAL.md](../deploy/INFRAESTRUTURA-ATUAL.md): produção, load test, VPS, Coolify e separação de ambientes
- [../deploy/coolify-vultr-backend-web-worker.md](../deploy/coolify-vultr-backend-web-worker.md): referência histórica, não usar para a infraestrutura atual

## Como usar

- Quando a duvida for "onde esta isso?", comece por `onde-fica-cada-coisa.md`
- Quando a duvida for "como esse fluxo funciona?", comece por `modulos-e-regras.md`
- Quando a duvida for "em qual camada eu mexo?", consulte `frontend-operacional.md`, `backend-operacional.md` e `onde-alterar-o-que.md`
- Quando a duvida for "como eu rodo ou valido isso?", abra primeiro `../OPERACAO-CANONICA-SGS.md` e depois `comandos-e-validacao.md`
- Quando a duvida for "por que o e-mail nao enviou?", abra `troubleshooting.md` e `implementacoes-recentes.md`
- Quando a duvida for mais arquitetural, consulte tambem a pasta [`../architecture`](../architecture)

## Observacao

Esta base agora ja cobre boa parte do dia a dia e pode continuar crescendo. Expansoes futuras possiveis:

- FAQ por modulo
- runbooks operacionais
- mapa de APIs
- contratos de frontend/backend
- checklist de deploy e homologacao

## Relacao com a pasta prompts

Os resumos canonicos do sistema agora ficam aqui em `docs/consulta-rapida`.

A pasta `prompts` foi reduzida para manter apenas:

- prompts reutilizaveis
- checklists
- guias operacionais complementares

Se voce encontrar um resumo antigo em `prompts`, trate `docs/consulta-rapida` como a fonte de verdade mais atual.
