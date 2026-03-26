# Frontend Color System

## Objetivo
Este documento descreve o sistema de cor do frontend com foco em consistencia de produto, legibilidade e uso enterprise. A base visual do projeto e uma paleta "Graphite Ledger": fundo mineral claro, estrutura grafite, ações discretas e semantica funcional para estados.

## Direcao Visual
- Base clara, limpa e sem ornamento desnecessario.
- Grafite e pedra como eixo principal, sem "azul corporativo" dominante.
- Cor de estado so quando houver semantica real.
- Contraste suficiente para operacao longa e telas densas.
- A paleta deve parecer unificada em app, auth, PDF e email, mesmo que cada meio tenha restricoes tecnicas diferentes.

## Camadas Do Sistema
O frontend trabalha com quatro camadas de cor:
- `brand-*`: valores-base da paleta.
- `ds-color-*`: tokens semanticos globais do design system.
- `component-*`: tokens de componente, usados para afinar superficies, campos, tabelas e shells.
- aliases de aplicacao: `--text-primary`, `--bg-app`, `--button-primary-bg`, etc., para uso rapido no app.

Regra geral:
- use `ds-color-*` para decidir significado.
- use `component-*` para montar componente.
- use `brand-*` apenas como fonte da paleta, nao como atalho direto.

## Paleta Enterprise
Valores principais da paleta atual do frontend:

| Papel | Token base | Valor |
| --- | --- | --- |
| Canvas | `--brand-background` | `#f6f5f3` |
| Sidebar | `--brand-sidebar` | `#2c2825` |
| Sidebar border | `--brand-sidebar-border` | `#4a433d` |
| Card | `--brand-card` | `#ffffff` |
| Primary | `--brand-primary` | `#3e3935` |
| Primary hover | `--brand-primary-hover` | `#2c2825` |
| Primary active | `--brand-primary-active` | `#25221f` |
| Secondary | `--brand-secondary` | `#67615b` |
| Title/text base | `--brand-title`, `--brand-text-primary` | `#25221f` |
| Text secondary | `--brand-text-secondary` | `#5c5650` |
| Text muted | `--brand-text-muted` | `#77706a` |
| Border default | `--brand-border-default` | `#b7aea5` |
| Border strong | `--brand-border-strong` | `#8f8882` |
| Success | `--brand-success` | `#1d6b43` |
| Warning | `--brand-warning` | `#9a5a00` |
| Danger | `--brand-danger` | `#b3261e` |
| Info | `--brand-info` | `#57534e` |

Observacao: a camada de tema (`theme-light.css` e `theme-dark.css`) traduz esses valores em tokens de uso, e o backend possui registros de `system_theme` alinhados a essa direcao visual. O contrato visual do frontend, porem, deve ser decidido pelos tokens CSS.

## Semantica De Cor

### Superficies
- `--ds-color-bg-canvas`: fundo principal da aplicacao.
- `--ds-color-bg-subtle`: fundo secundario, seco e discreto.
- `--ds-color-surface-base`: cartao/painel principal.
- `--ds-color-surface-elevated`: elevacao leve, nunca "glow".
- `--ds-color-surface-overlay`: modais, popovers e camadas flutuantes.
- `--ds-color-surface-muted`: areas auxiliares, headers e faixas suaves.
- `--ds-color-surface-sunken`: campos desabilitados, interiores, areas recuadas.

### Bordas
- `--ds-color-border-subtle`: separacao leve.
- `--ds-color-border-default`: borda padrao de cards e inputs.
- `--ds-color-border-strong`: enfatiza contorno ou foco secundario.
- `--ds-color-border-input`: borda especifica de campo.
- `--ds-color-border-focus`: borda de foco, usada com ring.

