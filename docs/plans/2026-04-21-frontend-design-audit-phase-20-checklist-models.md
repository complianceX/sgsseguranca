# Fase 20 - Auditoria Visual do Modulo Checklist Models

Data: 2026-04-21
Escopo: biblioteca principal de modelos, criacao, edicao e superficies centrais do modulo Checklist Models

## Superficies validadas

- `http://localhost:3000/dashboard/checklist-models`
- `frontend/app/dashboard/checklist-models/page.tsx`
- `frontend/app/dashboard/checklist-models/components/ChecklistModelsView.tsx`
- `frontend/app/dashboard/checklist-models/new/page.tsx`
- `frontend/app/dashboard/checklist-models/edit/[id]/page.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/checklist-models` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura da biblioteca de modelos e pelo uso do `ChecklistForm` em modo template.

## Achados principais

### 1. Checklist Models ja nasce como superficie mais encorpada do que um cadastro comum

- A tela combina `ListPageLayout`, métricas, callout, grade de áreas, busca ampla, chips de toolbar, tabela e modal de e-mail.
- A biblioteca de modelos precisa mesmo de mais contexto do que um CRUD simples.
- Ainda assim, a massa visual sobe rapidamente.

### 2. A grade de areas e util, mas adiciona mais uma camada forte de navegacao

- O modulo mostra as areas por cards clicaveis logo antes da tabela.
- Isso ajuda orientacao.
- Mas tambem cria uma segunda interface de navegacao dentro da mesma pagina, competindo com a biblioteca principal.

### 3. O modulo ainda mistura biblioteca, disparo operacional e manutencao no mesmo plano

- Acoes como preencher, editar, enviar por e-mail e excluir convivem no mesmo nivel da tabela.
- A biblioteca nao e apenas consulta.
- Visualmente, isso deixa cada linha mais carregada e reduz sensacao de catalogo limpo.

### 4. O formulario de modelo reaproveita a mesma casca pesada do `ChecklistForm`

- `new` e `edit` usam `ChecklistForm` em modo template.
- Isso garante reaproveitamento funcional.
- Mas herda tambem todo o peso visual do modulo mais denso do bloco.

### 5. Ha residuos claros de motion, hover e destaque interativo

- Cards de areas usam `motion-safe:transition-all`.
- Acoes de linha usam hover forte.
- A interface continua mais reativa do que o padrao seco desejado.

## Problemas priorizados

### Prioridade alta

#### Problema: a biblioteca de modelos concentra navegação, gestão e disparo no mesmo plano visual

- Por que prejudica: o usuário precisa decodificar muitos blocos e muitas ações antes de focar na tabela principal.
- Como deve ficar: biblioteca com foco claro em localizar e administrar modelos, com o restante como apoio secundário.
- Sugestao pratica: rebaixar visualmente a grade de áreas e reduzir o peso das ações por linha para a tabela assumir mais protagonismo.

### Prioridade media

#### Problema: o formulario de modelo herda peso demais do `ChecklistForm`

- Por que prejudica: a edição de um modelo já começa visualmente pesada antes mesmo de o usuário entrar na lógica do checklist.
- Como deve ficar: modo template com narrativa visual mais enxuta do que o checklist operacional em campo.
- Sugestao pratica: diferenciar melhor o modo template dentro do `ChecklistForm`, com menos badges, menos alertas e menos apoio persistente.

#### Problema: a grade de áreas compete com a biblioteca principal

- Por que prejudica: cria uma segunda camada de leitura entre header e tabela.
- Como deve ficar: navegação de áreas mais discreta, servindo de filtro estrutural e não de protagonismo visual.
- Sugestao pratica: reduzir a força visual dos cards de área e aproximá-los de uma navegação segmentada mais seca.

### Prioridade baixa

#### Problema: residuos de motion e hover permanecem no modulo

- Por que prejudica: ampliam o ruído visual em uma tela que já possui muitos blocos e ações.
- Como deve ficar: estados mais estáveis, com menos transição perceptível.
- Sugestao pratica: remover `motion-safe:*` dos cards de área e endurecer o hover das ações de tabela.

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: não comunica a estrutura real do formulário de modelo.
- Como deve ficar: placeholder coerente com o `ChecklistForm` em modo template.
- Sugestao pratica: substituir o card textual por skeleton alinhado à abertura real da tela.

## Veredito da Fase 20

Checklist Models tem uma base funcional forte, mas visualmente já entra no grupo das superfícies encorpadas demais. O ajuste prioritário aqui é endurecer a hierarquia da biblioteca e tornar o modo template menos pesado visualmente do que o checklist operacional completo.
