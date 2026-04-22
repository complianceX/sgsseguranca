# Fase 34 - Auditoria Visual do Modulo Corrective Actions

Data: 2026-04-21
Escopo: painel de CAPA, KPIs, SLA operacional, formulario inline, tabela principal e resumo por obra/setor

## Superficies validadas

- `http://localhost:3000/dashboard/corrective-actions`
- `frontend/app/dashboard/corrective-actions/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/corrective-actions` abriu apenas o shell do app.
- O console do navegador continuou sinalizando erro de runtime ligado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo e compacto, mas visualmente concentrado demais

- Header.
- Grade de KPIs.
- Bloco de SLA.
- Formulario inline.
- Tabela.
- Resumo por obra/setor.
- Tudo esta na mesma pagina e quase tudo tem peso visual parecido.

### 2. O topo do modulo ja entrega informacao demais antes da tabela

- Cinco KPIs gerais.
- Mais cinco KPIs de SLA.
- CTA de escalonamento.
- Isso faz o usuario atravessar muito resumo antes de entrar na operacao real.

### 3. O formulario inline soma muito peso no meio da tela

- Campos de titulo, descricao, data, prioridade, responsavel e botao.
- Quando combinado com KPIs acima e tabela abaixo, a pagina vira um bloco unico denso.
- Falta respiracao e hierarquia entre criar, monitorar e acompanhar.

### 4. A tabela esta mais limpa que a media, mas ainda mistura leitura e controle

- O select de status fica dentro da propria linha.
- Ainda existe texto de status ao lado.
- A coluna final fica funcional, mas visualmente pouco enxuta.

### 5. O bloco `SLA por Obra/Setor` adiciona outra secao de resumo apos a tabela

- O conteudo e util.
- Mas reforca a sensacao de pagina cumulativa, sempre adicionando mais uma camada.
- O modulo fica menos objetivo do que poderia.

### 6. Ainda ha transicoes em selects e campos

- Os selects do formulario usam `motion-safe:transition-all`.
- Isso mantem microefeitos desnecessarios para o padrao pretendido.

## Problemas priorizados

### Prioridade alta

#### Problema: o topo da pagina concentra KPIs demais

- Por que prejudica: o usuario recebe dois blocos de resumo seguidos antes de ver a operacao central.
- Como deve ficar: abertura mais curta, com poucos indicadores realmente essenciais.
- Sugestao pratica: condensar KPIs gerais e SLA em uma camada mais enxuta, priorizando apenas os desvios criticos e vencidos.

#### Problema: o formulario inline pesa demais no mesmo plano da tabela

- Por que prejudica: criacao e acompanhamento competem visualmente na mesma tela, sem hierarquia clara.
- Como deve ficar: criacao mais discreta e acompanhamento mais central.
- Sugestao pratica: rebaixar visualmente o formulario, colapsa-lo ou movelo para um bloco secundario menos protagonista.

### Prioridade media

#### Problema: a tabela mistura leitura de status e controle de status no mesmo campo visual

- Por que prejudica: a linha fica menos limpa e mais parecida com planilha editavel.
- Como deve ficar: leitura principal mais clara, com edicao menos invasiva.
- Sugestao pratica: reduzir o peso do select inline ou mover alteracao de status para interacao secundaria.

#### Problema: o bloco de SLA por obra/setor soma outra camada apos a tabela

- Por que prejudica: prolonga a pagina e reforca o padrao de acumular secoes em serie.
- Como deve ficar: resumo complementar, nao protagonista.
- Sugestao pratica: comprimir essa secao ou integra-la ao bloco de SLA superior com menos altura visual.

### Prioridade baixa

#### Problema: ainda ha transicoes desnecessarias em campos do formulario

- Por que prejudica: adicionam microefeitos sem ganho real em clareza.
- Como deve ficar: campos secos e estaveis.
- Sugestao pratica: remover `motion-safe:*` dos selects e manter resposta visual simples no foco.

## Veredito da Fase 34

Corrective Actions nao esta caotico, mas esta condensando funcao demais numa unica pagina. O melhor caminho aqui e reduzir KPI redundante, rebaixar o formulario inline e deixar a tabela assumir o papel central do modulo, com menos resumo acumulado ao redor.
