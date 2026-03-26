# Color Refactor PR Plan

## Objetivo
Migrar a aplicacao para um sistema cromatico mais consistente, sem big bang, sem reescrever telas inteiras e sem misturar fundacao visual com limpeza de legado no mesmo PR.

Este plano assume a base atual do frontend, que ja concentra comportamento de tema e tokens em:
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`
- `frontend/lib/theme-engine.ts`

## Premissas de seguranca
- cada PR deve ser pequeno o bastante para ser revertido sem efeito cascata;
- primeiro consolidar contratos, depois expandir uso, e so no fim remover legado;
- nenhum PR deve alterar logica de negocio junto com cor/tema, a menos que a mudanca visual dependa diretamente disso;
- toda etapa precisa ter verificacao visual e tecnica;
- se um PR exigir mais de um eixo de risco, ele deve ser dividido.

## Ordem recomendada de PRs

### PR 1 - Canonicalizar tokens e mapa semantico
**Escopo**
- consolidar a fonte de verdade dos tokens cromaticos;
- validar nomes semanticos para canvas, surface, texto, borda, action e estados;
- alinhar `tailwind.config.ts` e CSS variables para evitar duplicidade conceitual;
- documentar o contrato basico do tema claro/escuro.

**Nao entra**
- migracao de componentes;
- troca de classes em telas;
- remocao de classes antigas.

**Risco**
- baixo a medio;
- principal risco e quebrar referencias existentes por renome de token ou por alias faltando.

**Verificacao**
- build do frontend;
- inspecao manual de telas principais em light/dark;
- checagem de que nenhuma variavel usada deixou de ter fallback;
- diff de busca por tokens antigos e novos para confirmar que o mapa esta coerente.

**Dependencias**
- nenhuma externa;
- este PR e a base para todos os demais.

### PR 2 - Criar wrappers visuais de dominio e componentes base
**Escopo**
- introduzir ou ajustar wrappers de `Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, `Alert` e `StatePanel` para consumir os tokens canonicos;
- padronizar estados `hover`, `focus`, `disabled`, `loading`, `empty` e `error`;
- manter compatibilidade com as classes antigas onde ainda houver consumo amplo.

**Nao entra**
- migracao em massa de paginas;
- limpeza final do legado;
- alteracao de comportamento de formularios.

**Risco**
- medio;
- wrappers podem mascarar regressao visual em telas que dependem de overrides locais.

**Verificacao**
- build do frontend;
- testes manuais em componentes reaproveitados;
- comparar pelo menos uma tela de formulario, uma tela de listagem e uma tela de detalhe;
- validar foco e contraste em teclado.

**Dependencias**
- depende do PR 1;
- idealmente o consumo novo deve ser opt-in, para conviver com o legado.

### PR 3 - Migrar shell global e areas de maior trafego
**Escopo**
- migrar layout global, topbar, sidebar, cards de pagina, estados de lista e tabelas para os novos tokens;
- priorizar areas de alto trafego e baixo acoplamento visual;
- reduzir hardcodes de cores mais visiveis, especialmente fundo, texto, borda e surfaces.

**Nao entra**
- refatoracao de logica de pagina;
- troca de API;
- remocao de todas as classes antigas de uma vez.

**Risco**
- medio a alto;
- e o primeiro PR com impacto amplo, entao qualquer regressao visual tende a aparecer em mais de uma tela.

**Verificacao**
- build do frontend;
- walkthrough manual das rotas principais;
- screenshot diff ou comparacao visual nas telas priorizadas;
- checar contraste em dark mode e estados de tabela, formulario e badge.

**Dependencias**
- depende do PR 1 e do PR 2;
- recomenda-se migrar primeiro o shell e os contenedores, nao os formularios complexos.

### PR 4 - Migrar telas de dominio em ondas pequenas
**Escopo**
- migrar um conjunto fechado de telas por dominio, de preferencia 2 a 4 por vez;
- cada onda deve usar apenas os componentes e tokens validados nos PRs anteriores;
- tratar telas mais sensiveis separadamente, como fluxos de formulario longo e areas com muitos estados.

**Nao entra**
- rearranjo de arquitetura;
- redesign de UX;
- limpeza de legado que ainda nao foi substituido em outras telas.

**Risco**
- medio;
- o risco aqui nao e o token, e sim a combinacao entre estado local, densidade de informacao e responsividade.

**Verificacao**
- build do frontend;
- checklist por tela: loading, empty, error, success, foco e responsividade;
- revisao visual em desktop e mobile;
- confirmar que nao houve regressao em acessibilidade basica.

**Dependencias**
- depende do PR 1, do PR 2 e das areas de shell do PR 3;
- cada onda de telas deve ser mergeada antes da proxima.

### PR 5 - Remover legado cromatico e padronizar o uso restante
**Escopo**
- remover classes e hardcodes antigos que ficaram sem consumo apos as ondas de migracao;
- limpar aliases redundantes e regras duplicadas;
- atualizar documentacao interna para refletir o contrato final.

**Nao entra**
- novas variacoes de cor;
- expansao do tema;
- alteracao de escopo funcional.

**Risco**
- medio;
- a maior armadilha e apagar algo ainda referenciado por uma tela esquecida ou por um fallback pouco visivel.

**Verificacao**
- busca final por cores hardcoded e classes obsoletas;
- build do frontend;
- rodar uma revisao visual rapida nas principais jornadas;
- confirmar que nao existem referencias vivas aos aliases removidos.

**Dependencias**
- depende de todos os PRs anteriores;
- este e o PR de fechamento, nao o de experimentacao.

## Gatilhos para quebrar o plano em PRs ainda menores
- se um componente base precisar de override muito especifico, separar esse componente do PR de tokens;
- se uma tela exigir ajuste de layout junto com cor, dividir em "estrutura" e "pintura";
- se um dominio tiver mais de 5 telas afetadas, migrar em ondas menores;
- se a comparacao visual mostrar divergencia relevante em dark mode, pausar a migracao daquela area ate corrigir o contrato.

## Sequencia pratica de merge
1. PR 1 estabelece os tokens e o mapa semantico.
2. PR 2 habilita os wrappers e componentes base.
3. PR 3 migra o shell e as areas mais visiveis.
4. PR 4 migra telas por dominio, uma onda por vez.
5. PR 5 remove o legado cromatico que sobrar.

## Critério de aceitacao do programa inteiro
- o sistema usa um conjunto coerente de tokens e variaveis;
- as telas principais mantem contraste e estados corretos em light e dark;
- o legado antigo pode ser removido sem quebrar rotas visiveis;
- cada PR e pequeno o bastante para review rapido e rollback simples.

## Arquivos alterados
- `docs/color-refactor-pr-plan.md`
