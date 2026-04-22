# Fase 13 - Auditoria Visual do Modulo Employees

Data: 2026-04-21
Escopo: listagem, criacao, edicao e superficies principais do modulo Employees

## Superficies validadas

- `http://localhost:3000/dashboard/employees`
- `http://localhost:3000/dashboard/employees/new`
- `frontend/app/dashboard/employees/page.tsx`
- `frontend/app/dashboard/employees/new/page.tsx`
- `frontend/app/dashboard/employees/[id]/page.tsx`
- `frontend/app/dashboard/users/components/UserForm.tsx`

## Validacao visual real

- As tentativas de `Invoke-WebRequest` para `/dashboard/employees` e `/dashboard/employees/new` ficaram penduradas no shell local.
- A navegacao automatizada no navegador abriu a rota, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- O fechamento visual do modulo foi feito por codigo real, reaproveitamento estrutural do `UserForm` e evidencia observada do shell.

## Achados principais

### 1. Employees herda a mesma casca visual pesada do modulo Usuarios

- `employees/new` e `employees/[id]` reaproveitam `frontend/app/dashboard/users/components/UserForm.tsx`.
- Isso garante consistencia estrutural.
- Porem, herda tambem o mesmo excesso de moldura, textos auxiliares e enquadramento visual para um cadastro que deveria ser mais direto.

### 2. A listagem do modulo tem boa base operacional, mas sobe informacao demais antes da tabela

- `page.tsx` combina header, quatro metricas, toolbar, callout de atencao e so depois chega na tabela.
- O resultado nao e caotico.
- Mas fica mais pesado do que o necessario para uma rotina de consulta e manutencao de funcionarios.

### 3. O formulario esta sobre-fragmentado

- O fluxo de funcionario soma `PageHeader`, bloco de `Cadastro guiado`, cards internos por secao e rodape de acoes.
- Isso cria camadas demais de borda, sombra e descricao.
- Visualmente, a tela passa mais sensacao de painel administrativo do que de cadastro operacional enxuto.

### 4. O modulo repete linguagem verbal demais

- Helpers e textos de apoio aparecem em grande parte dos campos.
- Para primeiros usos isso ajuda.
- Para operacao recorrente, aumenta densidade e reduz a rapidez de leitura.

### 5. Ha inconsistencias de loading e residuos de motion

- `employees/new` usa fallback simples em card textual.
- `employees/[id]` usa `PageLoadingState`.
- A busca ainda usa `motion-safe:transition-all`.
- A tabela e o link de voltar ainda dependem de hover e transicao visual.

## Problemas priorizados

### Prioridade alta

#### Problema: o formulario de funcionario esta visualmente sobre-enquadrado

- Por que prejudica: cria excesso de moldura, enfraquece a hierarquia e faz o cadastro parecer mais complexo do que realmente e.
- Como deve ficar: um formulario mais seco, com menos blocos concorrendo entre si e menos texto persistente.
- Sugestao pratica: reduzir a casca herdada de `UserForm`, rebaixar ou remover `Cadastro guiado` e evitar card dentro de card dentro de form.

### Prioridade media

#### Problema: a listagem concentra contexto demais antes da informacao principal

- Por que prejudica: a leitura da tabela demora mais a começar e a tela ganha peso de painel.
- Como deve ficar: busca, CTA e tabela como foco principal, com metricas e alertas mais contidos.
- Sugestao pratica: reduzir a massa do topo e tornar o `InlineCallout` menos protagonista, especialmente quando a pendencia de obra/setor nao for critica.

#### Problema: o modulo perde identidade propria ao reutilizar integralmente a narrativa visual de Usuarios

- Por que prejudica: gestao de acesso e cadastro operacional acabam parecendo o mesmo tipo de tarefa.
- Como deve ficar: mesma base de componentes, mas com peso visual ajustado ao contexto de funcionario.
- Sugestao pratica: diferenciar melhor `Employees` de `Users` no enquadramento, no texto e no nivel de apoio visual.

### Prioridade baixa

#### Problema: criacao e edicao usam loadings diferentes

- Por que prejudica: a experiencia de telas irmas fica inconsistente.
- Como deve ficar: comportamento de loading uniforme e coerente com o layout final.
- Sugestao pratica: padronizar `new` e `edit` em um mesmo fallback visual, preferencialmente alinhado ao formulario real.

#### Problema: residuos de motion e hover permanecem espalhados no modulo

- Por que prejudica: mantem uma interface mais "reativa" do que o padrao corporativo seco desejado.
- Como deve ficar: estados estaveis, sem transicoes perceptiveis e sem hover competitivo.
- Sugestao pratica: remover `motion-safe:*` da busca e endurecer o tratamento visual de links e linhas de acao.

## Veredito da Fase 13

Employees tem base funcional boa, mas visualmente ainda herda peso demais de um formulario mais generico e administrativo. O ajuste prioritario aqui nao e estrutural de dominio, e sim de refinamento visual: menos moldura, menos texto auxiliar, menos altura antes da tabela e uma identidade mais clara de cadastro operacional.
