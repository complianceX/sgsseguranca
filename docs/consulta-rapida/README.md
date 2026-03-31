# Consulta Rapida do Sistema

Esta pasta foi criada para servir como base de consulta local, com respostas curtas e objetivas sobre o sistema.

Use estes arquivos como ponto de partida:

- [visao-geral.md](./visao-geral.md): o que o sistema e, como ele esta dividido e quais blocos sao mais importantes
- [arquitetura-e-stack.md](./arquitetura-e-stack.md): stack, runtime, processos e infraestrutura principal
- [arquitetura-e-rotas.md](./arquitetura-e-rotas.md): desenho macro da arquitetura e mapa completo de rotas do frontend e backend
- [frontend-operacional.md](./frontend-operacional.md): como o frontend esta organizado e onde tocar em UI
- [backend-operacional.md](./backend-operacional.md): como o backend esta organizado e onde tocar em API e dominio
- [onde-fica-cada-coisa.md](./onde-fica-cada-coisa.md): mapa rapido de arquivos e pastas
- [mapa-de-modulos.md](./mapa-de-modulos.md): mapa dos modulos principais do produto
- [modulos-e-regras.md](./modulos-e-regras.md): modulos principais, regras de governanca e pontos que ja foram endurecidos
- [fluxos-documentais.md](./fluxos-documentais.md): PDF final, importacao, assinatura, registry, videos e trilha
- [disaster-recovery-e-backup.md](./disaster-recovery-e-backup.md): backup, proteção do storage, restore, recovery separado, scanner de integridade, runbook e metas iniciais de RPO/RTO
- [implementacoes-recentes.md](./implementacoes-recentes.md): linha do tempo e passo a passo do que foi implementado nas ultimas rodadas
- [pdfs-finais-e-storage.md](./pdfs-finais-e-storage.md): onde ficam os PDFs oficiais, como o storage funciona e quais modulos ja estao endurecidos
- [variaveis-ambiente-railway.md](./variaveis-ambiente-railway.md): quais variaveis do Railway sao obrigatorias, opcionais, de grafo e gerenciadas pela plataforma
- [seguranca-e-governanca.md](./seguranca-e-governanca.md): tenant, RBAC, locks, storage e trilha forense
- [onde-alterar-o-que.md](./onde-alterar-o-que.md): guia pratico para manutencao e evolucao
- [troubleshooting.md](./troubleshooting.md): problemas comuns e onde investigar
- [faq.md](./faq.md): perguntas frequentes para consulta rapida
- [comandos-e-validacao.md](./comandos-e-validacao.md): comandos mais usados para rodar, validar e diagnosticar
- [../../backend/docs/RENDER_SUPABASE_CUTOVER.md](../../backend/docs/RENDER_SUPABASE_CUTOVER.md): runbook de cutover para Supabase + Render (web/worker) com rollback

## Como usar

- Quando a duvida for "onde esta isso?", comece por `onde-fica-cada-coisa.md`
- Quando a duvida for "como esse fluxo funciona?", comece por `modulos-e-regras.md`
- Quando a duvida for "em qual camada eu mexo?", consulte `frontend-operacional.md`, `backend-operacional.md` e `onde-alterar-o-que.md`
- Quando a duvida for "como eu rodo ou valido isso?", abra `comandos-e-validacao.md`
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
