# Fase 4 - Auditoria Visual do Modulo DID

Data: 2026-04-21
Escopo: listagem, criacao, edicao e preview do modulo Diálogo do Inicio do Dia

## Superficies validadas

- `http://localhost:3000/devtools/did-preview`
- `frontend/app/dashboard/dids/page.tsx`
- `frontend/components/DidForm.tsx`
- `frontend/app/dashboard/dids/components/DidFormSections.tsx`
- `frontend/app/dashboard/dids/new/page.tsx`
- `frontend/app/dashboard/dids/edit/[id]/page.tsx`
- `frontend/app/devtools/did-preview/DidPreviewHarness.tsx`

## Achados principais

### 1. O modulo DID esta bem estruturado e mais profissional do que a media anterior

- A arquitetura de listagem, shell de formulario e secoes esta consistente.
- O modulo transmite melhor organizacao do que improviso.
- O fluxo de criacao e edicao esta claramente mais maduro do que os padroes antigos do sistema.

### 2. O formulario ainda entra com contexto demais antes do trabalho principal

- `DidFormPageShell` abre com eyebrow, titulo, descricao, tres `StatusPill`, CTA de volta, bloco `Fluxo guiado`, quatro `SummaryMetricCard` e mais uma linha de pills.
- Antes do usuario tocar no primeiro campo, a tela ja apresenta muitos elementos de apoio.
- Isso deixa a entrada do formulario mais pesada do que o necessario para um modulo de registro diario.

### 3. O DID esta visualmente limpo, mas ainda excessivamente acolchoado

- As secoes usam muitas caixas arredondadas, fundos suaves, bordas e cards internos.
- O resultado e bonito, mas um pouco macio demais para um formulario operacional.
- O usuario deveria sentir mais sequencia de preenchimento e menos camadas de painel.

### 4. A listagem esta boa, mas ainda densa em status e acoes por linha

- `dids/page.tsx` combina metricas, toolbar, badge de leitura, busca, filtro, tabela larga, status visual, transicao de status e acoes finais na mesma tela.
- A informacao esta correta, mas o conjunto ainda pede simplificacao de prioridade.
- A tabela funciona melhor que muitos modulos do sistema, mas nao esta totalmente enxuta.

### 5. Ainda existem residuos de motion e destaque desnecessario

- Inputs do form e filtros da listagem ainda usam `motion-safe:transition-all`.
- A grade de participantes ainda tem transicao e destaque de card selecionavel.
- Na listagem, a area de acoes usa `group-hover` para ganhar visibilidade.
- Isso nao quebra a experiencia, mas foge da direcao de sistema seco e estavel.

## Problemas priorizados

### Prioridade alta

#### Problema: excesso de resumo antes do primeiro campo do formulario

- Por que prejudica: atrasa o inicio da tarefa e aumenta a carga visual antes do trabalho principal.
- Como deve ficar: cabecalho mais curto e direto, com apenas o contexto realmente necessario para editar o DID.
- Sugestao pratica: manter titulo, subtitulo curto e no maximo um bloco compacto de status. Rebaixar ou remover parte dos `SummaryMetricCard` e da segunda linha de `StatusPill`.

#### Problema: o shell do formulario usa muitos niveis de caixa e destaque

- Por que prejudica: o fluxo fica mais segmentado do que o necessario e passa sensacao de excesso de interface para uma rotina rapida.
- Como deve ficar: menos painéis dentro de painéis e mais leitura em trilha unica.
- Sugestao pratica: reduzir fundos internos nas secoes `Plano do turno`, `Riscos e controles` e participantes, mantendo a separacao por espacamento e titulo em vez de tantas caixas visuais.

### Prioridade media

#### Problema: listagem mistura leitura e gestao com peso visual parecido

- Por que prejudica: metrica, filtro, status, troca de status e acoes competem ao mesmo tempo.
- Como deve ficar: listagem objetiva, com leitura principal na tabela e ferramentas rebaixadas.
- Sugestao pratica: reduzir destaque das metricas do topo, simplificar `toolbarActions` e deixar mudanca de status menos chamativa na linha.

#### Problema: largura minima e densidade da tabela ainda pesam

- Por que prejudica: `min-w-[980px]` e a quantidade de colunas tornam o modulo menos leve em resolucoes menores.
- Como deve ficar: tabela mais firme, com colunas realmente essenciais e menos texto acessorio por linha.
- Sugestao pratica: revisar se `frente`, `turno`, `responsavel` e status auxiliar podem ser condensados sem perder leitura.

#### Problema: participantes sao apresentados como cards mais sofisticados do que o necessario

- Por que prejudica: a escolha da equipe recebe tratamento visual mais pesado que o proprio conteudo do DID.
- Como deve ficar: selecao clara, simples e objetiva.
- Sugestao pratica: simplificar os cards de participante para uma linha com nome, funcao e estado marcado, sem tanta massa visual.

### Prioridade baixa

#### Problema: residuos de motion ainda aparecem no modulo

- Por que prejudica: mantem uma linguagem de interacao menos coerente com a direcao global mais seca.
- Como deve ficar: foco e estado visual estaticos, sem depender de transicao para parecer responsivo.
- Sugestao pratica: remover `motion-safe:transition-all` dos campos e do seletor de participantes, e retirar o `group-hover` das acoes da tabela.

#### Problema: loading de `new` e `edit` ainda usa card generico demais

- Por que prejudica: o carregamento parece placeholder tecnico, nao estado integrado do modulo.
- Como deve ficar: loading alinhado ao shell do formulario.
- Sugestao pratica: substituir o fallback textual por skeleton curto dentro da mesma estrutura de `FormPageLayout`.

## Veredito da Fase 4

O modulo DID esta em bom nivel visual e ja passa imagem mais profissional, clara e organizada do que boa parte do sistema. O principal ajuste agora nao e estrutural, e sim de refinamento de densidade: reduzir resumo, pills e cards antes do formulario, simplificar a tabela e endurecer o visual operacional. Entre os modulos de campo, ele esta mais perto do alvo do que o dashboard.
