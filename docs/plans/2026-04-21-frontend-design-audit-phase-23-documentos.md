# Fase 23 - Auditoria Visual do Modulo Documentos

Data: 2026-04-21
Escopo: fluxo de importacao documental, upload, progresso, retorno de analise e validacao

## Superficies validadas

- `http://localhost:3000/dashboard/documentos/importar`
- `frontend/app/dashboard/documentos/novo/page.tsx`
- `frontend/app/dashboard/documentos/importar/page.tsx`

## Validacao visual real

- A rota `/dashboard/documentos/novo` nao possui tela propria; ela redireciona para `/dashboard/documentos/importar`.
- A navegacao automatizada para `/dashboard/documentos/importar` abriu apenas o shell do app.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito pela leitura integral da pagina real e pela evidencia observada do shell.

## Achados principais

### 1. O fluxo de importacao tem estrutura funcional boa, mas visualmente ainda parece demonstracao e nao operacao

- O modulo mistura header forte, faixa explicativa, dropzone chamativa, card explicativo, barra de progresso, feedback de fila e um bloco grande de resultado tecnico.
- A tela entrega bastante informacao util.
- Mas o conjunto ainda pesa mais para "produto em showcase" do que para uma rotina seca e empresarial.

### 2. A tela usa mais movimento visual do que o padrao que voce definiu

- O dropzone usa `motion-safe:transition-all`.
- Os botoes usam `motion-safe:transition-colors`.
- O progresso usa `motion-safe:transition-all`.
- O spinner usa `motion-safe:animate-spin`.
- O bloco de resultado concluido usa `motion-safe:animate-in`, `slide-in-from-bottom-4` e `fade-in`.
- Para o padrao desejado, isso esta acima do necessario.

### 3. A hierarquia entre "enviar documento" e "interpretar resultado" ainda compete demais

- O lado esquerdo trata o operador.
- O lado direito ja assume uma leitura tecnica mais densa.
- Antes do envio, a coluna direita vira um vazio grande; depois da conclusao, ela fica muito carregada.
- Isso faz a tela oscilar entre pouca utilidade visual e excesso de informacao.

### 4. Ha texto explicativo demais para um fluxo recorrente

- A faixa "Fluxo guiado" e o card "Como funciona?" ajudam no primeiro uso.
- Em rotina diaria, viram ruido persistente.
- O operador precisa mais de clareza operacional do que de explicacao continua.

### 5. O resultado concluido tem boa separacao semantica, mas usa cor e tags em excesso

- Riscos, EPIs, NRs, validacao, score e pendencias aparecem com muitos blocos coloridos ao mesmo tempo.
- Isso melhora escaneabilidade pontual.
- Mas tambem eleva a sensacao de painel visual carregado.

## Problemas priorizados

### Prioridade alta

#### Problema: ha excesso de animacao e transicao em um fluxo que deveria ser estavel

- Por que prejudica: transmite uma camada visual desnecessaria e reduz a sensacao de sistema corporativo simples.
- Como deve ficar: estados visuais secos, estaveis e imediatos, sem animacoes perceptiveis.
- Sugestao pratica: remover `motion-safe:*`, `animate-spin`, `animate-in`, `slide-in-from-bottom-4` e `fade-in` desta tela, mantendo apenas mudanca estatica de estado.

#### Problema: a tela compete entre onboarding, upload e leitura tecnica no mesmo plano

- Por que prejudica: o usuario nao percebe com clareza qual e o foco principal do momento.
- Como deve ficar: um fluxo com eixo principal claro, primeiro upload e acompanhamento; depois resultado tecnico.
- Sugestao pratica: reduzir o peso visual dos textos introdutorios e manter a coluna direita mais neutra ate existir resultado real.

### Prioridade media

#### Problema: ha explicacao persistente demais para um processo operacional repetitivo

- Por que prejudica: aumenta poluicao visual e empurra conteudo funcional para baixo.
- Como deve ficar: orientacao curta, objetiva e discreta.
- Sugestao pratica: comprimir `Fluxo guiado` e `Como funciona?` em um bloco unico mais compacto, com menos linhas e menor protagonismo.

#### Problema: o resultado concluido usa muitos chips e cores simultaneamente

- Por que prejudica: a leitura vira um mosaico visual e perde sobriedade.
- Como deve ficar: destaque forte apenas para status principal e pendencias criticas.
- Sugestao pratica: reduzir o uso de tags coloridas para listas secundarias e usar texto simples ou badges neutros onde nao houver criticidade.

#### Problema: o layout inicial desperdica area util na coluna direita

- Por que prejudica: antes do upload, a tela fica desequilibrada e com sensacao de espaco ocioso.
- Como deve ficar: area vazia mais contida e menos cenografica.
- Sugestao pratica: trocar o placeholder grande por um painel mais enxuto, alinhado ao mesmo peso visual do bloco de upload.

### Prioridade baixa

#### Problema: o alias `documentos/novo` nao comunica que nao ha tela nova independente

- Por que prejudica: pode gerar expectativa de formulario separado.
- Como deve ficar: fluxo unico, sem ambiguidade de navegacao.
- Sugestao pratica: documentar internamente que `novo` apenas redireciona para a importacao assistida e evitar trata-lo como superficie distinta.

## Veredito da Fase 23

Documentos tem base funcional boa e uma estrutura relativamente organizada, mas ainda carrega linguagem visual de demonstracao: muita transicao, muito texto explicativo e muita cor simultanea no resultado. O ajuste certo aqui nao e reinventar a tela; e secar o fluxo, endurecer a hierarquia e deixar a importacao mais operacional e mais sobria.
