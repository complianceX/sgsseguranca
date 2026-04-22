# Fase 9 - Auditoria Visual do Modulo Empresas

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Empresas

## Superficies validadas

- `http://localhost:3000/dashboard/companies`
- `http://localhost:3000/dashboard/companies/new`
- `frontend/app/dashboard/companies/page.tsx`
- `frontend/app/dashboard/companies/new/page.tsx`
- `frontend/app/dashboard/companies/edit/[id]/page.tsx`
- `frontend/components/CompanyForm.tsx`

## Validacao visual real

- As rotas `/dashboard/companies` e `/dashboard/companies/new` responderam `200`.
- As capturas locais desta fase cairam novamente no loading centralizado do shell autenticado.
- Por isso, o fechamento visual do modulo foi feito por codigo, pela validacao real das rotas e pela leitura estrutural dos componentes usados na listagem e no formulario.

## Achados principais

### 1. Empresas esta entre os modulos mais limpos auditados ate agora

- A listagem e objetiva.
- A grade principal trabalha com poucas colunas e boa leitura operacional.
- O formulario tambem tem estrutura clara e nao entra no excesso extremo visto em PT, APR e DDS.

### 2. O principal problema do modulo nao e bagunca, e excesso de cerimonia

- `CompanyForm.tsx` usa `PageHeader`, pílulas de contexto, bloco de `Cadastro guiado`, cards de secao e rodape de acao.
- Para um cadastro administrativo simples, a interface fica mais solene do que precisa.
- O modulo transmite organizacao, mas gasta area visual demais com enquadramento.

### 3. A listagem adiciona resumo e tratamento visual que podem ser mais secos

- `companies/page.tsx` usa topo com metricas, barra de acao e pesquisa enriquecida.
- Isso nao chega a confundir.
- Mas aumenta a altura inicial da tela antes do usuario chegar na tabela, mesmo em um modulo que poderia ser quase imediato.

### 4. Ainda existem residuos de motion e feedback visual desnecessario

- O campo de busca da listagem ainda usa `motion-safe:transition-all`.
- `CompanyForm.tsx` mantem `transition-all` nos campos.
- O botao de salvamento ainda usa spinner com `animate-spin`.
- Para a direcao visual que voce definiu, isso continua desalinhado com a meta de interface mais seca e corporativa.

### 5. O modulo esta padronizado, mas ainda nao esta no ponto maximo de sobriedade

- Visualmente ele nao parece amador.
- O problema e mais fino: sobra moldura, sobra texto de apoio e sobra tratamento interativo em um fluxo que deveria ser quase neutro.

## Problemas priorizados

### Prioridade media

#### Problema: o formulario de empresa usa enquadramento demais para uma tarefa simples

- Por que prejudica: aumenta a sensacao de peso e faz o cadastro parecer mais complexo do que realmente e.
- Como deve ficar: tela mais direta, com cabecalho curto, secoes objetivas e menos blocos auxiliares persistentes.
- Sugestao pratica: reduzir ou remover o bloco `Cadastro guiado`, simplificar o header e deixar as secoes com menos texto de apoio.

#### Problema: a area superior da listagem ocupa espaco demais antes da tabela

- Por que prejudica: atrasa a leitura da informacao principal em um modulo que deveria ser rapido de operar.
- Como deve ficar: busca, CTA e indicadores minimos, com prioridade para a grade de registros.
- Sugestao pratica: condensar metricas em formato mais discreto ou remover parte delas neste modulo, preservando apenas o que realmente ajuda a operacao.

### Prioridade baixa

#### Problema: residuos de motion permanecem em busca, campos e salvamento

- Por que prejudica: introduzem uma linguagem visual mais "reativa" do que o padrao empresarial simples que voce quer consolidar.
- Como deve ficar: transicoes minimas ou inexistentes, com foco em leitura e estado estatico claro.
- Sugestao pratica: remover `transition-all`, `motion-safe:*` e spinner animado deste modulo, substituindo por estado textual ou indicador fixo.

#### Problema: o modulo ainda depende de loading generico nas telas protegidas

- Por que prejudica: quando a tela demora a resolver, ela nao antecipa a estrutura real da pagina.
- Como deve ficar: skeleton simples e coerente com listagem ou formulario.
- Sugestao pratica: criar fallback especifico para `companies/new` e `companies/edit`, com placeholders de cabecalho e campos principais.

## Veredito da Fase 9

Empresas esta visualmente acima da media dos modulos ja auditados. Nao sofre de poluicao severa nem de desorganizacao estrutural. O ajuste aqui e de refinamento: remover cerimonia excessiva, encurtar a moldura da tela e eliminar residuos de motion para transformar o modulo em um cadastro empresarial realmente direto, limpo e profissional.
