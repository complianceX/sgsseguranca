# Fase 18 - Auditoria Visual do Modulo Tools

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Tools

## Superficies validadas

- `http://localhost:3000/dashboard/tools`
- `frontend/app/dashboard/tools/page.tsx`
- `frontend/app/dashboard/tools/new/page.tsx`
- `frontend/app/dashboard/tools/edit/[id]/page.tsx`
- `frontend/components/ToolForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/tools` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura da listagem e do `ToolForm`, e pela evidencia observada do shell.

## Achados principais

### 1. Tools segue o mesmo padrao de cadastro operacional usado em Activities

- A listagem usa `ListPageLayout`, metricas, busca e tabela curta.
- O formulario usa `PageHeader`, `StatusPill`, bloco guiado, cards de secao e rodape de acoes.
- O modulo esta estruturado e padronizado.

### 2. O principal problema continua sendo excesso de moldura para uma tarefa simples

- O cadastro de ferramenta trabalha basicamente com empresa, nome, numero de serie e descricao.
- Mesmo assim, o form recebe bastante casca visual e textos persistentes.
- O resultado e profissional, mas mais encorpado do que necessario.

### 3. A listagem esta funcional, mas ainda com topo mais alto do que o essencial

- Metricas, toolbar e CTA aparecem antes da grade.
- Nao chega a pesar tanto quanto modulos mais complexos.
- Mas ainda empurra a tabela para baixo em um contexto que poderia ser quase imediato.

### 4. O modulo continua com linguagem visual mais "reativa" do que o desejado

- Busca com `motion-safe:transition-all`.
- Hover de excluir em destaque.
- Form com `transition-all`, hover de botoes e spinner animado no submit.
- Isso contrasta com a direcao que voce definiu de botões e superficies mais secas.

### 5. O formulario tambem esta verbal demais para o dominio

- Varios campos recebem descricoes mesmo quando a leitura ja e autoexplicativa.
- Isso ajuda onboarding inicial.
- Mas adiciona massa visual sem grande ganho para uso recorrente.

## Problemas priorizados

### Prioridade media

#### Problema: o formulario de ferramenta usa enquadramento demais para um cadastro curto

- Por que prejudica: amplia a sensacao de peso e reduz a objetividade da tela.
- Como deve ficar: formulario mais direto, com menos moldura e menos apoio visual persistente.
- Sugestao pratica: enxugar `Cadastro guiado`, reduzir o numero de helpers e compactar as secoes de identificação e rastreabilidade.

#### Problema: a listagem ainda sobe contexto demais antes da grade principal

- Por que prejudica: a tela parece mais painel do que uma base catalográfica enxuta.
- Como deve ficar: busca, CTA e tabela com metricas mais discretas.
- Sugestao pratica: reduzir a massa do topo para a grade de ferramentas assumir mais rapidamente o protagonismo.

### Prioridade baixa

#### Problema: residuos de motion, hover e spinner permanecem no modulo

- Por que prejudica: mantem uma interface mais animada do que o padrao simples e corporativo desejado.
- Como deve ficar: estados visuais mais secos e menos competitivos.
- Sugestao pratica: remover `motion-safe:*`, endurecer hover das acoes e substituir spinner animado do submit por estado estatico.

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: nao comunica a estrutura final do formulario.
- Como deve ficar: placeholder alinhado ao layout real do `ToolForm`.
- Sugestao pratica: trocar o card textual de loading por skeleton simples coerente com a tela.

## Veredito da Fase 18

Tools esta visualmente organizado e consistente com outros cadastros operacionais, mas ainda sofre do mesmo refinamento pendente: excesso de moldura, muito texto de apoio e residuos de motion. O caminho aqui e secar o formulario e condensar o topo da listagem para a experiencia ficar mais rapida e mais profissional.
