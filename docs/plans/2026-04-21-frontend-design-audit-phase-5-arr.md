# Fase 5 - Auditoria Visual do Modulo ARR

Data: 2026-04-21
Escopo: listagem, criacao e edicao do modulo Analise de Risco Rapida

## Superficies validadas

- `http://localhost:3000/dashboard/arrs`
- `http://localhost:3000/dashboard/arrs/new`
- `frontend/app/dashboard/arrs/page.tsx`
- `frontend/components/ArrForm.tsx`
- `frontend/app/dashboard/arrs/new/page.tsx`
- `frontend/app/dashboard/arrs/edit/[id]/page.tsx`

## Validacao visual real

- As rotas `/dashboard/arrs` e `/dashboard/arrs/new` responderam `200`.
- As capturas locais cairam em estado de loading centralizado do shell, sem materializar a tela final do modulo.
- Por isso, o diagnostico desta fase foi fechado com validacao parcial da superficie real e leitura direta dos arquivos centrais do modulo.

## Achados principais

### 1. O ARR herdou uma estrutura mais pesada do que o caso de uso pede

- `ArrForm.tsx` usa a mesma familia de shell refinado de modulos mais longos.
- Isso melhora consistencia visual com DID e demais formularios.
- Mas para um modulo chamado `Analise de Risco Rapida`, a interface entra formal demais e demora a colocar o usuario no ponto principal.

### 2. O topo do formulario tem contexto em excesso antes do registro do risco

- O shell abre com eyebrow, titulo, descricao, tres `StatusPill`, CTA de volta, bloco `Fluxo guiado`, quatro `SummaryMetricCard` e uma nova faixa de pills.
- O usuario precisa atravessar um bloco institucional relativamente grande antes de descrever a condicao observada.
- Para uma rotina rapida de campo, isso adiciona atrito visual.

### 3. O modulo esta visualmente organizado, mas pouco enxuto para um fluxo rapido

- As secoes `Contexto da analise`, `Risco e tratamento` e `Equipe` sao bem estruturadas.
- Ao mesmo tempo, elas seguem um padrao de muitas caixas, bordas, blocos internos e destaques suaves.
- O resultado parece mais formulario de governanca do que instrumento de resposta rapida.

### 4. A listagem esta correta, mas mistura gestao governada com leitura operacional

- A tabela combina filtros, metricas, status, transicao de status, impressao e emissao de PDF final no mesmo plano.
- O modulo precisa dessas funcoes, mas a pagina atual entrega tudo com peso visual parecido.
- Isso deixa a leitura menos objetiva para o uso diario.

### 5. Ha residuos de motion e comportamento visual suave demais

- Inputs usam `transition-all` no form.
- A grade de participantes tambem usa `transition-all`.
- A listagem usa `group-hover` para destacar acoes na linha.
- Esses detalhes nao quebram o modulo, mas contradizem a direcao mais seca e estavel que o sistema vem adotando.

## Problemas priorizados

### Prioridade alta

#### Problema: o ARR nao parece suficientemente rapido logo na entrada

- Por que prejudica: a interface contradiz a promessa operacional do modulo e aumenta o tempo de escaneamento antes do preenchimento.
- Como deve ficar: um fluxo mais direto, com contexto minimo e foco imediato na condicao, no risco e no controle.
- Sugestao pratica: reduzir o bloco superior para titulo, subtitulo curto e no maximo um status compacto. Rebaixar ou remover parte dos `SummaryMetricCard` e das pills redundantes.

#### Problema: formulario com massa visual acima do necessario para rotina de campo

- Por que prejudica: transforma um registro de resposta rapida em uma tela mais pesada do que o uso pede.
- Como deve ficar: secoes claras, mas menos acolchoadas e com menos paines internos.
- Sugestao pratica: simplificar fundos e bordas dos grupos internos, preservando separacao por espacamento, titulos e ordem de preenchimento.

### Prioridade media

#### Problema: a listagem mistura decisao operacional com governanca documental no mesmo nivel

- Por que prejudica: usuario recebe metricas, busca, filtro, transicoes de status, impressao e PDF final todos disputando atencao.
- Como deve ficar: leitura principal na tabela, com governanca documental como apoio e nao como primeiro ruido visual.
- Sugestao pratica: rebaixar metricas e badge do topo, simplificar a apresentacao de status por linha e agrupar melhor as acoes de governanca.

#### Problema: a tabela ainda esta mais densa do que o ideal

- Por que prejudica: `min-w-[1040px]`, varios badges e acoes por linha deixam a listagem pesada em resolucoes menores.
- Como deve ficar: tabela mais objetiva, com leitura mais direta de risco, status e resposta.
- Sugestao pratica: reduzir elementos secundarios na linha e revisar se a severidade e o turno precisam sempre aparecer como apoio visual simultaneo.

#### Problema: a semantica visual do ARR esta mais proxima de DID do que de resposta rapida

- Por que prejudica: os dois modulos ficam com a mesma cadencia visual, mesmo tendo propósitos operacionais diferentes.
- Como deve ficar: ARR mais curto, mais urgente e mais direto que DID.
- Sugestao pratica: diminuir ritual de cabecalho, reduzir resumo visual e aproximar os campos de risco do topo da tela.

### Prioridade baixa

#### Problema: loading de `new` e `edit` ainda usa card generico

- Por que prejudica: o estado de carregamento parece fallback tecnico, nao superficie integrada do modulo.
- Como deve ficar: loading alinhado ao shell do proprio formulario.
- Sugestao pratica: trocar o fallback textual por skeleton curto dentro da estrutura de `FormPageLayout`.

#### Problema: residuos de motion ainda permanecem no modulo

- Por que prejudica: mantem pequenas inconsistencias com o padrao visual corporativo mais seco.
- Como deve ficar: foco e selecao claros, sem depender de transicao.
- Sugestao pratica: remover `transition-all` dos campos e da grade de participantes, e retirar o `group-hover` das acoes da tabela.

## Veredito da Fase 5

O modulo ARR esta organizado e consistente com o design system atual, mas ainda nao comunica bem a ideia de registro rapido. O principal ajuste deste modulo e de linguagem visual: menos ritual de cabecalho, menos resumo ornamental e mais proximidade entre entrada na tela e registro do risco. Em comparacao com DID, o ARR deveria ser mais seco e mais urgente.
