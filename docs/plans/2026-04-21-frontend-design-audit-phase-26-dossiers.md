# Fase 26 - Auditoria Visual do Modulo Dossiers

Data: 2026-04-21
Escopo: emissao de dossie por colaborador e obra/setor, contexto governado, cards de politica e previa operacional

## Superficies validadas

- `http://localhost:3000/dashboard/dossiers`
- `frontend/app/dashboard/dossiers/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/dossiers` abriu apenas o shell do app.
- O console do navegador continuou registrando erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo tem proposta util, mas a composicao visual ainda parece interface antiga e isolada

- A pagina nao usa uma estrutura de listagem ou formulario mais padronizada do frontend recente.
- Ela monta tudo com cards simples empilhados, textos diretos e botoes full width.
- O resultado e funcional, mas com aparencia menos madura do que outras superficies mais novas.

### 2. Ha duplicacao visual forte entre os blocos de colaborador e obra/setor

- Os dois paineis repetem quase exatamente a mesma estrutura.
- Isso deixa a tela mais longa e mais pesada do que precisa.
- Visualmente, a pagina parece duas telas iguais lado a lado.

### 3. Os botoes dominam demais cada card principal

- Em cada bloco existem dois botoes largos e fortes logo abaixo dos selects.
- Como ambos os lados repetem esse padrao, a tela concentra muito peso de acao em pouco espaco.
- Isso enfraquece a leitura do contexto e fortalece demais o aspecto de comando bruto.

### 4. O bloco de politica oficial e correto conceitualmente, mas esta extenso demais

- Ele cumpre papel importante de governanca.
- Porem ocupa bastante espaco com quatro paragrafos em um painel de mesmo peso visual dos controles.
- Para rotina operacional, isso gera mais leitura obrigatoria do que o necessario.

### 5. A previa do recorte atual esta melhor direcionada, mas ainda convive com uma pagina sem hierarquia forte

- A previa tem valor real porque mostra oficiais, pendentes, apoio e codigo.
- O problema e que ela nao assume protagonismo claro nem fica bem integrada aos blocos de selecao.
- A tela acaba dividida em varios paineis equivalentes, sem um eixo principal nitido.

### 6. Ainda ha residuos de hover e transicao em um fluxo que deveria ser seco

- Inputs usam `motion-safe:transition`.
- Botoes usam `hover:bg-*`.
- Para o padrao desejado, essa resposta visual pode ser reduzida sem perda de uso.

## Problemas priorizados

### Prioridade alta

#### Problema: o modulo parece uma tela montada por blocos independentes, sem hierarquia visual forte

- Por que prejudica: o usuario nao entende rapidamente onde comeca a selecao, onde termina a decisao e onde fica a validacao do recorte.
- Como deve ficar: um fluxo mais linear, com selecao principal no topo e contexto governado como leitura complementar.
- Sugestao pratica: transformar a pagina em duas etapas visuais mais claras: selecao e emissao primeiro; previa e politica em nivel secundario depois.

#### Problema: existe repeticao excessiva entre dossie por colaborador e dossie por obra/setor

- Por que prejudica: alonga a pagina, duplica ruido e enfraquece a percepcao de padrao.
- Como deve ficar: estrutura compartilhada e mais compacta, mudando apenas o recorte selecionado.
- Sugestao pratica: padronizar os dois blocos com um mesmo componente visual e reduzir a quantidade de texto e espacamento repetidos.

### Prioridade media

#### Problema: os botoes full width concentram protagonismo demais

- Por que prejudica: a interface parece feita de acoes grandes e repetidas, e nao de um fluxo administrativo claro.
- Como deve ficar: acoes importantes, mas sem dominar cada card.
- Sugestao pratica: reduzir a agressividade visual dos botoes secundarios e aproximar PDF e ZIP de um agrupamento de acoes mais discreto.

#### Problema: o painel de politica oficial esta verboso para uso recorrente

- Por que prejudica: adiciona densidade textual fixa em uma tela que deveria ser objetiva.
- Como deve ficar: regras resumidas e consultaveis, sem competir com a operacao principal.
- Sugestao pratica: condensar os quatro paragrafos em lista curta de regras-chave ou bloco resumido com linguagem mais seca.

#### Problema: a previa do recorte perde forca dentro da malha atual

- Por que prejudica: o painel certo existe, mas fica visualmente no mesmo nivel de paineis menos importantes.
- Como deve ficar: previa como confirmacao operacional relevante, nao como mais um card equivalente.
- Sugestao pratica: reforcar a previa como bloco de validacao final e reduzir o peso dos paines auxiliares ao redor.

### Prioridade baixa

#### Problema: ainda ha transicoes e hovers onde bastaria resposta estatica

- Por que prejudica: adiciona microefeito desnecessario a um fluxo burocratico e objetivo.
- Como deve ficar: inputs e botoes com resposta visual seca e sem destaque animado.
- Sugestao pratica: remover `motion-safe:transition` dos campos e revisar `hover:*` dos botoes para comportamento mais discreto.

## Veredito da Fase 26

Dossiers tem uma funcao muito boa, mas visualmente ainda parece um modulo montado fora do padrao mais forte do sistema. O ganho aqui nao esta em mudar a funcionalidade; esta em reduzir duplicacao, organizar melhor a hierarquia e transformar a tela em um fluxo mais corporativo, mais compacto e mais claro.
