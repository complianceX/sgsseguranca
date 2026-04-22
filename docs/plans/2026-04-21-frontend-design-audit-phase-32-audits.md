# Fase 32 - Auditoria Visual do Modulo Audits

Data: 2026-04-21
Escopo: listagem principal, cards de resumo, callout operacional, acoes por linha, arquivos governados e wrappers de novo/edicao

## Superficies validadas

- `http://localhost:3000/dashboard/audits`
- `frontend/app/dashboard/audits/page.tsx`
- `frontend/app/dashboard/audits/new/page.tsx`
- `frontend/app/dashboard/audits/edit/[id]/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/audits` abriu apenas o shell do app.
- O console do navegador continuou sinalizando erro de runtime ligado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral das superficies reais e pela evidencia observada do shell.

## Achados principais

### 1. O modulo combina boa organizacao semantica com excesso de camadas visuais

- Header com CTA.
- Grade de KPIs.
- Card de atencao operacional.
- Card com busca e tabela.
- Painel de arquivos governados.
- Isso deixa a pagina bem estruturada no papel, mas ainda pesada para uso diario.

### 2. A listagem carrega mais acao do que leitura

- Cada linha oferece CAPA, PDF governado, imprimir, e-mail, download, editar e excluir.
- A tabela perde leveza porque a coluna final domina visualmente o registro.
- O usuario precisa disputar a leitura com uma barra de ferramentas por item.

### 3. O modulo repete o padrao de acoplar central documental na mesma superficie da listagem

- `StoredFilesPanel` aparece logo depois da tabela.
- Isso amplia a pagina e cria um segundo centro de trabalho.
- A tela deixa de ser apenas gerenciamento de auditorias.

### 4. Os KPIs do topo ajudam, mas ainda somam mais um nivel de destaque concorrente

- Total.
- Tipos presentes.
- Com plano de acao.
- Sites no recorte.
- Para essa tela, parte desse resumo poderia ser mais discreta.

### 5. `new` e `edit` estao simples, mas ainda com linguagem antiga demais

- Sao wrappers diretos com botao de voltar pequeno e bloco textual simples.
- Funcionam.
- Mas ficam abaixo do padrao mais recente de cabecalhos bem estruturados do sistema.

### 6. Ainda ha pulse, transicoes e hover desnecessarios

- Skeleton do `StoredFilesPanel` usa `motion-safe:animate-pulse`.
- Busca usa `motion-safe:transition-all`.
- Botao de voltar e excluir usam hover destacado.
- Isso vai contra o padrao visual seco que voce quer.

## Problemas priorizados

### Prioridade alta

#### Problema: a coluna de acoes da tabela esta carregada demais

- Por que prejudica: a leitura do registro perde prioridade e a interface vira um painel de comandos por linha.
- Como deve ficar: acao principal visivel e operacoes secundarias menos expostas.
- Sugestao pratica: limitar a acoes essenciais visiveis e mover parte delas para menu contextual ou agrupamento secundario.

#### Problema: a pagina mistura listagem e acervo documental em um mesmo plano

- Por que prejudica: o usuario entra para gerenciar auditorias, mas encontra uma segunda central grande de arquivos logo em seguida.
- Como deve ficar: foco claro na listagem, com documental como camada secundaria.
- Sugestao pratica: rebaixar o `StoredFilesPanel` ou desloca-lo para uma secao menos protagonista.

### Prioridade media

#### Problema: ha resumo demais antes da tabela

- Por que prejudica: KPIs e callout ocupam a entrada antes do conteudo principal.
- Como deve ficar: abertura mais curta e objetiva.
- Sugestao pratica: reduzir a agressividade visual dos KPIs e manter o callout apenas quando houver urgencia real.

#### Problema: `new` e `edit` parecem wrappers mais antigos do frontend

- Por que prejudica: ficam visualmente desalinhados com superficies mais recentes e profissionais do sistema.
- Como deve ficar: cabecalho mais consistente com o padrao atual de formularios.
- Sugestao pratica: migrar esses wrappers para o mesmo estilo usado em modulos mais novos, com estrutura mais clara e CTA de retorno mais discreto.

### Prioridade baixa

#### Problema: ainda ha transicoes, pulse e hover desnecessarios

- Por que prejudica: adicionam ruido visual em um modulo ja naturalmente operacional.
- Como deve ficar: feedback visual mais estatico e direto.
- Sugestao pratica: remover `motion-safe:*` e reduzir hovers chamativos nas acoes da pagina.

## Veredito da Fase 32

Audits tem estrutura boa e mais madura do que varios modulos do sistema, mas ainda exagera no numero de camadas por superficie. O ganho principal aqui esta em simplificar a coluna de acoes, reduzir o peso dos resumos e separar melhor a listagem da central documental.
