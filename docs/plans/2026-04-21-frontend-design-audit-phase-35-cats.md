# Fase 35 - Auditoria Visual do Modulo CATs

Data: 2026-04-21
Escopo: fluxo de CAT, resumo superior, formulario inline, tabela principal, anexos e acoes por linha

## Superficies validadas

- `http://localhost:3000/dashboard/cats`
- `frontend/app/dashboard/cats/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/cats` abriu apenas o shell do app.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo e funcionalmente rico, mas visualmente muito concentrado

- Header simples.
- Grade de KPIs.
- Formulario inline grande.
- Tabela com anexos e varias acoes por linha.
- Modal de e-mail.
- Tudo acontece em uma unica superficie e com pouca separacao hierarquica.

### 2. O formulario inline pesa demais para o topo da pagina

- Data, tipo, gravidade, colaborador, obra, local, acao imediata, descricao e busca.
- Em modo de edicao, ele ainda cresce mais.
- Isso ocupa muito espaco antes da lista e faz a tela parecer mais um centro de cadastro do que um acompanhamento operacional.

### 3. A coluna de acoes da tabela esta carregada demais

- Anexar.
- PDF local.
- PDF final.
- E-mail.
- Editar.
- Investigar.
- Fechar.
- Cada linha vira praticamente uma barra de ferramentas completa.

### 4. O bloco de anexos dentro da propria linha aumenta a densidade da tabela

- Ate dois anexos aparecem como botao dentro da linha.
- Ainda pode haver contador adicional.
- Isso melhora acesso rapido, mas aumenta o ruido visual da grade.

### 5. O modulo usa linguagem visual mais antiga do que o restante do frontend recente

- `ds-surface-card` simples.
- Inputs e botoes mais crus.
- Tabela com status em texto puro.
- O resultado parece menos refinado e menos padronizado do que outros modulos mais novos.

### 6. Ainda ha hover forte e muito controle exposto

- Quase toda acao usa borda + hover.
- O efeito visual e de painel cheio de comandos pequenos.
- Para o padrao que voce quer, isso precisa secar bastante.

## Problemas priorizados

### Prioridade alta

#### Problema: o formulario inline domina a tela e empurra a listagem para baixo

- Por que prejudica: o usuario entra para acompanhar CATs e encontra primeiro um bloco pesado de cadastro.
- Como deve ficar: criacao mais contida e acompanhamento mais central.
- Sugestao pratica: rebaixar o formulario, colapsa-lo ou separar abertura/edicao da listagem principal.

#### Problema: a tabela expoe acoes demais por linha

- Por que prejudica: a leitura do caso fica em segundo plano e a linha vira uma barra operacional.
- Como deve ficar: acao principal visivel e operacoes secundarias agrupadas.
- Sugestao pratica: reduzir a quantidade de botoes expostos e mover parte das acoes para menu secundario.

### Prioridade media

#### Problema: o bloco de anexos dentro da linha polui a tabela

- Por que prejudica: aumenta a fragmentacao visual e dificulta escaneamento rapido.
- Como deve ficar: anexos indicados de forma mais leve, com acesso em camada secundaria.
- Sugestao pratica: substituir botoes de anexo na linha por contador ou acesso resumido com detalhe sob demanda.

#### Problema: o modulo parece visualmente antigo em comparacao com outras superficies

- Por que prejudica: reduz consistencia geral e passa sensacao de tela menos acabada.
- Como deve ficar: hierarquia mais moderna, com blocos mais contidos e linguagem mais alinhada ao design system recente.
- Sugestao pratica: padronizar cabecalho, filtros, tabela e acoes conforme os wrappers e layouts mais atuais do frontend.

### Prioridade baixa

#### Problema: ha hover demais em acoes pequenas

- Por que prejudica: reforca ruido visual e excesso de microinteracao.
- Como deve ficar: botoes e links mais secos, com comportamento mais estavel.
- Sugestao pratica: reduzir hovers chamativos e manter diferenciacao visual apenas nas acoes realmente sensiveis.

## Veredito da Fase 35

CATs e um modulo forte operacionalmente, mas com tela muito concentrada e antiga no acabamento. O ganho principal aqui e separar melhor cadastro de acompanhamento e reduzir drasticamente a quantidade de controles expostos por registro.
