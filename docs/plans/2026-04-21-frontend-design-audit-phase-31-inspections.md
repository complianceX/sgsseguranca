# Fase 31 - Auditoria Visual do Modulo Inspections

Data: 2026-04-21
Escopo: listagem principal, busca, acoes por linha, arquivos governados e wrappers de novo/edicao

## Superficies validadas

- `http://localhost:3000/dashboard/inspections`
- `frontend/app/dashboard/inspections/page.tsx`
- `frontend/app/dashboard/inspections/new/page.tsx`
- `frontend/app/dashboard/inspections/edit/[id]/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/inspections` nao carregou a listagem autenticada.
- Em vez disso, a superficie mostrou uma tela de erro de sessao com a mensagem `Sessao nao encontrada`.
- O navegador tambem registrou erros de runtime ligados ao problema atual de sessao/autenticacao.
- O fechamento visual foi feito por leitura integral das superficies reais e pela evidencia observada em browser.

## Achados principais

### 1. A estrutura base da listagem e boa, mas a coluna de acoes passou do ponto

- A tabela em si e objetiva.
- Porem cada linha concentra SOPHIE, PDF governado, imprimir, e-mail, download, editar e excluir.
- Isso transforma a area de acoes em um bloco visual muito forte e carregado.

### 2. O modulo mistura operacao documental, automacao e edicao no mesmo nivel

- A tela nao oferece so manutencao da inspecao.
- Ela tambem governa PDF final, fallback, envio, impressao e abertura de NC com AI.
- O resultado e poderoso, mas visualmente denso para uma listagem.

### 3. O `StoredFilesPanel` amplia bastante o peso da pagina

- Depois da tabela, ainda existe uma superficie documental propria para arquivos emitidos.
- Isso aumenta o escopo visual do modulo e o aproxima de uma central paralela.
- A pagina deixa de ser apenas uma lista de inspecoes.

### 4. O destaque para risco operacional esta razoavel, mas ainda soma mais uma camada de atencao

- O `InlineCallout` de foco operacional faz sentido.
- Mas entra junto com tabela densa, acoes em excesso e painel de arquivos.
- O modulo acumula varias subcamadas em uma unica superficie.

### 5. `new` e `edit` estao mais limpos que a listagem

- Os wrappers de formulario usam card de cabecalho simples, descricao curta e CTA de voltar.
- Visualmente, isso esta melhor resolvido do que a pagina principal.
- O ponto mais fraco ali ainda e o loading textual generico do `InspectionForm`.

### 6. Ainda ha animacao e hover onde nao precisa

- Skeleton do `StoredFilesPanel` usa `motion-safe:animate-pulse`.
- Input de busca usa `motion-safe:transition-all`.
- Excluir usa hover destacado.
- Para o padrao desejado, isso pode ser mais seco.

## Problemas priorizados

### Prioridade alta

#### Problema: ha acoes demais visiveis por linha

- Por que prejudica: a leitura da tabela perde prioridade para a barra de icones.
- Como deve ficar: acao principal evidente e demais acoes em camada secundaria.
- Sugestao pratica: reduzir a quantidade de acoes expostas por registro e mover parte delas para menu contextual ou agrupamento "mais".

#### Problema: a pagina mistura listagem e central documental no mesmo fluxo

- Por que prejudica: o usuario entra para gerenciar inspecoes, mas encontra uma segunda camada grande de arquivos governados na mesma tela.
- Como deve ficar: listagem principal mais objetiva e painel documental em nivel secundario.
- Sugestao pratica: rebaixar visualmente o `StoredFilesPanel`, ou separar seu protagonismo da listagem principal.

### Prioridade media

#### Problema: a tabela ja nasce funcional, mas esta sobrecarregada por automacoes e atalhos

- Por que prejudica: a pagina parece um centro de comando em vez de uma lista administrativa clara.
- Como deve ficar: informacao principal em primeiro plano, automacoes como apoio.
- Sugestao pratica: simplificar a coluna de acoes e revisar o peso iconografico dos atalhos de AI, PDF governado e documentos.

#### Problema: o callout de foco operacional soma mais uma camada em uma tela ja densa

- Por que prejudica: contribui para a sensacao de multiplos blocos concorrentes antes do trabalho principal.
- Como deve ficar: alerta presente apenas quando trouxer urgencia real e com peso visual mais contido.
- Sugestao pratica: reduzir o protagonismo visual do callout quando ele for apenas informativo e nao critico.

#### Problema: os wrappers `new` e `edit` ainda carregam loading textual generico

- Por que prejudica: o carregamento nao antecipa a estrutura do formulario real.
- Como deve ficar: placeholder coerente com o layout do form.
- Sugestao pratica: substituir os blocos "Carregando..." por skeleton mais alinhado ao `InspectionForm`.

### Prioridade baixa

#### Problema: ainda ha pulse, transicoes e hovers destacados

- Por que prejudica: adicionam movimento visual desnecessario a um modulo naturalmente operacional.
- Como deve ficar: interacao simples, estatica e objetiva.
- Sugestao pratica: remover `motion-safe:*` e reduzir hovers chamativos nas acoes da listagem.

## Veredito da Fase 31

Inspections tem boa base de listagem e wrappers de formulario mais limpos do que a media, mas exagera no numero de acoes visiveis e no acoplamento com operacao documental. O caminho certo aqui e simplificar a tabela, rebaixar o peso do painel de arquivos e deixar a leitura da inspecao acima das automacoes.
