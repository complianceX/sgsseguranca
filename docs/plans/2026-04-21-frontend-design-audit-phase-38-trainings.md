# Fase 38 - Auditoria Visual do Modulo Trainings

Data: 2026-04-21
Escopo: listagem principal, resumo de vencimentos, callout de bloqueio, acoes por linha, cadastro, edicao e formulario principal

## Superficies validadas

- `http://localhost:3000/dashboard/trainings`
- `frontend/app/dashboard/trainings/page.tsx`
- `frontend/app/dashboard/trainings/new/page.tsx`
- `frontend/app/dashboard/trainings/edit/[id]/page.tsx`
- `frontend/components/TrainingForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/trainings` abriu apenas o shell do app.
- O frontend seguiu com erro de conexao em `http://localhost:3011/auth/csrf`.
- O fechamento desta fase foi feito pela leitura integral da tela real e do formulario real, sem assumir renderizacao autenticada completa.

## Achados principais

### 1. Trainings esta acima da media do sistema em organizacao visual

- A listagem usa `ListPageLayout`.
- O header tem titulo, descricao, acoes e metricas coerentes.
- A leitura geral e melhor do que em varios modulos anteriores.
- Existe uma base visual mais profissional aqui.

### 2. Mesmo sendo mais organizado, o modulo ainda concentra camadas demais na listagem

- Header com metricas.
- Toolbar com busca e exportacao.
- Callout de bloqueio.
- Tabela.
- Paginacao.
- Barra de acoes no topo.
- Isso ainda deixa a tela mais carregada do que o necessario para um modulo administrativo recorrente.

### 3. As acoes por linha continuam excessivas e pouco claras

- Imprimir.
- Baixar PDF.
- Enviar e-mail.
- Editar.
- Excluir.
- Tudo fica comprimido em icones pequenos no final da linha.
- O usuario precisa interpretar simbolos em vez de enxergar uma acao principal clara.

### 4. O formulario e funcional, mas ainda fala demais visualmente

- `PageHeader` com tres `StatusPill`.
- Faixa de "Cadastro guiado".
- Bloco principal de contexto.
- Secao de auditoria no mesmo fluxo.
- Muitos textos auxiliares em praticamente todos os campos.
- O formulario fica correto tecnicamente, mas mais verboso do que precisa ser para cadastro operacional.

### 5. O fluxo de auditoria dentro do mesmo formulario amplia a carga cognitiva

- Cadastro do treinamento.
- Vinculo com empresa e colaborador.
- Datas e certificado.
- Assinatura.
- Auditoria.
- Tudo aparece em uma unica tela.
- Para uso diario, isso aumenta leitura, altura e cansaco sem entregar foco imediato.

### 6. Ainda ha transicoes e hover desnecessarios para o padrao corporativo que voce quer

- `transition-all` em campos.
- `transition-colors` em botoes e retorno.
- Spinner animado no submit.
- O modulo nao esta exagerado, mas ainda nao esta no nivel mais seco e estavel que voce pediu.

## Problemas priorizados

### Prioridade alta

#### Problema: a coluna de acoes da listagem ainda esta carregada demais

- Por que prejudica: reduz legibilidade da tabela e dificulta identificar a acao principal de cada registro.
- Como deve ficar: uma acao primaria visivel e o restante agrupado em menu secundario.
- Sugestao pratica: manter `Editar` como acao principal da linha e mover PDF, impressao, e-mail e exclusao para um menu de overflow.

#### Problema: o formulario junta cadastro operacional e auditoria na mesma camada visual

- Por que prejudica: aumenta altura, burocracia percebida e fadiga de preenchimento.
- Como deve ficar: formulario principal mais direto, com auditoria em bloco secundario ou etapa separada.
- Sugestao pratica: manter dados essenciais no fluxo principal e rebaixar `AuditSection` para uma secao colapsada ou tela especifica de auditoria.

### Prioridade media

#### Problema: a listagem tem muitos elementos de topo competindo ao mesmo tempo

- Por que prejudica: metricas, callout, busca e acoes disputam protagonismo antes da tabela.
- Como deve ficar: topo mais enxuto, com hierarquia mais dura entre resumo e operacao.
- Sugestao pratica: manter metricas e busca como nucleo fixo e deixar callout e exportacoes em camada secundaria.

#### Problema: o formulario tem excesso de texto de apoio e badges simultaneos

- Por que prejudica: alonga a tela e tira objetividade de um cadastro relativamente simples.
- Como deve ficar: menos rotulos auxiliares concorrendo e menos badges no header.
- Sugestao pratica: reduzir `StatusPill` para no maximo dois estados e manter helper text apenas onde houver risco real de erro.

#### Problema: as rotas `new` e `edit` usam wrappers muito secos e com loading generico

- Por que prejudica: passa sensacao de acabamento parcial antes da tela principal carregar.
- Como deve ficar: estados de carregamento consistentes com o restante do sistema.
- Sugestao pratica: trocar o fallback simples das paginas por um `PageLoadingState` alinhado ao padrao do modulo.

### Prioridade baixa

#### Problema: ainda existem hover e transicoes perceptiveis em campos e botoes

- Por que prejudica: reforca uma sensacao de UI mais movimentada do que o necessario.
- Como deve ficar: comportamento mais estatico e empresarial.
- Sugestao pratica: remover `transition-all`, reduzir `transition-colors` e deixar os estados de hover apenas com diferenca discreta de borda ou fundo.

## Veredito da Fase 38

Trainings ja tem uma base visual mais madura do que grande parte do sistema. O que falta aqui nao e refazer tudo: e simplificar a camada operacional, reduzir a coluna de acoes, enxugar o formulario e separar melhor o que e cadastro do que e auditoria.
