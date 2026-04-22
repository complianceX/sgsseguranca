# Fase 8 - Auditoria Visual do Modulo DDS

Data: 2026-04-21
Escopo: listagem, criacao, edicao e superficies principais do modulo Dialogo Diario de Seguranca

## Superficies validadas

- `http://localhost:3000/dashboard/dds`
- `http://localhost:3000/dashboard/dds/new`
- `frontend/app/dashboard/dds/page.tsx`
- `frontend/components/DdsForm.tsx`
- `frontend/components/dds/DdsApprovalPanel.tsx`
- `frontend/app/dashboard/dds/new/page.tsx`
- `frontend/app/dashboard/dds/edit/[id]/page.tsx`

## Validacao visual real

- A listagem `/dashboard/dds` respondeu `200`.
- A criacao correta respondeu `200` em `/dashboard/dds/new`.
- Assim como nos demais modulos autenticados, as capturas cairam em loading centralizado do shell.
- O diagnostico desta fase foi fechado por codigo e pela validacao parcial do acesso real.

## Achados principais

### 1. O DDS mistura operacao diaria com monitoramento interno na mesma superficie

- `dds/page.tsx` nao e apenas uma listagem de documentos.
- A pagina agrega observabilidade, alertas operacionais, storage, telemetria publica, ranking, arquivos e registros.
- Isso transforma o modulo em uma tela de controle ampla demais para o uso primario de DDS.

### 2. A listagem do DDS tem excesso de secoes antes da area principal de registros

- Antes de chegar em `Registros de DDS`, o usuario encontra cards de resumo, fluxo interno, telemetria, alertas e storage.
- O conteudo ate faz sentido administrativamente.
- Mas visualmente isso empurra a tarefa principal para baixo e fragmenta a leitura.

### 3. O formulario de DDS esta mais direto que APR e PT, mas ainda com muitas camadas auxiliares

- `DdsForm.tsx` esta mais enxuto em comparacao com APR e PT.
- Mesmo assim, ele adiciona aprovacoes, assinatura, reutilizacao de foto, videos e sugestao por IA no mesmo fluxo.
- O formulario continua funcional, mas pode ficar mais seco e mais focado no alinhamento diario.

### 4. O DDS sofre de mistura entre operacao de campo e infraestrutura documental

- O mesmo modulo expõe detalhes de PDF final governado, attachments, links, bundle semanal e storage.
- Isso e util para administracao.
- Porem, visualmente enfraquece a identidade do DDS como registro rapido de rotina.

### 5. Ainda ha residuos de motion e tratamento visual macio

- Inputs continuam com `transition-all`.
- O CTA de sugestao por IA ainda usa brilho e destaque de botao mais enfatico.
- O shell de loading de `new` e `edit` segue generico.
- Em um modulo que ja tem muitas areas, esse acabamento amplia a sensacao de excesso.

## Problemas priorizados

### Prioridade alta

#### Problema: a pagina de listagem do DDS acumula operacao e observabilidade no mesmo plano

- Por que prejudica: o usuario que quer registrar ou localizar um DDS precisa atravessar varios blocos analiticos antes de chegar na tabela principal.
- Como deve ficar: a listagem operacional deve liderar; observabilidade e storage devem ser apoio administrativo.
- Sugestao pratica: mover telemetria, ranking, alertas e arquivos para uma area separada, aba administrativa ou bloco recolhido.

#### Problema: o DDS perde foco como modulo de rotina de campo

- Por que prejudica: a tela passa a parecer um hub de controle, e nao um registro diario simples.
- Como deve ficar: o nucleo do modulo deve ser tema, facilitador, participantes, evidencias e status.
- Sugestao pratica: reordenar a pagina para priorizar criacao/listagem de DDS e rebaixar o restante como ferramentas secundarias.

### Prioridade media

#### Problema: formulario ainda combina contexto diario com recursos avancados no mesmo fluxo

- Por que prejudica: assinatura, videos, aprovacoes e IA dividem atencao com o preenchimento base.
- Como deve ficar: primeiro o basico do DDS, depois evidencias e governanca.
- Sugestao pratica: manter `tema`, `facilitador`, `participantes` e `conteudo` como eixo central e deixar recursos como video e aprovacao em faixa secundaria ou etapa posterior.

#### Problema: excesso de blocos explicativos e estado documental

- Por que prejudica: a tela fica verbal demais e menos imediata.
- Como deve ficar: menos texto explicativo simultaneo e mais pistas visuais objetivas.
- Sugestao pratica: encurtar descricoes persistentes e deixar instrucoes mais longas apenas quando o usuario entra em acao sensivel.

### Prioridade baixa

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: nao comunica a estrutura real do DDS.
- Como deve ficar: skeleton simples coerente com header e formulario.
- Sugestao pratica: substituir o card textual por placeholder curto alinhado ao `PageHeader`.

#### Problema: residuos de motion e brilho em elementos secundários

- Por que prejudica: introduzem ruido em um modulo ja cheio de secoes.
- Como deve ficar: foco visual mais estável e menos “reativo”.
- Sugestao pratica: remover `transition-all` dos campos e endurecer o visual de CTAs secundarios como sugestao de IA.

## Veredito da Fase 8

O DDS tem boa cobertura funcional e um formulario melhor equilibrado do que PT e APR, mas a listagem principal ainda esta inflada por camadas administrativas demais. O ajuste mais urgente nao e no campo de preenchimento em si, e sim na arquitetura visual da pagina do modulo: separar rotina operacional de observabilidade e storage para que o DDS volte a parecer um fluxo diario simples, rastreavel e profissional.
