# Fase 6 - Auditoria Visual do Modulo APR

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo APR

## Superficies validadas

- `http://localhost:3000/dashboard/aprs`
- `http://localhost:3000/dashboard/aprs/new`
- `frontend/app/dashboard/aprs/page.tsx`
- `frontend/app/dashboard/aprs/components/AprForm.tsx`
- `frontend/app/dashboard/aprs/components/AprListingToolbar.tsx`
- `frontend/app/dashboard/aprs/components/AprListingTable.tsx`
- `frontend/app/dashboard/aprs/components/AprListingRow.tsx`
- `frontend/app/dashboard/aprs/new/page.tsx`
- `frontend/app/dashboard/aprs/edit/[id]/page.tsx`

## Validacao visual real

- A listagem `/dashboard/aprs` respondeu `200`.
- A criacao correta respondeu `200` em `/dashboard/aprs/new`.
- As capturas locais tambem cairam em loading centralizado do shell, sem mostrar o modulo finalizado em tela.
- Por isso, o diagnostico desta fase foi fechado com validacao parcial da superficie real e leitura direta dos componentes do modulo.

## Achados principais

### 1. O APR e o modulo visualmente mais denso auditado ate aqui

- O formulario concentra wizard, resumo executivo, timeline, compliance, aprovacao, assinatura, exportacao, importacao, modo compacto, score de risco e revisao final.
- A listagem tambem vai alem de uma tabela simples: filtros amplos, densidade, exportacao, drawer de filtros, cards, acoes moderadas, assinaturas e PDF.
- O modulo e robusto, mas hoje parece um produto dentro do produto.

### 2. A linguagem visual do APR esta sofisticada demais para o objetivo corporativo enxuto

- O proprio texto de `page.tsx` chama o modulo de `Controle premium`.
- Ha grande quantidade de cards, paines interativos, chips, estados e destaques concorrendo ao mesmo tempo.
- O resultado tende mais a cockpit sofisticado do que a fluxo empresarial seco e objetivo.

### 3. A listagem tem excesso de ferramentas e densidade estrutural alta

- `AprListingToolbar.tsx` concentra busca, status, obra, responsavel, vencimento, filtros avancados, ordenacao, densidade e exportacao.
- `AprListingTable.tsx` usa `min-w-[1480px]`.
- `AprListingRow.tsx` adiciona mais uma camada forte de status, assinatura, PDF e menu de acoes por linha.
- Isso cria uma tela poderosa, mas visualmente pesada e longa para leitura diaria.

### 4. O formulario do APR esta maduro, mas muito carregado

- `AprForm.tsx` nao e apenas um formulario; ele agrega jornada de edicao, trilha de aprovacao, assinatura, compliance, resumo executivo e historico.
- Para governanca isso faz sentido.
- Para usabilidade pratica, o risco e o usuario perder foco entre blocos paralelos e ter dificuldade para entender qual e a proxima acao realmente principal.

### 5. Ainda ha muitos residuos de motion e comportamento de destaque

- O modulo usa `motion-safe:transition-all`, `motion-safe:transition-shadow`, `motion-safe:animate-spin`, `motion-safe:animate-pulse`, `group-hover` e `animate-in`.
- Isso contrasta com a direcao que o sistema ja vem adotando nos botoes e shells mais recentes.
- No APR, esse ruido e especialmente sensivel porque a tela ja e naturalmente densa.

## Problemas priorizados

### Prioridade alta

#### Problema: o APR concentra camadas demais de informacao e controle

- Por que prejudica: o usuario recebe muitos sinais simultaneos e perde hierarquia de trabalho.
- Como deve ficar: um fluxo com eixo principal claro, onde contexto, edicao, aprovacao e auditoria aparecam por nivel de prioridade, nao todos no mesmo plano.
- Sugestao pratica: rebaixar blocos secundarios como compliance, timeline e resumo executivo quando o usuario estiver em edicao; deixar o formulario central dominar a tela.

#### Problema: a listagem esta pesada demais para uso recorrente

- Por que prejudica: filtros, densidade, exportacao, status ricos, assinaturas e acoes tornam a leitura inicial cansativa.
- Como deve ficar: listagem firme, mais objetiva e com acao principal claramente identificavel.
- Sugestao pratica: simplificar a toolbar, reduzir o numero de filtros sempre visiveis e agrupar parte das funcoes avancadas atras do drawer ou do menu contextual.

#### Problema: o modulo comunica excesso de sofisticação visual

- Por que prejudica: passa uma sensacao mais elaborada do que necessaria para um sistema empresarial operacional.
- Como deve ficar: robusto, mas seco; completo, mas sem parecer um painel promocional.
- Sugestao pratica: retirar linguagem como `premium`, reduzir badges e cards simultaneos e endurecer a prioridade visual entre secoes.

### Prioridade media

#### Problema: a tabela de APR e larga e fragmentada demais

- Por que prejudica: `min-w-[1480px]` e a quantidade de colunas estruturais empurram o modulo para uma experiencia pesada em telas menores.
- Como deve ficar: tabela com foco em identificacao, status, responsavel e acao principal; o restante deve ser apoio.
- Sugestao pratica: condensar empresa/obra, reduzir caixas por celula e empurrar parte do detalhamento para linha expandida ou drawer lateral.

#### Problema: o formulario mistura criacao, auditoria e emissao com o mesmo peso

- Por que prejudica: o usuario precisa navegar por varias camadas de contexto mesmo quando quer apenas criar ou ajustar uma APR.
- Como deve ficar: modo de edicao simples por padrao, com trilhas de auditoria e compliance rebaixadas ou progressivas.
- Sugestao pratica: separar visualmente `preenchimento`, `governanca` e `historico`, deixando os dois ultimos mais discretos ate serem relevantes.

#### Problema: modo compacto e recursos paralelos ampliam a carga visual do form

- Por que prejudica: o modulo ganha muitas alavancas de interface ao mesmo tempo.
- Como deve ficar: menos controles simultaneos no topo e mais foco no corpo do risco.
- Sugestao pratica: concentrar toggles como `Modo compacto`, exportacoes e extras em um bloco de ferramentas secundarias.

### Prioridade baixa

#### Problema: residuos de motion ainda sao numerosos

- Por que prejudica: o modulo continua transmitindo movimento e reatividade visual onde ja existe informacao demais.
- Como deve ficar: estados e foco firmes, com menos dependencia de transicao e animacao.
- Sugestao pratica: remover `motion-safe` e `animate-*` de loading, cards interativos, linhas e estados de hover do APR.

#### Problema: loading de `new` e `edit` ainda usa fallback generico

- Por que prejudica: o estado de carregamento nao conversa com a estrutura real do modulo.
- Como deve ficar: skeleton curto alinhado ao shell do APR.
- Sugestao pratica: substituir o card textual de loading por uma versao simplificada do layout do form.

## Veredito da Fase 6

O APR e funcionalmente forte, mas visualmente ainda esta acima do ponto ideal para um sistema corporativo limpo. O problema aqui nao e falta de qualidade, e excesso de camadas. Entre todos os modulos auditados ate agora, ele e o que mais precisa de hierarquia dura, simplificacao de toolbar/tabela e rebaixamento dos blocos secundarios para nao parecer um cockpit paralelo dentro do SGS.
