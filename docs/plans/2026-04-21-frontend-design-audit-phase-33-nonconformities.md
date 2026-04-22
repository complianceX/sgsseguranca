# Fase 33 - Auditoria Visual do Modulo Nonconformities

Data: 2026-04-21
Escopo: listagem principal, metricas, callout, mudanca de status, acoes por linha, arquivos governados e wrappers de novo/edicao

## Superficies validadas

- `http://localhost:3000/dashboard/nonconformities`
- `frontend/app/dashboard/nonconformities/page.tsx`
- `frontend/app/dashboard/nonconformities/new/page.tsx`
- `frontend/app/dashboard/nonconformities/edit/[id]/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/nonconformities` abriu apenas o shell do app.
- O console do navegador continuou sinalizando erro de runtime ligado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral das superficies reais e pela evidencia observada do shell.

## Achados principais

### 1. O modulo esta bem orientado a operacao, mas visualmente muito carregado

- Header com metricas.
- Toolbar com busca.
- Callout de tratativa.
- Tabela com status e acao.
- Painel de arquivos governados.
- A pagina fica claramente util, mas com excesso de subcamadas na mesma superficie.

### 2. O bloco de status e um dos pontos mais pesados da tabela

- Cada item combina `StatusPill`.
- Em muitos casos, ainda exibe `StatusSelect`.
- Isso torna a coluna de status funcionalmente forte, mas visualmente muito dominante.
- A leitura da linha fica quebrada entre conteudo e controle.

### 3. Acoes e tratativas aparecem em muitos pontos ao mesmo tempo

- CAPA.
- E-mail.
- Editar.
- Excluir.
- Mudanca de status.
- Callout global.
- O modulo transmite urgencia o tempo inteiro, o que pesa visualmente.

### 4. O padrao de acoplar `StoredFilesPanel` reaparece e aumenta o escopo visual da tela

- Depois da listagem, a pagina ainda exibe uma segunda secao documental.
- Isso amplia a densidade e enfraquece a separacao entre gestao do desvio e arquivo final.

### 5. `new` e `edit` estao mais bem resolvidos que wrappers antigos, mas ainda podem ficar mais secos

- Os cabecalhos sao melhores do que os de `audits`.
- Ainda assim, o destaque do icone e do hero do cabecalho pode ser mais contido para um fluxo de tratativa.

### 6. Ainda ha pulse, transicoes e hover em excesso

- Skeleton do `StoredFilesPanel` usa `motion-safe:animate-pulse`.
- Busca usa `motion-safe:transition-all`.
- Excluir usa hover forte.
- Isso foge do padrao mais estavel que voce quer.

## Problemas priorizados

### Prioridade alta

#### Problema: a coluna de status mistura leitura e controle com peso excessivo

- Por que prejudica: a linha perde fluidez porque status e mudanca de status ocupam area demais.
- Como deve ficar: leitura de status simples, com alteracao menos intrusiva.
- Sugestao pratica: rebaixar o `StatusSelect` para interacao secundaria e deixar o `StatusPill` como leitura principal da coluna.

#### Problema: o modulo concentra urgencia visual demais na mesma tela

- Por que prejudica: metricas, callout, status e acoes reforcam o mesmo tom de alerta ao mesmo tempo.
- Como deve ficar: prioridades mais graduadas e menos elementos chamando atencao simultaneamente.
- Sugestao pratica: reduzir o peso do callout, controlar melhor o uso de tons fortes e manter destaque maximo apenas para desvios realmente criticos.

### Prioridade media

#### Problema: acoes por linha ainda estao fortes demais

- Por que prejudica: o usuario percebe muitos controles antes de consolidar a leitura do desvio.
- Como deve ficar: linha mais seca, com acao principal evidente e demais operacoes mais discretas.
- Sugestao pratica: agrupar acoes secundarias e reduzir a exposicao simultanea de CAPA, e-mail, edicao e exclusao.

#### Problema: a pagina mistura listagem com central documental novamente

- Por que prejudica: amplia demais o escopo visual e aumenta a fadiga na mesma superficie.
- Como deve ficar: listagem principal clara e documental em camada secundara.
- Sugestao pratica: rebaixar o `StoredFilesPanel` ou reposiciona-lo para nao competir com a tabela.

#### Problema: os wrappers `new/edit` ainda podem ficar mais corporativos e menos heroicos

- Por que prejudica: o cabecalho continua chamando mais atencao do que o necessario para um fluxo de tratativa.
- Como deve ficar: topo mais simples e mais orientado a formulario.
- Sugestao pratica: reduzir peso do icone e da introducao para deixar o formulario assumir o protagonismo.

### Prioridade baixa

#### Problema: permanecem transicoes e pulse desnecessarios

- Por que prejudica: adicionam microefeitos a um modulo que deveria ser seco e objetivo.
- Como deve ficar: comportamento estatico e direto.
- Sugestao pratica: remover `motion-safe:*` e rever hovers destacados nas acoes mais sensiveis.

## Veredito da Fase 33

Nonconformities esta funcionalmente bem montado e mais claro do que varios modulos complexos do sistema, mas ainda sofre por excesso de urgencia visual e por misturar leitura, tratativa e documental no mesmo plano. O ajuste principal aqui e secar a tela sem perder controle operacional.
