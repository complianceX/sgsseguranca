# Fase 11 - Auditoria Visual do Modulo Usuarios

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Usuarios

## Superficies validadas

- `http://localhost:3000/dashboard/users`
- `http://localhost:3000/dashboard/users/new`
- `frontend/app/dashboard/users/page.tsx`
- `frontend/app/dashboard/users/components/UserForm.tsx`
- `frontend/app/dashboard/users/components/UsersFilters.tsx`
- `frontend/app/dashboard/users/components/UsersTable.tsx`
- `frontend/app/dashboard/users/components/UsersTableRow.tsx`
- `frontend/app/dashboard/users/new/page.tsx`
- `frontend/app/dashboard/users/edit/[id]/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/users` abriu o shell do app, mas a tela ficou presa no loading centralizado.
- O navegador registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- As capturas locais desta fase confirmaram que o modulo nao chegou a renderizar a superficie autenticada por causa dessa dependencia do backend.
- O fechamento visual foi feito por codigo real, estrutura dos componentes e comportamento observado do shell.

## Achados principais

### 1. Usuarios esta visualmente mais organizado do que os modulos mais densos

- A listagem usa `ListPageLayout`, tabela objetiva e poucas colunas relevantes.
- O formulario tem estrutura clara e separa bem identificacao, vinculo e credenciais.
- Em termos de base, o modulo esta mais maduro do que DDS, PT e APR.

### 2. O modulo ainda adiciona moldura demais para uma rotina administrativa simples

- `page.tsx` combina metricas, toolbar descritiva e badges extras acima da tabela.
- `UserForm.tsx` reforca `PageHeader`, `StatusPill`, bloco de `Cadastro guiado`, cards de secao e rodape de acoes.
- O resultado e organizado, mas mais cerimonial do que o necessario para cadastro e manutencao de acesso.

### 3. O formulario continua verbal demais

- Ha muito texto auxiliar distribuido ao longo do form.
- Varios campos trazem explicacao persistente mesmo quando a acao e direta e previsivel.
- Isso melhora orientacao inicial, mas aumenta densidade visual e tempo de leitura.

### 4. A mesma estrutura atende Usuarios e Funcionarios

- O reaproveitamento e tecnicamente valido.
- Porem, visualmente ele pode enfraquecer a identidade da tela, porque um modulo de acesso e um cadastro operacional acabam herdando a mesma narrativa visual.
- Para auditoria visual, isso merece atencao porque tende a manter peso de interface igual em fluxos com objetivos diferentes.

### 5. Ainda ha residuos claros de motion e loading generico

- Busca com `motion-safe:transition-all`.
- Campos com `motion-safe:transition-all`.
- Botao de voltar com `motion-safe:transition-colors`.
- Loading da tabela com `motion-safe:animate-spin`.
- `new` e `edit` ainda usam fallback textual simples de `Carregando usuário...`.

## Problemas priorizados

### Prioridade media

#### Problema: a listagem usa camadas de contexto demais para um modulo de acesso simples

- Por que prejudica: metricas, descricoes e badges sobem a altura da tela antes da informacao principal.
- Como deve ficar: foco inicial em busca, CTA e tabela, com indicadores mais discretos.
- Sugestao pratica: reduzir o numero de metricas exibidas, remover badges redundantes e deixar a tabela mais proxima do topo.

#### Problema: o formulario usa excesso de enquadramento e texto de apoio

- Por que prejudica: passa sensacao de complexidade maior do que a tarefa real de cadastrar e vincular um usuario.
- Como deve ficar: cabecalho curto, secoes objetivas e menos explicacoes persistentes.
- Sugestao pratica: simplificar `PageHeader`, remover ou reduzir `Cadastro guiado` e encurtar helpers que hoje repetem o obvio.

#### Problema: a mesma casca visual atende fluxos com identidades diferentes

- Por que prejudica: reduz clareza entre gestao de acesso e cadastro operacional de funcionario.
- Como deve ficar: mesma base estrutural, mas com peso visual mais ajustado ao contexto de cada fluxo.
- Sugestao pratica: separar melhor a narrativa visual de `usuarios` e `employees`, evitando que ambos herdem o mesmo nivel de moldura e orientacao.

### Prioridade baixa

#### Problema: residuos de motion e spinner permanecem no modulo

- Por que prejudica: mantem uma linguagem visual mais "reativa" do que o padrao seco e corporativo desejado.
- Como deve ficar: foco visual estavel e feedbacks sem animacao.
- Sugestao pratica: remover `motion-safe:*` e spinner animado da tabela e dos campos, trocando por estados estaticos.

#### Problema: `new` e `edit` ainda usam loading generico

- Por que prejudica: o carregamento nao antecipa a estrutura real da tela.
- Como deve ficar: skeleton coerente com header e grupos do formulario.
- Sugestao pratica: substituir o card textual por placeholder simples alinhado ao formulario de usuarios.

## Veredito da Fase 11

Usuarios esta em um patamar visual bom dentro do sistema. A base e clara, funcional e profissional. O que falta aqui nao e reorganizacao radical, e refinamento: menos moldura, menos texto persistente, menos altura acima da tabela e remocao definitiva dos residuos de motion para o modulo ficar realmente simples e administrativo.
