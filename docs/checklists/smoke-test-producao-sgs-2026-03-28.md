# Smoke Test de Producao SGS

Data base: 28 de marco de 2026
Ambiente: Render + Supabase / production
Frontend: https://app.sgsseguranca.com.br
Backend: https://api.sgsseguranca.com.br

## Ja validado automaticamente

- [x] `Frontend` com deploy ativo `SUCCESS`
- [x] `Backend` com deploy ativo `SUCCESS`
- [x] `Worker` com deploy ativo `SUCCESS`
- [x] `Worker` usando imagem dedicada de worker (`Dockerfile.worker`)
- [x] `GET /health/public` respondendo `200`
- [x] `GET /` no frontend redirecionando para `/login`
- [x] `NEW_RELIC_ENABLED=false` aplicado em `Backend` e `Worker`
- [x] `Worker` com `FEATURE_AI_ENABLED=true`
- [x] Branding e `FRONTEND_URL` do `Worker` alinhados com `app.sgsseguranca.com.br`

## Pre-condicoes para a validacao autenticada

- [ ] Ter uma conta valida de producao com permissao para APR
- [ ] Ter acesso a uma empresa/unidade/obra com dados reais de teste
- [ ] Ter um fluxo de assinatura disponivel para validar emissao final
- [ ] Se SOPHIE for validada, garantir consentimento de IA ativo no usuario

## Fluxo 1: Login e sessao

- [ ] Abrir `https://app.sgsseguranca.com.br/login`
- [ ] Confirmar carregamento visual da pagina de login
- [ ] Fazer login com CPF e senha validos
- [ ] Confirmar redirecionamento para area autenticada
- [ ] Atualizar a pagina e confirmar sessao mantida
- [ ] Aguardar alguns minutos e confirmar `refresh` funcionando sem logout inesperado
- [ ] Fazer logout e confirmar retorno para `/login`

Resultado esperado:
- Login entra sem erro
- Sessao persiste apos refresh
- Logout encerra sessao com limpeza correta

## Fluxo 2: Listagem de APR

- [ ] Acessar `/dashboard/aprs`
- [ ] Confirmar carregamento da tabela desktop
- [ ] Validar busca por numero ou titulo
- [ ] Validar filtros de `Status`, `Obra`, `Responsavel` e `Vencimento`
- [ ] Validar `Mais filtros`
- [ ] Validar ordenacao
- [ ] Alternar densidade `Confortavel | Compacta`
- [ ] Validar paginacao
- [ ] Abrir uma APR existente pela acao principal da linha

Resultado esperado:
- A listagem funciona como fila operacional
- Status, vencimento e bloqueio aparecem sem abrir o detalhe

## Fluxo 3: Criacao e edicao de APR

- [ ] Criar uma nova APR
- [ ] Preencher contexto basico
- [ ] Adicionar pelo menos um risco
- [ ] Salvar rascunho
- [ ] Reabrir a APR e confirmar persistencia correta
- [ ] Editar e salvar novamente

Resultado esperado:
- Nenhum `400` por campos vazios opcionais
- Draft e salvamento operam sem perda silenciosa

## Fluxo 4: Assinatura e emissao final

- [ ] Abrir uma APR pendente de assinatura
- [ ] Registrar assinatura
- [ ] Confirmar ausencia de erro no modal de assinatura
- [ ] Emitir PDF final
- [ ] Confirmar download ou visualizacao do PDF

Resultado esperado:
- Assinatura conclui sem erro de canvas
- PDF final e gerado apos a assinatura

## Fluxo 5: Transicoes criticas APR

- [ ] Aprovar uma APR pela rota canonica da aplicacao
- [ ] Reprovar uma APR com motivo
- [ ] Finalizar uma APR elegivel
- [ ] Validar no historico que a transicao ficou registrada

Resultado esperado:
- Todas as transicoes concluem com sucesso
- Historico/trilha mostra o evento corretamente

## Fluxo 6: Offline sanitizado

- [ ] Abrir uma APR em contexto de navegador normal
- [ ] Simular perda de conexao antes do envio da APR base
- [ ] Salvar APR base offline
- [ ] Reabrir a tela
- [ ] Confirmar banner explicando que apenas a APR base foi salva localmente
- [ ] Confirmar que assinatura, PDF final e emissao continuam bloqueados offline
- [ ] Voltar online
- [ ] Sincronizar
- [ ] Confirmar liberacao para conclusao online

Resultado esperado:
- Sem persistencia local de assinatura
- Sem duplicidade na fila offline
- Sem falsa sensacao de conclusao

## Fluxo 7: SOPHIE

- [ ] Confirmar exibicao da experiencia da SOPHIE no frontend
- [ ] Acionar uma sugestao assistida
- [ ] Confirmar resposta do backend sem erro
- [ ] Validar que a sugestao gerada nao bloqueia o fluxo principal

Resultado esperado:
- Assistente responde
- Fluxo permanece governado e revisavel

## Verificacoes rapidas de observabilidade

- [ ] Confirmar ausencia de spam `401` do New Relic nos logs de `Backend`
- [ ] Confirmar ausencia de spam `401` do New Relic nos logs de `Worker`
- [ ] Confirmar eventos no Sentry quando houver erro controlado

## Bloqueios para rollback ou correcao imediata

- [ ] Login falhando para usuarios validos
- [ ] `refresh` derrubando sessao continuamente
- [ ] APR retornando `400` para payload valido
- [ ] Assinatura quebrando
- [ ] PDF final indisponivel
- [ ] Aprovar/reprovar/finalizar sem registrar historico
- [ ] Offline liberando assinatura ou emissao final

## Observacao operacional

No momento desta checklist, a validacao automatica cobriu apenas superficie publica e estado de deploy. A parte autenticada depende de uma conta real de producao ou conta de homologacao controlada.
