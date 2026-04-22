# Fase 40 - Auditoria Visual do Modulo EPI Fichas

Data: 2026-04-21
Escopo: cabecalho, KPIs, formulario de entrega, tabela principal, devolucao, substituicao, assinatura e paginacao

## Superficies validadas

- `http://localhost:3000/dashboard/epi-fichas`
- `frontend/app/dashboard/epi-fichas/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/epi-fichas` abriu apenas o shell do app.
- O frontend nao exibiu a superficie autenticada completa durante a validacao visual desta fase.
- O fechamento foi feito pela leitura integral da tela real e pela evidencia do shell observada no navegador.

## Achados principais

### 1. Este modulo esta visualmente abaixo do padrao medio mais recente do frontend

- Nao usa `ListPageLayout`.
- Nao usa `PageHeader`.
- Nao usa composicao mais madura de toolbar e filtros.
- O resultado e uma tela funcional, mas crua e pouco refinada.

### 2. O formulario principal esta comprimido e mal hierarquizado

- KPIs em cima.
- Logo abaixo, uma grade de seis colunas com tudo junto.
- Select de EPI.
- Select de colaborador.
- Quantidade.
- Observacoes.
- Assinatura.
- Busca de EPI.
- Busca de colaborador.
- Botao registrar.
- A tela mistura cadastro, busca e acao principal no mesmo bloco sem respiracao suficiente.

### 3. O modulo depende demais de placeholders e rotulos curtos

- `EPI`.
- `Colaborador`.
- `Quantidade`.
- `Observacoes`.
- `Buscar EPI`.
- `Buscar colaborador`.
- Isso deixa o fluxo mais seco do que profissional, com pouca orientacao visual e baixo acabamento corporativo.

### 4. Devolucao e substituicao usam `window.prompt`, o que derruba o nivel visual do modulo

- O usuario sai do padrao da interface.
- O fluxo perde contexto.
- O resultado fica improvisado.
- Para um sistema corporativo, isso passa aparencia amadora.

### 5. Os botoes e campos ainda estao pouco padronizados em comparacao com os modulos mais novos

- Botoes crus com classes locais.
- Hovers mais evidentes do que o necessario.
- Campos sem o mesmo acabamento dos formularios mais recentes.
- O modulo parece de uma geracao visual anterior do sistema.

### 6. A tabela e aceitavel, mas o topo da tela esta desequilibrado

- KPIs sao simples.
- O bloco de nova ficha e pesado.
- A tabela vem logo depois.
- Falta uma composicao mais limpa entre resumo, filtro e operacao.

## Problemas priorizados

### Prioridade alta

#### Problema: o formulario de nova ficha esta condensado demais e sem hierarquia visual clara

- Por que prejudica: aumenta risco de erro, passa sensacao de tela apertada e reduz a clareza do fluxo.
- Como deve ficar: formulario dividido em grupos logicos, com melhor sequencia entre selecao, assinatura e confirmacao.
- Sugestao pratica: separar o bloco em duas linhas ou secoes distintas, deixando identificacao do colaborador e do EPI acima, assinatura no meio e acao final isolada no rodape.

#### Problema: uso de `window.prompt` em devolucao e substituicao

- Por que prejudica: quebra consistencia visual, empobrece a experiencia e transmite acabamento fraco.
- Como deve ficar: interacao dentro do proprio sistema, com contexto, titulo e campos claros.
- Sugestao pratica: trocar os prompts por modal simples e objetivo com motivo, confirmacao e acao primaria padronizada.

### Prioridade media

#### Problema: o modulo nao acompanha o padrao visual mais recente de listagens do frontend

- Por que prejudica: cria despadronizacao entre modulos e faz a interface parecer montada em epocas diferentes.
- Como deve ficar: mesma linguagem estrutural de cabecalho, toolbar, filtros e tabela usada nas telas mais maduras.
- Sugestao pratica: migrar o topo para `ListPageLayout`, usando um header com descricao, KPIs mais limpos e toolbar separada do formulario.

#### Problema: campos e botoes estao com acabamento abaixo do restante do sistema

- Por que prejudica: reduz percepcao de qualidade e enfraquece a consistencia corporativa.
- Como deve ficar: componentes com o mesmo padrao visual dos formularios mais novos.
- Sugestao pratica: substituir classes locais por tokens e wrappers de formulario ja usados em modulos como `trainings`.

### Prioridade baixa

#### Problema: hover e destaque de botoes ainda sao mais chamativos do que o necessario

- Por que prejudica: adiciona ruido em uma tela que precisa ser apenas objetiva.
- Como deve ficar: botoes simples, estaveis e discretos.
- Sugestao pratica: reduzir hover visual, manter contraste consistente e remover qualquer reforco de efeito que nao seja estritamente funcional.

## Veredito da Fase 40

EPI Fichas e um modulo funcional, mas visualmente ainda cru. Aqui o ganho nao esta em adicionar sofisticacao: esta em elevar a estrutura, padronizar os componentes e eliminar sinais de improviso, principalmente no formulario principal e nos prompts de devolucao e substituicao.
