# Fase 25 - Auditoria Visual do Modulo Document Pendencies

Data: 2026-04-21
Escopo: central de pendencias documentais, filtros operacionais, cards de tipos, tabela principal e acoes por linha

## Superficies validadas

- `http://localhost:3000/dashboard/document-pendencies`
- `frontend/app/dashboard/document-pendencies/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/document-pendencies` abriu apenas o shell do app.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. Este modulo e forte operacionalmente, mas visualmente muito carregado

- Header com metricas.
- Toolbar extensa com multiplos filtros.
- Eventual alerta de carga degradada.
- Cards de tipos de pendencia.
- Tabela detalhada com varias badges e varias acoes.
- O modulo entrega muito contexto util, mas tambem acumula muita informacao ao mesmo tempo.

### 2. A camada de filtros ja se comporta como uma tela paralela

- Empresa, site, modulo, criticidade, status e periodo aparecem juntos.
- Para `ADMIN_GERAL`, ainda entram busca de empresa e select de empresa.
- Isso e operacionalmente justificavel.
- Mas visualmente forma uma massa densa antes da area principal.

### 3. Os cards de tipo de pendencia competem com a propria tabela

- Eles ajudam a resumir volume por categoria.
- Porem surgem entre a toolbar e a lista principal, ocupando mais atencao do que deveriam.
- A tela fica com multiplos "centros de gravidade".

### 4. A tabela tem excesso de variacoes por linha

- Badge de tipo.
- Badge de codigo.
- Badge de modulo.
- textos de disponibilidade e assinatura.
- criticidade.
- data relevante com icone.
- varias acoes no lado direito.
- Isso torna cada linha funcionalmente rica, mas visualmente pesada e irregular.

### 5. As acoes por linha ainda estao fortes demais para o papel delas

- Ha combinacao de `Link` com estilo de botao e `Button` tradicional.
- Em itens com mais de uma acao, a coluna final tende a virar um bloco de controles.
- Para a leitura corporativa limpa, o peso da linha deveria estar no problema, nao nos botoes.

## Problemas priorizados

### Prioridade alta

#### Problema: a tela tem densidade visual excessiva antes da tabela

- Por que prejudica: o usuario atravessa metricas, toolbar extensa, alerta e cards antes de chegar as pendencias.
- Como deve ficar: uma entrada mais curta, com a tabela assumindo o centro da interface.
- Sugestao pratica: rebaixar visualmente cards de tipos e reduzir a altura percebida da toolbar, mantendo apenas os filtros indispensaveis em primeiro plano.

#### Problema: cada linha da tabela concentra informacao e estados demais

- Por que prejudica: a leitura por varredura fica lenta e a sensacao geral e de poluicao visual.
- Como deve ficar: linha mais seca, com foco em problema, criticidade e acao principal.
- Sugestao pratica: consolidar metadados secundarios em menos blocos textuais e reduzir a quantidade de badges visiveis por registro.

#### Problema: a coluna de acoes chama mais atencao do que o diagnostico da pendencia

- Por que prejudica: o usuario percebe muitos botoes competindo com a leitura do caso.
- Como deve ficar: acao principal clara e acoes secundarias discretas.
- Sugestao pratica: limitar a acao visivel principal por linha e mover acoes menos frequentes para menu contextual ou camada secundaria.

### Prioridade media

#### Problema: os cards de tipo fragmentam a hierarquia da pagina

- Por que prejudica: introduzem mais um bloco de destaque entre filtros e tabela.
- Como deve ficar: resumo complementar, nao protagonista.
- Sugestao pratica: reduzir esses cards para uma faixa compacta de contadores ou incorpora-los ao cabecalho como metricas secundarias.

#### Problema: a toolbar trata todos os filtros com peso parecido

- Por que prejudica: o operador nao entende rapidamente o que e principal e o que e refinamento.
- Como deve ficar: empresa/site/periodo como eixos principais; criticidade, status e modulo como refinadores.
- Sugestao pratica: separar filtros primarios e secundarios em dois niveis visuais ou em um bloco recolhivel.

#### Problema: ainda ha residuos de linguagem visual agitada

- Por que prejudica: a tela ja e naturalmente densa e nao precisa de reforco visual adicional.
- Como deve ficar: feedbacks secos, sem excesso de destaque iconografico ou interacao animada.
- Sugestao pratica: revisar o uso de icones de alerta em excesso, classes de destaque global e qualquer transicao aplicada pelos componentes base desta tela.

### Prioridade baixa

#### Problema: o estado "empresa em foco" para usuario nao admin vira um card a mais no meio da toolbar

- Por que prejudica: adiciona mais um bloco de superficie em uma area ja carregada.
- Como deve ficar: informacao contextual curta e integrada ao cabecalho do filtro.
- Sugestao pratica: transformar esse card em texto de contexto simples no topo da toolbar em vez de outro painel visual.

## Veredito da Fase 25

Document Pendencies e um modulo util e serio, mas hoje esta visualmente pesado demais para uma central operacional de rotina. O caminho ideal nao e reduzir capacidade; e concentrar a leitura no problema, simplificar a malha de filtros e diminuir a agressividade visual de badges, cards e botoes por linha.
