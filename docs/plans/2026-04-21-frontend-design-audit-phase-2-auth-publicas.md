# Fase 2 - Auditoria Visual de Auth e Paginas Publicas

Data: 2026-04-21
Escopo: login, forgot-password, reset-password, termos e privacidade

## Telas validadas

- `http://localhost:3000/login`
- `http://localhost:3000/forgot-password`
- `http://localhost:3000/reset-password`
- `http://localhost:3000/termos`
- `http://localhost:3000/privacidade`

## Source of truth validado

- `frontend/app/(auth)/login/LoginPageClient.tsx`
- `frontend/app/(auth)/login/login.module.css`
- `frontend/app/(auth)/auth.module.css`
- `frontend/app/(auth)/forgot-password/page.tsx`
- `frontend/app/(auth)/reset-password/page.tsx`
- `frontend/app/legal-pages.module.css`

## Achados principais

### 1. Login esta visualmente maduro

- O login tem boa hierarquia, contraste correto e CTA principal claro.
- O shell esta compacto e com leitura objetiva.
- A tela passa imagem mais corporativa do que promocional.

### 2. Forgot-password e reset-password seguem a mesma familia visual

- As duas telas reaproveitam `auth.module.css`, o que ajuda consistencia.
- A estrutura do formulario esta simples, com labels claros e mensagens diretas.
- O fluxo visual e previsivel para usuario final.

### 3. `auth.module.css` ainda carrega residuos de motion e acabamento suave demais

- Ainda existem transicoes em labels, inputs e back link.
- O loading do botao continua baseado em spinner.
- `reset-password/page.tsx` ainda usa `animate-spin` no fallback de `Suspense`.
- Isso nao quebra a interface, mas foge da direcao oficial de visual seco e operacional.

### 4. As paginas legais melhoraram muito no resultado final, mas o arquivo ainda esta estruturalmente carregado

- `legal-pages.module.css` ainda mistura uma camada antiga, mais decorativa, com um bloco posterior de override corretivo.
- O visual em tela esta melhor porque o override final vence.
- O risco real e de manutencao: uma edicao futura pode reativar comportamentos antigos sem perceber.

### 5. `termos` ainda ocupa altura demais no hero

- A pagina esta legivel e mais profissional do que antes.
- Mesmo assim, o hero ainda esta alto e com peso editorial acima do ideal para texto juridico.
- A leitura inicial fica um pouco mais dispersa do que deveria.

### 6. `privacidade` esta mais equilibrada que `termos`

- O contraste, o ritmo vertical e a distribuicao geral estao mais controlados.
- Ainda existe excesso de estrutura no CSS, mas o resultado visual esta mais coerente.

## Problemas priorizados

### Prioridade alta

#### Problema: `legal-pages.module.css` concentra legado decorativo e override corretivo no mesmo arquivo

- Por que prejudica: o comportamento visual fica dependente da ordem do CSS, o que aumenta risco de regressao e dificulta padronizacao futura.
- Como deve ficar: um unico contrato visual, limpo e sem dupla camada de intencao estetica.
- Sugestao pratica: remover o bloco legado que ainda define hero, cards, CTAs, transicoes e keyframes antigos, preservando apenas a versao final alinhada ao design system.

#### Problema: `termos` ainda tem hero alto demais para pagina juridica

- Por que prejudica: desperdiça area util e empurra o conteudo principal para baixo.
- Como deve ficar: cabecalho mais curto, mais informativo e menos promocional.
- Sugestao pratica: reduzir altura do topo, limitar largura do titulo e simplificar o bloco introdutorio para leitura institucional.

### Prioridade media

#### Problema: `auth.module.css` ainda usa transicoes e spinner

- Por que prejudica: cria inconsistencia com a direcao visual mais seca que o sistema passou a adotar.
- Como deve ficar: estados estaticos, feedback direto e sem dependencia de movimento.
- Sugestao pratica: remover transicoes de label/input/back link, trocar spinner por texto de estado ou indicador estatico e substituir o fallback com `animate-spin` por placeholder simples.

#### Problema: bloco de marca ainda disputa um pouco com o formulario nas telas auxiliares de auth

- Por que prejudica: em fluxos utilitarios, a marca deveria apoiar e nao competir com a tarefa.
- Como deve ficar: marca mais discreta e formulario como centro claro da tela.
- Sugestao pratica: reduzir o peso visual do cabecalho de marca em forgot/reset, mantendo logo e legenda com menos respiro.

### Prioridade baixa

#### Problema: login ainda concentra bastante contexto quando entra em MFA bootstrap/challenge

- Por que prejudica: o volume de instrucoes e campos cresce rapido em uma unica coluna.
- Como deve ficar: fluxo visual mais modular dentro do mesmo card.
- Sugestao pratica: separar melhor blocos de contexto, codigo e recuperacao sem mudar o fluxo funcional.

## Veredito da Fase 2

A familia publica do SGS esta visualmente coerente e profissional o suficiente para uso real. O principal problema desta fase nao e mais resultado de tela, e sim governanca visual do codigo: `auth.module.css` ainda tem pequenos residuos de motion, e `legal-pages.module.css` continua carregando duas linguagens visuais dentro do mesmo arquivo. O proximo passo correto e seguir para `Dashboard e shell operacional`, porque ali esta a maior concentracao de densidade, prioridade e risco de poluicao visual do sistema.
