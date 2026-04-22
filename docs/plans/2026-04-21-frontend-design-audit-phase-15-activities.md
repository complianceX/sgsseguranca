# Fase 15 - Auditoria Visual do Modulo Activities

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Activities

## Superficies validadas

- `http://localhost:3000/dashboard/activities`
- `frontend/app/dashboard/activities/page.tsx`
- `frontend/app/dashboard/activities/new/page.tsx`
- `frontend/app/dashboard/activities/edit/[id]/page.tsx`
- `frontend/components/ActivityForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/activities` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura da listagem e do `ActivityForm`, e pela evidencia observada do shell.

## Achados principais

### 1. Activities esta entre os modulos mais simples e diretos da base

- A listagem trabalha com poucas colunas e objetivo claro.
- O modulo nao sofre de excesso de governanca ou observabilidade paralela.
- A base e adequada para um cadastro operacional enxuto.

### 2. O principal problema do modulo e excesso de moldura no formulario

- `ActivityForm.tsx` repete o mesmo pacote visual visto em outros cadastros: `PageHeader`, `StatusPill`, bloco de `Cadastro guiado`, card interno de secao e rodape com acoes destacadas.
- Para um cadastro muito simples, isso deixa a tela mais solene do que precisa.
- O modulo parece mais encorpado do que a complexidade real da tarefa.

### 3. A listagem esta limpa, mas ainda segue a linguagem visual mais "ativa" do sistema

- O campo de busca usa `motion-safe:transition-all`.
- Os botoes de acao e remocao continuam com hover mais destacado.
- Isso nao compromete a estrutura.
- Mas mantem a tela menos seca do que o padrao empresarial que voce quer consolidar.

### 4. O formulario tambem esta verbal demais para um cadastro basico

- Empresa, nome e descricao sao poucos campos.
- Mesmo assim, o form adiciona bloco guiado, helpers persistentes e mensagem de submit em destaque.
- Em termos de usabilidade, isso traz mais leitura do que ganho real para uso recorrente.

### 5. O loading de `new` e `edit` continua generico

- Ambas as rotas usam um card textual simples de `Carregando atividade...`.
- Isso e consistente entre si.
- Mas ainda nao antecipa a estrutura real da tela.

## Problemas priorizados

### Prioridade media

#### Problema: o formulario usa enquadramento demais para um cadastro muito simples

- Por que prejudica: aumenta a sensacao de complexidade e deixa a tela maior e mais pesada do que o necessario.
- Como deve ficar: cabecalho curto, secao unica objetiva e menos apoio visual persistente.
- Sugestao pratica: reduzir `StatusPill`, encurtar ou remover `Cadastro guiado` e simplificar a secao principal do form.

#### Problema: o modulo continua mais verbal do que deveria

- Por que prejudica: exige leitura desnecessaria em um fluxo de baixa complexidade.
- Como deve ficar: labels claras e poucos textos auxiliares, apenas onde houver risco real de erro.
- Sugestao pratica: enxugar helpers e explicacoes longas nos campos de empresa, nome e descricao.

### Prioridade baixa

#### Problema: residuos de motion, hover e spinner permanecem no modulo

- Por que prejudica: deixam a interface mais reativa do que o padrao seco e corporativo desejado.
- Como deve ficar: estados mais estaveis, sem transicoes perceptiveis e sem spinner chamativo.
- Sugestao pratica: remover `transition-all`, endurecer hover de acoes e trocar o spinner animado do submit por feedback estatico.

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: o carregamento nao comunica a estrutura final do modulo.
- Como deve ficar: placeholder coerente com header e formulario.
- Sugestao pratica: substituir o card textual por skeleton curto alinhado ao layout real de `ActivityForm`.

## Veredito da Fase 15

Activities e um dos modulos mais limpos da base e nao apresenta problema estrutural grave de organizacao visual. O que falta aqui e refinamento de sobriedade: menos moldura no formulario, menos texto de apoio e remocao dos residuos de motion para que o cadastro fique realmente simples, rapido e corporativo.
