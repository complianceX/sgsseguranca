# Fase 30 - Auditoria Visual do Modulo Calendar

Data: 2026-04-21
Escopo: calendario SST mensal, filtros por tipo, grade mensal, detalhes do dia e navegacao para modulos relacionados

## Superficies validadas

- `http://localhost:3000/dashboard/calendar`
- `frontend/app/dashboard/calendar/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/calendar` abriu apenas o shell do app.
- O console do navegador continuou registrando erro real de runtime, vinculado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. Entre os modulos auditados ate aqui, este e um dos mais limpos

- Header simples.
- Filtros por tipo.
- Grade mensal.
- Painel lateral do dia.
- Legenda final.
- A estrutura base e boa e mais legivel do que a media do sistema.

### 2. Mesmo sendo mais limpo, ainda ha excesso de pequenos elementos clicaveis

- Chips de filtro por tipo.
- Navegacao de mes.
- Dias clicaveis.
- Badges dentro do painel lateral.
- Link para modulo.
- Em uso continuo, a tela tende a ficar mais "picada" do que precisa.

### 3. Os filtros por tipo ainda estao visualmente fortes demais

- Cada tipo usa um chip com cor, bolinha, borda e sombra.
- Quando todos os tipos estao ativos, a abertura da tela fica mais barulhenta.
- Para um sistema empresarial simples, esse bloco pode ser mais seco.

### 4. A grade mensal usa celulas pequenas para um volume potencialmente alto de eventos

- Ate tres eventos aparecem dentro do dia.
- Depois entra `+N mais`.
- Em meses mais carregados, a leitura tende a ficar apertada.
- Isso nao quebra a funcao, mas limita conforto visual.

### 5. O painel lateral e funcional, mas o layout geral fica rigido em larguras medias

- O calendario principal ocupa a area central.
- A lateral fixa usa `w-72`.
- Em telas intermediarias, essa divisao pode comprimir desnecessariamente o calendario.

### 6. Ainda ha transicoes e hover onde bastaria clique simples

- Chips usam `motion-safe:transition-all`.
- Celulas usam `motion-safe:transition-colors`.
- Link `Ver modulo` depende de hover.
- Para o padrao pedido, isso pode ser reduzido.

## Problemas priorizados

### Prioridade media

#### Problema: os chips de filtro carregam mais protagonismo do que deveriam

- Por que prejudica: poluem a abertura da tela e competem com o calendario em si.
- Como deve ficar: filtros claros, mas mais discretos e menos chamativos.
- Sugestao pratica: reduzir sombra, borda e peso cromatico dos chips, ou mover filtros menos usados para uma camada secundaria.

#### Problema: a grade mensal pode ficar apertada em cenarios com muitos eventos

- Por que prejudica: compromete a leitura rapida dos dias mais carregados.
- Como deve ficar: celulas com leitura mais limpa e menos microtexto visivel.
- Sugestao pratica: simplificar a exibicao dentro da celula e deixar mais detalhe para o painel lateral.

#### Problema: a lateral fixa reduz flexibilidade do layout

- Por que prejudica: em larguras intermediarias, o calendario principal perde area util.
- Como deve ficar: painel lateral mais adaptavel ou empilhamento responsivo antecipado.
- Sugestao pratica: revisar o breakpoint e a largura fixa da lateral para manter a grade do mes mais confortavel.

### Prioridade baixa

#### Problema: ainda ha hover e transicoes desnecessarias

- Por que prejudica: adicionam ruido visual em um modulo que ja funciona melhor quando e seco.
- Como deve ficar: clique direto, sem microefeitos perceptiveis.
- Sugestao pratica: remover `motion-safe:*` dos filtros e dias clicaveis e reduzir dependencia de hover nos links internos.

## Veredito da Fase 30

Calendar esta entre as superficies mais promissoras do frontend atual. O problema aqui nao e excesso estrutural grave, e sim refinamento: secar os filtros, aliviar a grade mensal e dar mais sobriedade ao conjunto sem perder a utilidade do calendario como ferramenta diaria.