### Texto
- `--ds-color-text-primary`: texto principal.
- `--ds-color-text-secondary`: texto de suporte, labels e descricoes.
- `--ds-color-text-muted`: meta informacao, placeholders e observacoes.
- `--ds-color-text-disabled`: texto inativo.
- `--ds-color-text-inverse`: texto sobre fundo escuro ou cor forte.
- `--ds-color-text-link`: link e acao textual.

### Acao
- `--ds-color-action-primary`: CTA principal.
- `--ds-color-action-primary-hover` e `--active`: estados de interacao.
- `--ds-color-action-secondary`: acao secundario, normalmente neutra.
- `--ds-color-action-secondary-hover` e `--active`: variações de hover/press.
- `--ds-color-primary-subtle`: destaque leve, filtros e chips.
- `--ds-color-primary-border`: borda de destaque suave.

### Estado
- `--ds-color-success`: sucesso operacional.
- `--ds-color-warning`: atencao, pendencia ou risco moderado.
- `--ds-color-danger`: erro, bloqueio ou acao irreversivel.
- `--ds-color-info`: informacao e contextualizacao.
- `--ds-color-*-subtle`: fundo de banner, tag ou callout.
- `--ds-color-*-border`: borda do mesmo contexto.
- `--ds-color-*-fg`: texto de estado quando o componente pede um tom mais rico.

### Sidebar E Shell
- `--ds-color-sidebar-bg`: fundo da navegação lateral.
- `--ds-color-sidebar-surface`: recortes e superficies internas.
- `--ds-color-sidebar-text`: texto principal da navegação.
- `--ds-color-sidebar-muted`: texto secundario.
- `--ds-color-sidebar-border`: divisorias.
- `--component-shell-backdrop`: fundo de camadas externas.

### Focus E Acessibilidade
- `--ds-color-focus`: cor do foco funcional.
- `--ds-color-focus-ring`: halo visivel e consistente.
- Todo elemento interativo precisa de foco visivel.
- Nao substitua focus por hover.

## Tokens Principais
Use estes como primeira escolha:
- `--ds-color-bg-canvas`
- `--ds-color-surface-base`
- `--ds-color-surface-overlay`
- `--ds-color-border-default`
- `--ds-color-text-primary`
- `--ds-color-text-secondary`
- `--ds-color-action-primary`
- `--ds-color-action-primary-foreground`
- `--ds-color-action-secondary`
- `--ds-color-success`
- `--ds-color-warning`
- `--ds-color-danger`
- `--ds-color-info`
- `--ds-color-focus`
- `--ds-color-focus-ring`

Para padrao de componente:
- `--component-card-bg`, `--component-card-border`, `--component-card-shadow`
- `--component-field-bg`, `--component-field-border`, `--component-field-border-focus`
- `--component-button-primary-bg`, `--component-button-secondary-bg`
- `--component-table-bg`, `--component-table-row-hover`, `--component-table-header-bg`
- `--component-navbar-bg`, `--component-sidebar-panel-bg`

