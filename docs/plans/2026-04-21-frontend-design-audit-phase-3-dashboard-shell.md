# Fase 3 - Auditoria Visual do Dashboard e Shell Operacional

Data: 2026-04-21
Escopo: shell autenticado, dashboard inicial, header, sidebar, KPIs, fila, feed, agenda e score operacional

## Superficies validadas

- `http://localhost:3000/dashboard`
- `frontend/app/dashboard/layout.tsx`
- `frontend/app/dashboard/page.tsx`
- `frontend/components/Header.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/dashboard/DashboardKPIs.tsx`
- `frontend/components/dashboard/PendingQueue.tsx`
- `frontend/components/dashboard/SiteCompliance.tsx`
- `frontend/components/dashboard/ActivityFeed.tsx`
- `frontend/components/dashboard/SSTScoreRings.tsx`
- `frontend/components/dashboard/DailyReportButton.tsx`
- `frontend/app/dashboard/_components/LastUpdatedLabel.tsx`

## Validacao visual real

- A rota `/dashboard` respondeu `200`.
- A captura local da tela caiu em estado de loading centralizado, sem contexto suficiente do shell final.
- Por isso, a auditoria desta fase foi fechada com base em validacao parcial da superficie real e leitura direta dos componentes que constroem o dashboard.

## Achados principais

### 1. O shell operacional esta mais limpo, mas continua funcionalmente denso

- `Header.tsx` concentra busca, Sophie, sincronizacao offline, notificacoes, tema e contexto do usuario na mesma faixa.
- `Sidebar.tsx` esta visualmente mais correta do que antes, mas ainda organiza muitos grupos e rotulos com peso muito parecido.
- O resultado passa menos ruido estetico, mas ainda exige bastante escaneamento cognitivo.

### 2. O dashboard inicial tem blocos demais competindo ao mesmo tempo

- `dashboard/page.tsx` encadeia cabecalho, status, relatorio diario, ultima atualizacao, acoes rapidas, KPIs, feed, agenda, fila, score e acesso rapido em sequencia curta.
- Quase todos esses blocos usam borda, card, titulo, badge ou acao propria.
- Isso torna a pagina funcionalmente rica, mas visualmente densa para um cockpit principal.

### 3. Ha duplicacao de padrao entre `Acoes Rapidas` e `Acesso rapido`

- Os dois blocos usam a mesma linguagem de grade com cards clicaveis.
- Na pratica, o usuario recebe duas areas muito parecidas para navegar e agir.
- Isso enfraquece hierarquia e aumenta redundancia.

### 4. KPIs continuam mais enfaticos do que o necessario

- `DashboardKPIs.tsx` segue com numero muito grande, labels em caixa alta e icone destacado em todos os cards.
- O conjunto esta bem mais seco do que antes, mas ainda chama mais atencao do que deveria em comparacao com fila e atividade.
- O painel principal precisa parecer decisorio, nao promocional.

### 5. A fila e os paineis secundarios estao melhores, mas ainda formam um mosaico de pesos equivalentes

- `PendingQueue.tsx`, `SiteCompliance.tsx`, `ActivityFeed.tsx` e `SSTScoreRings.tsx` compartilham praticamente o mesmo nivel de destaque estrutural.
- Feed, agenda, score e fila ficam competindo pela mesma prioridade visual.
- O dashboard perde eixo claro de leitura.

### 6. Ainda existem residuos de motion e loading pouco corporativo

- `dashboard/layout.tsx` ainda usa `motion-safe:animate-spin` no loading da shell.
- O CTA de sessao expirada e o seletor de empresa ainda usam hover/transicao residual.
- `SSTScoreRings.tsx` ainda usa glow, escalonamento por transform e transicoes de barra/anel que fogem da direcao visual mais seca.

## Problemas priorizados

### Prioridade alta

#### Problema: excesso de elementos no header operacional

