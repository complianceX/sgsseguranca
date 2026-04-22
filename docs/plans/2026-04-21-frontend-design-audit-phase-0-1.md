# Fase 0 e Fase 1 - Auditoria Visual do Frontend SGS

Data: 2026-04-21
Escopo: base global do frontend antes da analise modulo por modulo

## Fase 0

### Checklist oficial da auditoria

- Organizacao visual da tela
- Alinhamento entre blocos e componentes
- Espacamentos e respiro
- Hierarquia de informacao
- Contraste e legibilidade
- Consistencia de cor, fonte, tamanho e borda
- Clareza de botoes e acoes principais
- Padronizacao de formularios, labels e secoes
- Estrutura de tabelas, filtros e listagens
- Uso de status, alertas e callouts
- Densidade visual do dashboard
- Aparencia corporativa e simplicidade pratica

### Padrao oficial para as proximas fases

- Visual objetivo, sem depender de animacao para reforcar hierarquia
- Azul institucional como primaria no light e verde estrutural no dark
- Sidebar e topbar com papel de navegacao, nao de destaque visual
- Cards neutros por padrao; destaque apenas para risco, erro, sucesso e CTA
- Formularios com labels fortes, campos estaveis e grupos bem separados
- Tabelas com header firme, linhas legiveis e filtros em faixa previsivel
- Modais, callouts e pills com destaque controlado

## Fase 1

### Source of truth validado

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/styles/theme-dark.css`
- `frontend/app/globals.css`

### Achados principais

#### 1. Base de tokens esta coerente

- A paleta e a malha global estao centralizadas em `tokens.css`.
- Motion default foi reduzido a `0ms`, o que ajuda a manter a leitura seca.
- O sistema ja tem aliases suficientes para guiar a auditoria modulo por modulo.

#### 2. O chrome global ainda eh o elemento mais sensivel

- `theme-light.css` e `theme-dark.css` concentram a identidade real do header, sidebar, list shell e segmented control.
- A direcao atual esta muito melhor do que antes, mas continua sendo o ponto que mais pode despadronizar modulos se alguem fugir do token.

#### 3. `globals.css` ainda e o principal contrato visual real

- O arquivo controla tabela, campo, botao, topbar, KPI, modal, page header, list shell e segmented control.
- Isso significa que qualquer modulo que ignore esse contrato tende a ficar visualmente fora do sistema.

#### 4. Header global esta funcional, mas ainda denso

- `Header.tsx` segue concentrando busca, Sophie, offline, notificacoes, tema e usuario na mesma faixa.
- O visual foi simplificado, mas a densidade funcional continua alta.

#### 5. Sidebar global esta muito mais limpa, mas ainda exige disciplina nos modulos

- `Sidebar.tsx` agora esta mais seca e correta para enterprise.
- O risco real passa a ser o conteudo: rotulos longos demais e multiplicacao de secoes ainda podem gerar peso visual.

#### 6. Paginas publicas ainda precisam de consolidacao completa

- `login.module.css` ficou mais objetivo e compacto.
- `legal-pages.module.css` recebeu um override forte para endurecer contraste e reduzir ornamento, mas ainda carrega legado no arquivo.
- Essas paginas agora estao visualmente melhores, mas sao o ponto mais propenso a regressao futura por excesso de CSS acumulado.

### Desvios estruturais que vao guiar as proximas fases

- Modulos que usam classe local com `motion-safe`, `animate-*`, `hover:shadow`, `hover:-translate` ou `backdrop-blur`
- Formularios que ainda usam inputs locais em vez do contrato global
- Dashboards e paineis que criam seus proprios cards, chips e headers
- Paginas que usam gradiente ou glow fora de `theme-light.css` e `theme-dark.css`
- Tabelas que nao seguem o padrao base de `globals.css`

### Prioridade da proxima fase

1. `Auth e paginas publicas`
2. `Dashboard e shell operacional`
3. `Modulo DID`

### Veredito da Fase 1

A base global do SGS esta suficientemente madura para iniciar a analise modulo por modulo. O principal risco nao esta mais na paleta, e sim em componentes e telas que escapam do contrato central de `tokens/themes/globals`.
