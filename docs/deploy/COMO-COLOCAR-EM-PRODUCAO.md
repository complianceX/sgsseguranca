# Como colocar o SGS em produção

**Para quem:** dono do produto / quem opera.
**O que é:** o passo a passo real, de ponta a ponta, com as armadilhas que já morderam.

> **A regra que resume tudo:** neste projeto, **PR mergeado ≠ está em produção**.
> Nada sobe sozinho de forma confiável. Sempre confirme o commit que está realmente rodando.

Detalhe de configuração do Coolify (env vars, recursos, domínios):
[`coolify-vultr-backend-web-worker.md`](./coolify-vultr-backend-web-worker.md).

Para mudanças de Redis/TLS, use também:
[`redis-hardening-rollout.md`](./redis-hardening-rollout.md).

---

## Mapa rápido

| Componente | Plataforma | Sobe sozinho? | Como subir |
|---|---|---|---|
| **Frontend** | Vercel | **Não** — sem integração git | `vercel --prod` manual |
| **Backend Web** | Coolify/Vultr | Webhook existe, **não é confiável** | API ou painel |
| **Worker** | Coolify/Vultr (2ª VPS) | idem | API ou painel |
| **Migrations** | Neon | **Não** — por decisão de projeto | `npm run migration:run` manual |

---

## 1. Frontend (Vercel)

O projeto **não tem integração git com o Vercel**. Push na `main` não faz nada.

```bash
cd frontend
vercel --prod --yes
```

Ao final, a saída deve mostrar `Aliased: https://app.sgsseguranca.com.br`.

**Confirmar que subiu:**

```bash
# 1. o alias aponta para o deploy novo?
cd frontend && vercel inspect https://app.sgsseguranca.com.br
#    confira o campo "created" — deve ser de agora

# 2. está no ar?
curl -s -o /dev/null -w "%{http_code}\n" https://app.sgsseguranca.com.br/login
#    esperado: 200
```

---

## 2. Backend Web e Worker (Coolify)

### Se houver migration nova, ela vem **antes** do deploy

Migrations **não rodam no boot** (decisão de projeto — evita que um container subindo altere o
schema). Rode manualmente e só então deploye:

```bash
cd backend && npm run migration:run
```

Para conferir se há pendência (somente leitura, seguro):

```bash
cd backend && node scripts/check-pending-migrations-runtime.js
# esperado quando está tudo aplicado: {"pendingCount": 0, "pending": []}
```

### Disparar o deploy pela API

Precisa de um token: painel do Coolify → **Keys & Tokens → API Tokens** (o token não é
reexibido depois de criado).

```bash
TOKEN="<seu token>"
COOLIFY="http://216.22.43.246:8000"

# Backend Web
curl -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$COOLIFY/api/v1/deploy?uuid=zdz9pgctj4k0gpds0sj2az6s&force=false"

# Worker
curl -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$COOLIFY/api/v1/deploy?uuid=jos9vyejobbagk1yejqlsfhd&force=false"
```

> **`Accept: application/json` é obrigatório.** Sem esse header a API responde
> `{"message":"Unauthenticated."}` mesmo com o token correto — parece erro de credencial e não é.

| Aplicação | UUID |
|---|---|
| Backend WEB | `zdz9pgctj4k0gpds0sj2az6s` |
| Backend Worker | `jos9vyejobbagk1yejqlsfhd` |

Painel do ambiente atual:
`http://216.22.43.246:8000/project/e90jc1p5csbhj21cii0xybf4/environment/dmsy07hd8g2gz5bqqctokf9n`.

### Confirmar que subiu o commit certo

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$COOLIFY/api/v1/deployments/applications/zdz9pgctj4k0gpds0sj2az6s" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      const x=JSON.parse(d).deployments[0];
      console.log(x.status, x.commit, x.created_at);
    })"
```

Compare o `commit` com o HEAD da `main` (`git log --oneline -1`). Se não bater, **o deploy não
aconteceu** — independente do que o `/health` diga.

---

## 3. Armadilhas reais (todas já aconteceram aqui)

### `/health` respondendo `ok` **não** prova que o deploy novo subiu

Se o container novo falha ao iniciar, o Coolify mantém o antigo servindo. O health check passa,
o site funciona, e a sua feature simplesmente não está lá. Já aconteceu de a produção ficar
**2 a 4 dias** na versão velha com vários PRs mergeados. A única prova é comparar o commit
(seção 2).

### Um commit direto na `main` pode quebrar o boot e você não descobre

Já aconteceu: um commit direto (sem PR) fechou um ciclo de import que impedia a aplicação de
**inicializar**. O CI rodou e falhou — mas ninguém olhou, porque não havia PR. O deploy falhou
em silêncio e o container antigo continuou servindo.

**Sempre via PR.** É o CI que pega isso, e os testes E2E são os únicos que sobem a aplicação
real.

### Endpoint `-pooler` do Neon quebra a segurança multi-tenant

`DATABASE_URL` **nunca** pode usar o endpoint `-pooler`: ele quebra o `SET LOCAL`, e com ele a
RLS — o isolamento entre empresas cai. Só `DATABASE_MIGRATION_URL` pode usar pooler.

### Rebuild pesado derruba VPS pequena

O build do backend inclui Chromium (Puppeteer, para PDFs). Em VPS pequena, subir Web e Worker ao
mesmo tempo pode travar a máquina. **Pare o Worker antes de deployar a API** quando estiver
apertado de recurso.

---

## 4. Checklist de deploy

```
[ ] PR mergeado na main com CI verde (incluindo E2E)
[ ] git checkout main && git pull
[ ] Tem migration nova?
      [ ] npm run migration:run
      [ ] check-pending-migrations-runtime.js → pendingCount: 0
[ ] Backend: dispara deploy (Web e/ou Worker)
      [ ] deployments[0].commit == HEAD da main
      [ ] deployments[0].status == finished
      [ ] curl https://api.sgsseguranca.com.br/health → {"status":"ok"}
[ ] Frontend mudou?
      [ ] cd frontend && vercel --prod --yes
      [ ] vercel inspect https://app.sgsseguranca.com.br → "created" é de agora
      [ ] curl .../login → 200
[ ] Testar na prática o que mudou (não confiar só no health)
```

---

## 5. Quando algo dá errado

| Sintoma | Olhe primeiro |
|---|---|
| Feature não aparece, mas o site funciona | Commit do deploy (seção 2) — provavelmente subiu o antigo |
| E-mail não chegou | Fila `mail-dlq` no Bull Board (`/admin/queues`) |
| PDF não gerou | Fila `pdf-generation-dlq` |
| Importação de documento travou | Fila `document-import-dlq` |
| Upload recusado | ClamAV — comportamento é *fail-closed*, sem antivírus o anexo é recusado |
| Listagem vazia sem motivo | Contexto de tenant ausente — a RLS retorna zero linhas, não erro |
| Deploy trava a VPS | Rebuild do Chromium — pare o Worker antes (seção 3) |

Aprofundar: [`../../backend/docs/INCIDENT_PLAYBOOK.md`](../../backend/docs/INCIDENT_PLAYBOOK.md) ·
[`../../backend/docs/RUNBOOK_PRODUCTION.md`](../../backend/docs/RUNBOOK_PRODUCTION.md) ·
[`../consulta-rapida/troubleshooting.md`](../consulta-rapida/troubleshooting.md) ·
[`../consulta-rapida/disaster-recovery-e-backup.md`](../consulta-rapida/disaster-recovery-e-backup.md)
