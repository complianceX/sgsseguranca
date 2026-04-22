# Fase 12 - Auditoria Visual do Modulo Configuracoes

Data: 2026-04-21
Escopo: pagina principal do modulo Configuracoes e suas superficies internas de conta, governanca e administracao

## Superficies validadas

- `http://localhost:3000/dashboard/settings`
- `frontend/app/dashboard/settings/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/settings` abriu o shell do app, mas a tela ficou presa no loading centralizado.
- O navegador registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a pagina autenticada nao chegou a renderizar por causa da indisponibilidade do backend.
- O fechamento visual foi feito por leitura integral da pagina e pela estrutura real dos blocos renderizados em `settings/page.tsx`.

## Achados principais

### 1. Configuracoes concentra responsabilidades demais em uma unica pagina

- A tela mistura privacidade de IA, centro de governanca, troca de senha, dados da conta, logo da empresa, atalhos administrativos, notificacoes corporativas e regras de bloqueio da PT.
- Isso ultrapassa a ideia de uma pagina de configuracoes simples.
- Visualmente, o modulo se aproxima de um hub administrativo completo.

### 2. A hierarquia da pagina esta muito horizontal

- Muitos cards usam peso visual parecido.
- Quase tudo aparece como bloco principal.
- O usuario precisa escanear uma quantidade alta de secoes para entender o que e conta pessoal, o que e administracao da empresa e o que e governanca operacional.

### 3. O modulo sofre de mistura entre configuracao pessoal e administracao corporativa

- `Trocar senha` e `Dados da conta` convivem no mesmo fluxo visual com `Notificações corporativas`, `Regras de bloqueio da PT` e `Centro de governança operacional`.
- Isso prejudica a clareza de ownership da tela.
- Um usuario comum e um administrador leem a mesma pagina com cargas cognitivas muito diferentes.

### 4. Ha inconsistencias de padrao visual dentro da propria pagina

- Alguns campos seguem tokens e bordas do design system.
- Outros usam classes mais cruas como `rounded-md border px-3 py-2`.
- Botoes, cards, toggles e links usam varias abordagens visuais na mesma page.
- Isso enfraquece a sensacao de sistema padronizado.

### 5. O modulo ainda depende fortemente de motion, hover e estados visuais reativos

- Toggle de consentimento IA usa transicoes e deslocamento.
- Cards clicaveis de governanca usam `motion-safe:transition-colors` e hover destacado.
- Botoes principais e secundarios usam `motion-safe:transition` e hover recorrente.
- Para o padrao que voce definiu, isso esta mais decorado do que deveria.

### 6. A area de notificacoes corporativas esta visualmente grande demais

- O bloco agrega indicadores, destinatarios, agenda, secoes do resumo, toggles, botoes de salvar, disparar, restaurar, gerar previa e paines de retorno.
- Funcionalmente faz sentido.
- Mas visualmente domina a pagina e puxa o modulo para uma densidade excessiva.

## Problemas priorizados

### Prioridade alta

#### Problema: o modulo concentra configuracao pessoal, administracao e governanca no mesmo plano visual

- Por que prejudica: o usuario precisa interpretar uma tela longa e heterogenea para localizar uma acao simples.
- Como deve ficar: separacao nitida entre configuracoes pessoais, configuracoes da empresa e governanca operacional.
- Sugestao pratica: dividir a pagina em grupos mais duros ou abas secas, com `Conta`, `Empresa`, `Alertas` e `Governança` como eixos principais.

#### Problema: a hierarquia entre secoes nao deixa claro o que e principal e o que e apoio

- Por que prejudica: quase todos os cards competem entre si.
- Como deve ficar: topo curto, bloco pessoal enxuto e areas administrativas claramente secundarizadas ou segmentadas.
- Sugestao pratica: reordenar a tela para abrir com conta pessoal e mover centros administrativos pesados para secoes separadas e menos simultaneas.

#### Problema: notificacoes corporativas ocupam massa visual excessiva dentro da pagina geral

- Por que prejudica: uma unica funcionalidade passa a dominar a leitura do modulo inteiro.
- Como deve ficar: configuracao de alertas tratada como subarea administrativa dedicada, nao como bloco central de uma pagina geral de configuracoes.
- Sugestao pratica: extrair `Notificações corporativas` para uma tela propria ou ao menos uma secao recolhida e segmentada.

### Prioridade media

#### Problema: ha inconsistencias de padrao visual entre inputs, toggles, links e botoes

- Por que prejudica: a pagina parece montada por blocos independentes, e nao por um contrato visual unico.
- Como deve ficar: um unico padrao de campo, espaco, borda e CTA ao longo da page.
- Sugestao pratica: alinhar todos os inputs e botoes ao contrato de `globals.css` e remover classes cruas isoladas.

#### Problema: cards clicaveis e links administrativos disputam atencao com configuracoes reais

- Por que prejudica: a pagina mistura configuracao e navegacao no mesmo nivel de destaque.
- Como deve ficar: atalhos administrativos mais discretos do que os formularios e controles efetivos.
- Sugestao pratica: rebaixar visualmente `Gestão do sistema` e `Centro de governança operacional`, usando-os como navegação utilitária, não como protagonistas.

### Prioridade baixa

#### Problema: residuos de motion e hover continuam espalhados por todo o modulo

- Por que prejudica: ampliam o ruído visual numa pagina ja muito longa e densa.
- Como deve ficar: estados visuais mais estaveis e menos decorativos.
- Sugestao pratica: remover `motion-safe:*`, reduzir hover competitivo e simplificar o toggle de IA para um controle mais seco.

#### Problema: a validacao visual da pagina fica mascarada pelo loading do shell

- Por que prejudica: dificulta validar acabamento real e comportamento visual final.
- Como deve ficar: pagina renderizando normalmente para permitir auditoria de superficie completa.
- Sugestao pratica: recuperar a conectividade do backend em `localhost:3011` antes da fase de consolidacao final do frontend.

## Veredito da Fase 12

Configuracoes e, ate aqui, uma das superficies mais sobrecarregadas do frontend administrativo. O problema nao e falta de recurso; e excesso de funcoes convivendo no mesmo plano visual. O caminho correto aqui e separar melhor as responsabilidades da pagina, endurecer a hierarquia e reduzir motion e hover para transformar o modulo em uma area administrativa mais limpa, profissional e previsivel.
