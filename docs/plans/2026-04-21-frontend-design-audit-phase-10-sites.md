# Fase 10 - Auditoria Visual do Modulo Obras/Setores

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Obras/Setores

## Superficies validadas

- `http://localhost:3000/dashboard/sites`
- `http://localhost:3000/dashboard/sites/new`
- `frontend/app/dashboard/sites/page.tsx`
- `frontend/app/dashboard/sites/new/page.tsx`
- `frontend/app/dashboard/sites/edit/[id]/page.tsx`
- `frontend/components/SiteForm.tsx`

## Validacao visual real

- As rotas `/dashboard/sites` e `/dashboard/sites/new` responderam `200`.
- Assim como nas demais areas autenticadas, as capturas locais ainda cairam no loading centralizado do shell.
- O fechamento visual desta fase foi feito por leitura do codigo real, estrutura do modulo e confirmacao do acesso das rotas principais.

## Achados principais

### 1. Obras/Setores tambem esta entre os modulos mais organizados da base

- A listagem e clara.
- As colunas sao adequadas para o tipo de cadastro.
- O formulario segue uma estrutura objetiva e mais madura do que a vista nos modulos mais pesados.

### 2. O modulo repete o mesmo excesso de moldura observado em Empresas

- `SiteForm.tsx` usa `PageHeader`, bloco de `Cadastro guiado`, secoes em card e rodape de acao bem marcado.
- Isso funciona.
- Mas ainda deixa o cadastro mais encorpado do que o necessario para uma entidade administrativa relativamente simples.

### 3. A listagem faz bom trabalho operacional, mas o QR Code aumenta a concorrencia visual

- `sites/page.tsx` mistura listagem, metricas, busca e o fluxo de QR Code no mesmo contexto.
- O recurso de QR e util.
- Porem, ele nao deve disputar atencao com a tarefa principal de localizar, cadastrar e editar obras/setores.

### 4. Restos de motion e interacao macia continuam presentes

- A busca da listagem ainda usa `motion-safe:transition-all`.
- O formulario usa `transition-all` nos campos.
- O estado de envio ainda usa spinner animado.
- Isso contradiz diretamente o criterio que voce definiu para botoes e interface mais simples, sem efeitos desnecessarios.

### 5. O modulo transmite padrao corporativo, mas ainda pode ficar mais seco

- O problema nao e despadronizacao.
- O problema e o nivel de acabamento ainda um pouco "macio" para um sistema empresarial objetivo.
- Falta endurecer a apresentacao e reduzir a quantidade de apoio visual por tela.

## Problemas priorizados

### Prioridade media

#### Problema: o formulario de obra/setor ainda usa apoio visual demais para um cadastro relativamente direto

- Por que prejudica: aumenta o tempo de leitura e faz a tela parecer mais complexa do que a tarefa exige.
- Como deve ficar: formulario com cabecalho mais curto, menos texto persistente e foco imediato nos campos principais.
- Sugestao pratica: enxugar o bloco `Cadastro guiado`, reduzir textos descritivos longos e deixar as secoes mais compactas.

#### Problema: o fluxo de QR Code compete com a leitura principal da listagem

- Por que prejudica: adiciona uma segunda narrativa operacional em uma tela que deveria priorizar consulta e manutencao cadastral.
- Como deve ficar: QR tratado como recurso utilitario secundario, sem subir o peso visual da tela inteira.
- Sugestao pratica: manter a acao contextual, mas tornar o modal e os textos associados mais secos e menos protagonistas do que a grade principal.

### Prioridade baixa

#### Problema: residuos de motion permanecem em busca, campos e salvamento

- Por que prejudica: reforcam uma interface mais decorada do que o padrao empresarial simples pretendido.
- Como deve ficar: estados visuais estaveis, sem transicao perceptivel e sem spinner chamativo.
- Sugestao pratica: remover `transition-all`, `motion-safe:*` e spinner animado deste modulo, substituindo por feedback estatico.

#### Problema: loading de `new` e `edit` continua generico

- Por que prejudica: nao antecipa a estrutura real do modulo nem passa sensacao de acabamento consistente.
- Como deve ficar: skeleton simples, alinhado ao cabecalho e aos blocos principais do formulario.
- Sugestao pratica: criar fallback especifico para `sites/new` e `sites/edit` com placeholders coerentes com a pagina.

## Veredito da Fase 10

Obras/Setores esta visualmente bem melhor do que os modulos mais densos do sistema. A base e boa, organizada e profissional. O que falta agora e refinamento de sobriedade: menos moldura, menos apoio visual persistente, QR tratado como utilitario secundario e remocao definitiva dos residuos de motion para o modulo ficar realmente simples, corporativo e funcional.
