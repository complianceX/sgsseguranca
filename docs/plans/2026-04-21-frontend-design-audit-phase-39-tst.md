# Fase 39 - Auditoria Visual do Modulo TST

Data: 2026-04-21
Escopo: cockpit operacional, atalhos de campo, status de conectividade, consulta por CPF, fila offline e listas de pendencias

## Superficies validadas

- `http://localhost:3000/dashboard/tst`
- `frontend/app/dashboard/tst/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/tst` abriu apenas o shell do app.
- O frontend seguiu com erro de conexao em `http://localhost:3011/auth/csrf`.
- O fechamento visual desta fase foi feito pela leitura integral da tela real e pela evidencia do shell observada no navegador.

## Achados principais

### 1. TST foi construido como um cockpit completo e isso gerou densidade visual alta

- Header institucional grande.
- Chips operacionais.
- Cards de atalho.
- Cards resumo.
- Consulta por CPF.
- Fila offline.
- Listas de PT, NC, documentos e inspecoes.
- A pagina concentra muita coisa importante ao mesmo tempo.

### 2. A tela sofre de excesso de protagonismo

- Varios blocos usam card.
- Varios blocos tem titulo proprio.
- Varios blocos tem destaque cromatico.
- Varios blocos querem ser "o mais importante".
- Falta uma hierarquia mais dura entre decisao principal, apoio e detalhe.

### 3. Os atalhos de campo ocupam muito espaco e disputam foco com os dados operacionais

- Checklist rapido.
- Relatorio fotografico.
- Inspecao guiada.
- APR em campo.
- PT em campo.
- Todos aparecem logo no topo com icone, badge, descricao e CTA.
- Isso parece mais uma vitrine de funcionalidades do que um painel executivo de uso diario.

### 4. Consulta por CPF e fila offline sao uteis, mas juntas pesam muito no miolo da tela

- A consulta do trabalhador exige atencao focal.
- A fila offline tambem exige atencao focal.
- Ambas aparecem como blocos robustos e concorrentes.
- O resultado e uma area central carregada e cansativa.

### 5. A pagina acumula muitos estados de excecao visiveis ao mesmo tempo

- Offline.
- Online.
- Sincronizacao.
- Erro de consulta.
- Bloqueio do trabalhador.
- Ultimos itens da fila.
- PTs pendentes.
- NCs criticas.
- Documentos vencendo.
- Inspecoes atrasadas.
- A tela comunica urgencia demais em paralelo.

### 6. Ainda existem transicoes e animacoes leves fora do padrao que voce quer

- `motion-safe:transition-colors` nos atalhos.
- `motion-safe:transition` no campo de CPF.
- `motion-safe:animate-spin` em sincronizacao e reconexao.
- Para esse modulo, o ideal e reduzir ainda mais qualquer percepcao de movimento.

## Problemas priorizados

### Prioridade alta

#### Problema: a pagina concentra funcoes demais em uma unica superficie

- Por que prejudica: dificulta leitura rapida, aumenta cansaco visual e reduz foco operacional.
- Como deve ficar: uma tela com menos centros de gravidade e mais separacao entre operacao primaria e apoio.
- Sugestao pratica: dividir o modulo entre um painel principal de decisao do dia e uma segunda camada para fila offline e listas complementares.

#### Problema: os atalhos de campo estao protagonizando mais do que os indicadores operacionais

- Por que prejudica: a interface parece vender caminhos em vez de mostrar primeiro a situacao do dia.
- Como deve ficar: atalhos mais discretos e indicadores mais centrais.
- Sugestao pratica: reduzir o bloco de atalhos para uma faixa secundaria compacta, com menos descricao e menos destaque visual.

### Prioridade media

#### Problema: consulta por CPF e fila offline competem pela mesma importancia visual

- Por que prejudica: o usuario precisa decidir entre dois fluxos pesados no mesmo plano de leitura.
- Como deve ficar: consulta como acao principal e fila como apoio operacional, ou o inverso, mas nao os dois empatados.
- Sugestao pratica: escolher uma area dominante no miolo e rebaixar a outra para card lateral mais seco.

#### Problema: excesso de cards e listas abertas ao mesmo tempo

- Por que prejudica: gera poluicao visual e fragmenta a atencao.
- Como deve ficar: menos blocos visiveis por vez e melhor agrupamento por criticidade.
- Sugestao pratica: agrupar PT, NC, documentos e inspecoes em dois blocos consolidados em vez de quatro paines separados no mesmo nivel.

### Prioridade baixa

#### Problema: transicoes e spinners ainda aparecem em varios pontos da pagina

- Por que prejudica: reforcam agitacao visual em uma tela que ja e naturalmente densa.
- Como deve ficar: comportamento estavel, direto e sem movimento perceptivel.
- Sugestao pratica: retirar `motion-safe:*`, usar estados estaticos de carregamento e manter feedback apenas por texto, cor e desabilitacao.

## Veredito da Fase 39

TST e funcionalmente forte, mas visualmente pesado. O problema central aqui nao e falta de componente bonito: e excesso de modulo dentro do proprio modulo. Para essa tela ficar realmente profissional, ela precisa respirar mais, ter menos protagonistas e assumir uma hierarquia operacional muito mais dura.
