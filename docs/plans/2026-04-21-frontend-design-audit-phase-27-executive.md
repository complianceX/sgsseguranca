# Fase 27 - Auditoria Visual do Modulo Executive

Data: 2026-04-21
Escopo: cockpit executivo, cards leading e lagging, tendencias, heatmap por obra e painel de alertas

## Superficies validadas

- `http://localhost:3000/dashboard/executive`
- `frontend/app/dashboard/executive/page.tsx`
- `frontend/app/dashboard/executive/components/ExecutiveCharts.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/executive` abriu apenas o shell do app.
- O console do navegador continuou registrando erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo tem boa estrutura analitica, mas esta visualmente mais carregado do que um painel executivo deveria

- Header com badge, descricao e pills.
- Cards leading.
- Cards lagging.
- Dois graficos.
- Heatmap com varios cards.
- Painel de alertas.
- Isso cria um dashboard forte, mas com muitos pontos de destaque simultaneos.

### 2. Existe excesso de protagonismo colorido logo no topo da tela

- Badge `Visao executiva`.
- Pills de obras, alertas e tendencia.
- Tres cards leading coloridos.
- Depois mais tres cards lagging tambem coloridos.
- O resultado e uma abertura visual muito saturada.

### 3. O modulo reforca estilo de cockpit mais do que leitura executiva limpa

- O proprio titulo "Cockpit Executivo SST" ja empurra a leitura para um painel carregado.
- As superficies `ds-kpi-card` acentuam esse tom com muita cor e contraste.
- Para uso gerencial diario, isso pode ficar mais dramatico do que preciso.

### 4. O heatmap por obra tem boa funcao, mas vira outro painel de cards dentro do dashboard

- Cada obra entra como mais um bloco visual.
- Isso soma uma nova malha de mini-cards apos os KPIs e graficos.
- A pagina ganha mais fragmentacao em vez de consolidacao.

### 5. O painel de alertas esta correto, mas adiciona mais uma faixa de destaque forte no fim

- O uso de fundo warning com icone e borda reforca urgencia.
- Em conjunto com tantos blocos anteriores, o fim da pagina continua visualmente intenso.
- A tela quase nao oferece descanso visual.

### 6. Ainda ha loading com animacao

- O estado inicial usa `motion-safe:animate-spin`.
- Para o padrao pedido, essa camada de movimento continua acima do necessario.

## Problemas priorizados

### Prioridade alta

#### Problema: o topo do dashboard executivo concentra camadas demais de destaque

- Por que prejudica: o usuario recebe varios blocos fortes antes de identificar o que realmente merece atencao.
- Como deve ficar: abertura mais contida, com menos elementos competindo entre si.
- Sugestao pratica: reduzir a quantidade de pills e diminuir a agressividade cromatica dos KPIs do topo, deixando apenas um nivel principal de destaque.

#### Problema: ha excesso de cards coloridos em sequencia

- Por que prejudica: a interface parece sempre gritando por atencao e perde leitura executiva serena.
- Como deve ficar: menos cores simultaneas e mais diferenca entre informacao primaria, secundaria e de excecao.
- Sugestao pratica: usar cor forte apenas para desvio e risco real; manter KPIs neutros quando forem apenas contexto.

### Prioridade media

#### Problema: o heatmap por obra fragmenta demais a leitura

- Por que prejudica: adiciona dezenas de pequenos blocos apos um dashboard ja denso.
- Como deve ficar: visual mais consolidado e menos baseado em mosaico.
- Sugestao pratica: reavaliar o heatmap em formato de tabela compacta ou lista resumida por criticidade em vez de varios mini-cards.

#### Problema: o painel de alertas entra como mais um bloco visual agressivo

- Por que prejudica: a pagina termina no mesmo tom de alta tensao do inicio.
- Como deve ficar: alertas importantes, mas com hierarquia subordinada ao restante do dashboard.
- Sugestao pratica: reduzir o peso de borda e fundo dos alertas nao criticos e manter real destaque apenas para itens realmente urgentes.

#### Problema: a linguagem de cockpit pesa mais do que a de relatorio executivo

- Por que prejudica: transmite sensacao de painel tatico e nao de visao gerencial limpa.
- Como deve ficar: leitura mais corporativa, objetiva e menos cenografica.
- Sugestao pratica: simplificar nomenclaturas, reduzir badges decorativas e cortar elementos de reforco visual que nao adicionam decisao.

### Prioridade baixa

#### Problema: o loading usa animacao desnecessaria

- Por que prejudica: adiciona movimento visual num modulo que ja e naturalmente chamativo.
- Como deve ficar: placeholder estatico e discreto.
- Sugestao pratica: substituir o spinner por estado de carregamento simples sem `motion-safe:animate-spin`.

## Veredito da Fase 27

Executive e funcionalmente forte e melhor organizado do que varios modulos operacionais, mas ainda pesa demais na linguagem visual. O ajuste certo aqui e tirar o excesso de cockpit, reduzir cor simultanea e deixar o painel mais executivo de verdade: menos dramatizacao, mais leitura clara e mais prioridade real.