Para uso rapido em telas:
- `--bg-app`
- `--bg-subtle`
- `--surface`
- `--surface-muted`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--button-primary-bg`
- `--button-secondary-bg`
- `--success-bg`
- `--warning-bg`
- `--error-bg`
- `--info-bg`

## Regras De Uso
### Prefira semantica, nao cor literal
Se o elemento comunica acao, use token de acao. Se comunica estado, use token de estado. Se apenas organiza a leitura, use superficie ou borda.

### Mantem contraste funcional
- Texto principal precisa ser o mais legivel da tela.
- Texto secundario nunca deve competir com o principal.
- Elementos de estado em fundo claro devem usar `*-subtle` + `*-border` + texto da mesma familia.

### Limite a quantidade de cores por tela
- Um CTA principal por fluxo.
- Um estado dominante por bloco.
- Cores de estado nao devem virar decoracao.

### Evite misturar familias sem motivo
- Nao use `success` para "verde bonito".
- Nao use `warning` para chamar atencao sem risco ou pendencia.
- Nao use `danger` para destaque visual neutro.
- Nao transforme `info` em substituto de marca.

## Do / Don't

### Do
- Use `--ds-color-action-primary` para a principal acao da pagina.
- Use `--ds-color-surface-base` em cards e paineis.
- Use `--ds-color-border-subtle` para separar areas sem ruido visual.
- Use `--ds-color-success-subtle` e `--ds-color-success-border` em banners de sucesso.
- Use `--component-*` dentro de componentes reutilizaveis.
- Use `--color-text-*` e `--bg-*` apenas como atalhos de tela, quando o contexto ja esta definido.
- Use a mesma familia de cor em hover, focus e active.

### Don't
- Nao codifique hex diretamente em componentes de app.
- Nao use `brand-*` no lugar de tokens semanticos.
- Nao use azul por inercia para acao primaria.
- Nao use cores de estado em superficies neutras.
- Nao misture varios tons fortes no mesmo bloco apenas para "dar vida".
- Nao dependa de `color-mix` como se fosse semantica; ele e refinamento, nao significado.

## Guidance Por Contexto

### Componentes
- Componentes devem consumir tokens, nao assumir a cor do dominio.
- Botao primario: fundo de acao, texto inverso, hover/active explicitamente definidos.
- Botao secundario: superficie clara, borda forte, texto principal.
- Campo: superficie base, borda de input, foco com ring visivel.
- Tabela: fundo quase neutro, hover sutil, header levemente recuado.
- Badge/pill: use superficie neutra para status informativo e use estado apenas quando houver significado.

### Auth
Auth pede leitura rapida, serenidade e foco total na tarefa.
- Use canvas claro, card elevado e bordas sutis.
- Mantenha CTA principal grafite/escuro com alto contraste.
- Banners de erro e aviso devem usar `warning` e `danger` com fundos sutis.
- Campos precisam de foco muito claro, porque login e reset de senha sao fluxos com alta friccao.
- Ajustes locais em `--login-*` sao aceitaveis apenas quando servem para contraste, foco, densidade ou legibilidade do layout de auth.
- Nao crie uma identidade visual paralela para auth; o objetivo e parecer uma extensao mais calma do sistema.

### PDF
PDF e um canal separado do CSS do browser.
- Use `frontend/lib/pdf-system/tokens/pdfColors.ts` e `pdfSemantics.ts`.
- Nao confie em variaveis CSS do frontend para gerar PDF.
- Mantenha semantica previsivel: `success`, `warning`, `danger` e `info` devem se comportar de forma consistente entre modulos.
- Em PDF, prefira RGB fixo e contrastes simples.
- Nao use efeitos de browser, sombras excessivas ou transparencia sofisticada.
- Se um estado aparecer em tabela, selo ou legenda, a semantica precisa ser a mesma do app.

### Email
Email precisa ser robusto em clientes variados.
- Use HTML inline, estrutura simples e largura contida.
- O padrao atual de comunicacao grafite deve continuar: barra superior grafite, shell claro, texto escuro e CTA forte.
- Prefira uma paleta reduzida: fundo claro, grafite, borda suave, texto secundario e `warning` apenas quando o email for sensivel.
- Nao use CSS externo, gradientes complexos ou componentes dependentes de runtime do navegador.
- Nao dependa de dark mode do cliente de email.
- CTA de email deve ser evidente, mas nunca agressivo.

## Resumo Pratico
- `primary` = acao.
- `surface` = estrutura.
- `text` = leitura.
- `success/warning/danger/info` = significado.
- `component-*` = implementacao.
- `pdf` e `email` = canais com regras proprias, mas mesma linguagem de marca.

## Referencias
- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/styles/theme-dark.css`
- `frontend/lib/pdf-system/tokens/pdfColors.ts`
- `frontend/lib/pdf-system/tokens/pdfSemantics.ts`
- `backend/src/mail/mail.service.ts`
- `backend/src/auth/auth.service.ts`