- Por que prejudica: o topo deixa de orientar e passa a competir com o conteudo principal.
- Como deve ficar: header utilitario, com menos sinais simultaneos e prioridade mais clara entre busca, notificacao e acoes especiais.
- Sugestao pratica: reduzir o numero de chips visiveis no topo, rebaixar o peso de Sophie/offline quando nao houver evento ativo e simplificar a apresentacao do usuario.

#### Problema: dashboard inicial concentra modulos demais no mesmo plano visual

- Por que prejudica: a pagina exige leitura longa e distribuida logo na entrada, o que reduz foco operacional.
- Como deve ficar: um cockpit mais curto, com bloco principal de decisao e paineis secundarios claramente rebaixados.
- Sugestao pratica: consolidar o topo em tres zonas fixas: estado geral, fila critica e contexto operacional. O restante deve descer de prioridade.

#### Problema: `Acoes Rapidas` e `Acesso rapido` duplicam funcao visual

- Por que prejudica: cria redundancia e enfraquece a hierarquia da navegacao dentro do dashboard.
- Como deve ficar: um unico bloco de atalhos, com criterio claro entre criar novo e acessar modulo.
- Sugestao pratica: fundir os dois grids ou separar explicitamente `Criar` de `Ir para modulo`, com visuais diferentes.

#### Problema: estados de loading e fallback ainda estao crus

- Por que prejudica: o usuario encontra spinner isolado ou card simples demais sem contexto do shell, o que parece inacabado.
- Como deve ficar: loading contextualizado dentro da malha do dashboard, sem depender de spinner central.
- Sugestao pratica: trocar o loading central da shell por placeholders de header/sidebar/conteudo e remover `motion-safe:animate-spin`.

### Prioridade media

#### Problema: KPIs ainda estao visualmente acima do peso ideal

- Por que prejudica: metricas resumidas passam a disputar protagonismo com fila e atividade, que sao mais acionaveis.
- Como deve ficar: KPI mais compacto, com numero menor e menos dependencia de icone e trend decorativa.
- Sugestao pratica: reduzir tipografia do valor, suavizar icones e usar trend apenas quando houver mudanca relevante.

#### Problema: score de conformidade ainda tem linguagem visual mais ornamental

- Por que prejudica: glow e animacao do anel passam imagem menos corporativa do que o restante da interface.
- Como deve ficar: score objetivo, tecnico e estatico.
- Sugestao pratica: remover glow, remover `motion-safe` do anel e tratar score como indicador simples, sem efeito de destaque.

#### Problema: blocos secundarios usam a mesma estrutura de destaque

- Por que prejudica: agenda, timeline, score e conformidade parecem igualmente urgentes.
- Como deve ficar: um bloco principal, um bloco de acompanhamento e um bloco de leitura secundaria.
- Sugestao pratica: rebaixar visualmente agenda e score, mantendo fila e atividade como eixo principal do dashboard.

### Prioridade baixa

#### Problema: sidebar ainda carrega muitos rotulos e secoes extensas

- Por que prejudica: a navegacao lateral continua densa em leitura, mesmo com visual mais limpo.
- Como deve ficar: navegacao mais curta por secao, com agrupamentos mais objetivos.
- Sugestao pratica: revisar nomes longos, cortar redundancia semantica e reduzir o numero de itens abertos por padrao.

#### Problema: `LastUpdatedLabel` e status complementares ficam dispersos no cabecalho

- Por que prejudica: informacoes de apoio acabam dividindo espaco com acoes mais importantes.
- Como deve ficar: apoio de status mais discreto e consolidado.
- Sugestao pratica: agrupar `Operacao normal`, ultima atualizacao e erro leve numa unica faixa secundaria.

## Veredito da Fase 3

O dashboard e o shell operacional do SGS estao visualmente melhores do que nas iteracoes anteriores, mas ainda nao atingem o ponto ideal de cockpit corporativo enxuto. O problema dominante desta fase e hierarquia: ha muita informacao correta, mas distribuida com pesos visuais parecidos. O proximo passo certo e seguir modulo por modulo nos fluxos operacionais, comecando por `DID`, porque ali a auditoria sai do chrome global e entra no formulario e leitura de uso diario.
