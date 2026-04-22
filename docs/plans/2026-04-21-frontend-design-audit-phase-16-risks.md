# Fase 16 - Auditoria Visual do Modulo Risks

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Risks

## Superficies validadas

- `http://localhost:3000/dashboard/risks`
- `frontend/app/dashboard/risks/page.tsx`
- `frontend/app/dashboard/risks/components/RiskForm.tsx`
- `frontend/app/dashboard/risks/components/RisksFilters.tsx`
- `frontend/app/dashboard/risks/components/RisksTable.tsx`
- `frontend/app/dashboard/risks/components/RisksTableRow.tsx`
- `frontend/app/dashboard/risks/new/page.tsx`
- `frontend/app/dashboard/risks/edit/[id]/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/risks` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura completa da listagem e do `RiskForm`, e pela evidencia observada do shell.

## Achados principais

### 1. Risks repete o padrao de cadastro pesado ja visto em Usuarios e Employees

- O `RiskForm` usa `PageHeader`, `StatusPill`, bloco de `Cadastro guiado`, varios cards de secao, muitos helpers e rodape destacado.
- Isso organiza o fluxo.
- Mas tambem gera excesso de moldura e massa visual.

### 2. O formulario e o ponto mais pesado do modulo

- O risco envolve contexto, classificacao, avaliacao, hierarquia e evidencias.
- Tudo isso e distribuido em varias secoes com bastante texto explicativo.
- O usuario recebe informacao demais no mesmo plano visual, especialmente em um modulo que deveria servir como biblioteca operacional de riscos.

### 3. A listagem esta relativamente limpa, mas ainda um pouco encorpada para o objetivo

- `RisksPage` adiciona metricas, toolbar com busca e exportar, depois tabela.
- O topo nao esta exagerado.
- Mesmo assim, ainda segue a linguagem de painel com mais enquadramento do que uma base catalografica exigiria.

### 4. O modulo continua verbal e guiado demais

- Muitos campos do `RiskForm` possuem explicacao persistente.
- Isso ajuda na primeira configuracao.
- Mas torna o uso cotidiano mais cansativo e visualmente carregado.

### 5. Ha residuos claros de motion, hover e spinner

- `RiskForm` usa `motion-safe:transition-all`.
- `RisksFilters` usa `motion-safe:transition-all`.
- `RisksTable` ainda usa spinner animado no loading.
- `RisksTableRow` e acoes do form mantem hover/transicao destacados.

## Problemas priorizados

### Prioridade alta

#### Problema: o formulario de riscos esta visualmente pesado demais

- Por que prejudica: o usuario precisa atravessar muitas camadas de bloco, texto e agrupamento antes de concluir um cadastro que deveria ser objetivo e padronizado.
- Como deve ficar: formulario mais enxuto, com hierarquia mais dura entre o que e obrigatorio, o que e avaliacao e o que e evidencia.
- Sugestao pratica: reduzir moldura geral, agrupar melhor as secoes e cortar parte dos helpers persistentes que hoje disputam atencao com os campos.

### Prioridade media

#### Problema: excesso de texto de apoio no `RiskForm`

- Por que prejudica: aumenta densidade visual e desacelera leitura recorrente.
- Como deve ficar: orientacoes apenas onde houver risco real de erro ou ambiguidade.
- Sugestao pratica: revisar helper por helper e manter somente os que impactam classificacao, tenant ou logica de calculo.

#### Problema: a listagem ainda tem tratamento visual mais "painel" do que "base"

- Por que prejudica: o modulo de biblioteca/catalogo perde objetividade e ganha cerimonia.
- Como deve ficar: busca, exportar e tabela com menos massa visual no topo.
- Sugestao pratica: condensar toolbar e metricas para que a grade de riscos assuma o protagonismo.

### Prioridade baixa

#### Problema: residuos de motion, hover e spinner permanecem espalhados no modulo

- Por que prejudica: adicionam ruido visual em um modulo ja bastante denso por natureza.
- Como deve ficar: superficie estavel, com feedbacks discretos e sem animacao perceptivel.
- Sugestao pratica: remover `motion-safe:*`, endurecer hovers de acoes e trocar spinner animado da tabela por estado estatico.

#### Problema: a validacao final da superficie segue mascarada pelo loading do shell

- Por que prejudica: impede confirmar acabamento real da experiencia autenticada.
- Como deve ficar: rota renderizando normalmente para revisao final da interface.
- Sugestao pratica: recuperar a conectividade do backend em `localhost:3011` antes da fase final de consolidacao visual.

## Veredito da Fase 16

Risks tem uma base funcional correta, mas visualmente ainda cai no mesmo problema dos formularios mais pesados do sistema: excesso de moldura, muito texto persistente e residuos de motion. O ajuste prioritario aqui e endurecer a hierarquia e secar o cadastro para que a biblioteca de riscos fique mais profissional, previsivel e menos cansativa no uso diario.
