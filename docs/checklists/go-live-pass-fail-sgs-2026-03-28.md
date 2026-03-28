# Go Live Pass-Fail SGS

Data base: 28 de marco de 2026
Ambiente: production

Preencha cada linha com `PASS` ou `FAIL`.

## Infra e publicacao

- [ ] `PASS` ou `FAIL` - Frontend ativo em `https://app.sgsseguranca.com.br`
- [ ] `PASS` ou `FAIL` - Backend ativo em `https://api.sgsseguranca.com.br`
- [ ] `PASS` ou `FAIL` - Worker ativo no Railway
- [ ] `PASS` ou `FAIL` - `GET /health/public` responde `200`

## Login e sessao

- [ ] `PASS` ou `FAIL` - Tela `/login` abre corretamente
- [ ] `PASS` ou `FAIL` - Login com usuario valido funciona
- [ ] `PASS` ou `FAIL` - Refresh de pagina mantem a sessao
- [ ] `PASS` ou `FAIL` - Logout encerra a sessao corretamente

## APR

- [ ] `PASS` ou `FAIL` - Listagem de APR abre corretamente
- [ ] `PASS` ou `FAIL` - Busca funciona
- [ ] `PASS` ou `FAIL` - Filtros funcionam
- [ ] `PASS` ou `FAIL` - Paginacao funciona
- [ ] `PASS` ou `FAIL` - Nova APR pode ser criada
- [ ] `PASS` ou `FAIL` - APR pode ser editada e salva

## Assinatura e PDF

- [ ] `PASS` ou `FAIL` - Assinatura funciona sem erro
- [ ] `PASS` ou `FAIL` - PDF final pode ser emitido

## Transicoes criticas

- [ ] `PASS` ou `FAIL` - Aprovar APR funciona
- [ ] `PASS` ou `FAIL` - Reprovar APR funciona
- [ ] `PASS` ou `FAIL` - Finalizar APR funciona
- [ ] `PASS` ou `FAIL` - Historico registra a transicao

## Offline

- [ ] `PASS` ou `FAIL` - APR base pode ser salva offline
- [ ] `PASS` ou `FAIL` - Assinatura continua bloqueada offline
- [ ] `PASS` ou `FAIL` - PDF final continua bloqueado offline
- [ ] `PASS` ou `FAIL` - Sincronizacao online conclui sem duplicidade

## SOPHIE

- [ ] `PASS` ou `FAIL` - Interface da SOPHIE aparece quando habilitada
- [ ] `PASS` ou `FAIL` - Assistencia responde sem erro

## Observabilidade

- [ ] `PASS` ou `FAIL` - Sem erro recorrente de New Relic nos logs
- [ ] `PASS` ou `FAIL` - Sentry recebendo eventos quando houver erro controlado

## Regra de decisao

- Go live aprovado:
  Todos os itens criticos abaixo em `PASS`

Itens criticos:
- Login com usuario valido
- Listagem de APR
- Criacao e edicao de APR
- Assinatura
- PDF final
- Aprovar APR
- Reprovar APR
- Finalizar APR
- Offline bloqueando assinatura e PDF

- Go live bloqueado:
  Qualquer item critico em `FAIL`
