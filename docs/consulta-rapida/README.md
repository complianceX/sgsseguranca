# Consulta Rapida do Sistema

Esta pasta foi criada para servir como base de consulta local, com respostas curtas e objetivas sobre o sistema.

Use estes arquivos como ponto de partida:

- [visao-geral.md](./visao-geral.md): o que o sistema e, como ele esta dividido e quais blocos sao mais importantes
- [arquitetura-e-stack.md](./arquitetura-e-stack.md): stack, runtime, processos e infraestrutura principal
- [frontend-operacional.md](./frontend-operacional.md): como o frontend esta organizado e onde tocar em UI
- [backend-operacional.md](./backend-operacional.md): como o backend esta organizado e onde tocar em API e dominio
- [onde-fica-cada-coisa.md](./onde-fica-cada-coisa.md): mapa rapido de arquivos e pastas
- [mapa-de-modulos.md](./mapa-de-modulos.md): mapa dos modulos principais do produto
- [modulos-e-regras.md](./modulos-e-regras.md): modulos principais, regras de governanca e pontos que ja foram endurecidos
- [fluxos-documentais.md](./fluxos-documentais.md): PDF final, importacao, assinatura, registry, videos e trilha
- [seguranca-e-governanca.md](./seguranca-e-governanca.md): tenant, RBAC, locks, storage e trilha forense
- [onde-alterar-o-que.md](./onde-alterar-o-que.md): guia pratico para manutencao e evolucao
- [troubleshooting.md](./troubleshooting.md): problemas comuns e onde investigar
- [faq.md](./faq.md): perguntas frequentes para consulta rapida
- [comandos-e-validacao.md](./comandos-e-validacao.md): comandos mais usados para rodar, validar e diagnosticar

## Como usar

- Quando a duvida for "onde esta isso?", comece por `onde-fica-cada-coisa.md`
- Quando a duvida for "como esse fluxo funciona?", comece por `modulos-e-regras.md`
- Quando a duvida for "em qual camada eu mexo?", consulte `frontend-operacional.md`, `backend-operacional.md` e `onde-alterar-o-que.md`
- Quando a duvida for "como eu rodo ou valido isso?", abra `comandos-e-validacao.md`
- Quando a duvida for mais arquitetural, consulte tambem a pasta [`../architecture`](../architecture)

## Observacao

Esta base agora ja cobre boa parte do dia a dia e pode continuar crescendo. Expansoes futuras possiveis:

- FAQ por modulo
- runbooks operacionais
- mapa de APIs
- contratos de frontend/backend
- checklist de deploy e homologacao
