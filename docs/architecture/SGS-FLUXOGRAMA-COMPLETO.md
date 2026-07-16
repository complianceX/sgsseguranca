# SGS — Fluxograma Completo do Sistema

## Visão geral em uma imagem

Painel único com os 54 módulos, o pipeline de governança e os controles — para
apresentação, auditoria e onboarding.

![Fluxograma do sistema SGS](../assets/architecture/sgs-fluxograma-sistema.png)

[PNG 4000×3184](../assets/architecture/sgs-fluxograma-sistema.png) ·
[PDF vetorial](../assets/architecture/sgs-fluxograma-sistema.pdf) ·
[fonte HTML](../assets/architecture/src/sgs-fluxograma-sistema.html)

```bash
# regerar após editar o HTML (roda da raiz do repositório)
node docs/assets/architecture/src/render.js \
  docs/assets/architecture/src/sgs-fluxograma-sistema.html \
  docs/assets/architecture/sgs-fluxograma-sistema.png 2

node docs/assets/architecture/src/render.js \
  docs/assets/architecture/src/sgs-fluxograma-sistema.html \
  docs/assets/architecture/sgs-fluxograma-sistema.pdf
```

---

## Diagramas por recorte

Fluxogramas do SGS em Mermaid (versionados, renderizam direto no GitHub).
Cada diagrama cobre um recorte; comece pelo macro e desça conforme a dúvida.

- [1. Topologia macro](#1-topologia-macro)
- [2. Ciclo de vida de um documento governado](#2-ciclo-de-vida-de-um-documento-governado)
- [3. Requisição autenticada: middleware e escopo de tenant](#3-requisição-autenticada-middleware-e-escopo-de-tenant)
- [4. Processamento assíncrono (filas)](#4-processamento-assíncrono-filas)
- [5. Validação pública por QR](#5-validação-pública-por-qr)

> **Export em imagem** (para apresentação/PDF): [`1-topologia`](../assets/architecture/sgs-fluxo-1-topologia.svg) ·
> [`2-ciclo-documento`](../assets/architecture/sgs-fluxo-2-ciclo-documento.svg) ·
> [`3-request-tenant`](../assets/architecture/sgs-fluxo-3-request-tenant.svg) ·
> [`4-filas`](../assets/architecture/sgs-fluxo-4-filas.svg) ·
> [`5-validacao-qr`](../assets/architecture/sgs-fluxo-5-validacao-qr.svg)
>
> Os SVGs são **gerados a partir do Mermaid abaixo** (a fonte de verdade). Para regerar após
> editar um diagrama, veja [Como regerar os SVGs](#como-regerar-os-svgs).

---

## 1. Topologia macro

```mermaid
flowchart LR
    USER[Usuário autenticado]
    EXT[Qualquer pessoa<br/>com o QR/link]

    subgraph EDGE[Acesso]
        FE[Frontend<br/>Next.js 16 · Vercel]
        PUB[Rotas públicas<br/>/validar/:code · /assinar/:token]
    end

    subgraph APP[Backend Web · NestJS 11 · Coolify/Vultr]
        API[API REST<br/>api.sgsseguranca.com.br]
        WS[WebSocket<br/>notificações]
    end

    subgraph ASYNC[Worker · processo separado]
        WORKER[node dist/worker.js<br/>2ª VPS]
    end

    subgraph DATA[Dados]
        PG[(Neon PostgreSQL<br/>TypeORM + RLS)]
        REDIS[(Redis · Upstash<br/>auth · cache · queue)]
        B2[Backblaze B2<br/>PDFs, anexos, vídeos]
    end

    subgraph EXTINT[Integrações externas]
        LLM[OpenAI / NVIDIA<br/>Sophie]
        MAIL[Resend / SMTP]
        AV[ClamAV<br/>antivírus]
        OBS[Sentry · OTel]
    end

    USER --> FE --> API
    EXT --> PUB --> API
    FE -. tempo real .-> WS

    API --> PG
    API --> B2
    API --> REDIS
    API --> LLM
    API --> AV
    API --> OBS

    REDIS -- BullMQ --> WORKER
    WORKER --> PG
    WORKER --> B2
    WORKER --> MAIL
    WORKER --> OBS
```

**Deploy — atenção:** nenhum dos dois é automático hoje.

| Componente | Onde | Como sobe |
|---|---|---|
| Frontend | Vercel | `vercel --prod` **manual** (sem integração git) |
| Backend Web + Worker | Coolify/Vultr | Webhook não confiável — confirmar `deployments[0].commit` via API |
| Migrations | Neon | `npm run migration:run` **manual**, nunca no boot |

---

## 2. Ciclo de vida de um documento governado

O coração do SGS. Vale para APR, PT, DDS, DID, ARR, RDO, Checklist, Auditoria, CAT e NC —
muda o nome dos estados, não a espinha.

```mermaid
flowchart TD
    START([Usuário cria o documento]) --> DRAFT[Rascunho/Pendente<br/>editável]
    DRAFT --> VALID{Regras de<br/>negócio OK?}
    VALID -- não --> DRAFT
    VALID -- sim --> APPROVAL[Fluxo de aprovação<br/>sequencial por papel]

    APPROVAL --> REJ{Decisão}
    REJ -- reprovado<br/>motivo ≥10 chars --> CANCEL[Cancelada<br/>terminal]
    REJ -- aprovado --> APPROVED[Aprovada]

    APPROVED --> SIGN[Assinaturas<br/>hmac · drawn · upload · acknowledgement]
    SIGN --> PDF[Geração do PDF final]

    PDF --> SCAN{ClamAV<br/>varredura}
    SCAN -- infectado/indisponível --> BLOCK[Bloqueado<br/>fail-closed]
    SCAN -- limpo --> STORE[Upload B2<br/>pdf_file_key]

    STORE --> REGISTRY[(document_registry<br/>document_code + file_hash SHA-256)]
    REGISTRY --> LOCK[Documento travado<br/>delete bloqueado]
    LOCK --> QRCODE[QR + token HMAC<br/>impressos no PDF]
    QRCODE --> DONE([Validável publicamente])

    LOCK -.->|nova versão| DRAFT
```

**Travas que valem citar em auditoria:**

- **Fail-closed no antivírus** — se o ClamAV não responde, o anexo **não** entra. Não existe "passa mesmo assim".
- **Delete bloqueado após PDF final** — `remove()` lança `BadRequestException` quando existe `pdf_file_key`. Documento emitido não some.
- **Soft delete, nunca hard delete** — `deleted_at`; o registro fica para trilha.
- **Hash amarrado** — o `file_hash` (SHA-256) e o `document_code` vão pro registry; o QR aponta pro mesmo código.

---

## 3. Requisição autenticada: middleware e escopo de tenant

```mermaid
flowchart TD
    REQ([Request]) --> HELMET[Compression · Helmet · Cookie-parser]
    HELMET --> CTX[RequestContext<br/>requestId · IP · UA]
    CTX --> CSRF{CSRF válido?<br/>produção}
    CSRF -- não --> R403[403]
    CSRF -- sim --> TENANT[TenantMiddleware<br/>lê header x-company-id]

    TENANT --> ALS[AsyncLocalStorage<br/>contexto do tenant]
    ALS --> CLAMP[Pagination clamp]
    CLAMP --> IPALLOW{Rota /admin?}
    IPALLOW -- sim --> ALLOWLIST{IP na allowlist?}
    ALLOWLIST -- não --> R403
    ALLOWLIST -- sim --> GUARDS
    IPALLOW -- não --> GUARDS

    GUARDS[JwtAuthGuard → TenantGuard<br/>→ RolesGuard → PermissionsGuard]
    GUARDS --> JWT{JWT ok?<br/>não revogado?}
    JWT -- não --> R401[401]
    JWT -- sim --> RBAC{Permissão<br/>granular?}
    RBAC -- não --> R403
    RBAC -- sim --> SVC[Service]

    SVC --> RLSSET[SET LOCAL<br/>app.current_company_id]
    RLSSET --> DB[(PostgreSQL<br/>RLS filtra por tenant)]
    DB --> AUDIT[Audit + Security interceptors]
    AUDIT --> RESP([Response])
```

**Duas camadas independentes de isolamento** — a aplicação filtra por `company_id` **e** o
Postgres aplica RLS via `SET LOCAL app.current_company_id`. Uma falha na aplicação não vaza
dados de outro tenant: o banco ainda barra.

**RLS é fail-closed:** sem contexto de tenant, a query retorna **zero linhas** (não "todas").
Por isso jobs/crons cross-tenant precisam de `tenantService.run({ isSuperAdmin: true })` —
sem isso, rodam em silêncio sobre nada.

> `DATABASE_URL` **nunca** pode usar endpoint `-pooler` do Neon: quebra o `SET LOCAL` e,
> com ele, a RLS. Só `DATABASE_MIGRATION_URL` pode.

---

## 4. Processamento assíncrono (filas)

```mermaid
flowchart LR
    API[Backend Web] -- enfileira --> REDIS[(Redis · BullMQ)]
    REDIS --> WORKER[Worker · 2ª VPS]

    subgraph FILAS[13 filas]
        direction TB
        Q1[mail → mail-dlq]
        Q2[pdf-generation → pdf-generation-dlq]
        Q3[document-import → document-import-dlq]
        Q4[expiry-notifications]
        Q5[sla-escalation]
        Q6[document-retention]
        Q7[tenant-backup]
        Q8[dashboard-revalidate]
        Q9[business-metrics-refresh]
        Q10[ai-recovery]
    end

    WORKER --- FILAS
    WORKER --> PG[(Neon)]
    WORKER --> B2[B2 · principal + DR]
    WORKER --> MAIL[Resend/SMTP]
    WORKER -- heartbeat --> REDIS
```

As três filas de **DLQ** (`mail-dlq`, `pdf-generation-dlq`, `document-import-dlq`) recebem o
que estourou retry — é onde olhar quando "o e-mail não chegou" ou "o PDF não gerou".
Bull Board em `/admin/queues` (Basic Auth).

---

## 5. Validação pública por QR

Sem login. É o que um fiscal/auditor faz em campo apontando a câmera.

```mermaid
sequenceDiagram
    autonumber
    participant P as Pessoa com o QR
    participant FE as /validar/:code
    participant API as Backend
    participant REG as document_registry
    participant B2 as Backblaze B2

    P->>FE: escaneia QR do PDF
    FE->>API: GET /validation/:code?token=HMAC
    API->>API: valida token HMAC<br/>(assinado, com escopo)
    alt token inválido/expirado
        API-->>FE: 403
    else token ok
        API->>REG: busca por document_code
        alt não encontrado
            API-->>FE: valid=false
        else encontrado
            REG-->>API: file_hash · status · metadados
            API->>B2: confere artefato
            API-->>FE: valid=true + dados mínimos
            FE-->>P: documento autêntico<br/>emissor · data · hash
        end
    end
```

O payload público é **mínimo por design** (LGPD): confirma autenticidade sem expor o conteúdo
do documento nem PII além do necessário.

---

## Onde aprofundar

| Dúvida | Documento |
|---|---|
| Estados e transições de cada entidade | [`../state-machines.md`](../state-machines.md) |
| Tabelas, colunas e relacionamentos | [`../database-schema.md`](../database-schema.md) · [`../diagrama-banco-mermaid.md`](../diagrama-banco-mermaid.md) |
| Endpoints REST | [`../api-reference.md`](../api-reference.md) |
| Onde mexer no código | [`../consulta-rapida/onde-alterar-o-que.md`](../consulta-rapida/onde-alterar-o-que.md) |
| Deploy backend/worker | [`../deploy/coolify-vultr-backend-web-worker.md`](../deploy/coolify-vultr-backend-web-worker.md) |
| Backup e restore | [`../consulta-rapida/disaster-recovery-e-backup.md`](../consulta-rapida/disaster-recovery-e-backup.md) |

## Como regerar os SVGs

Os SVGs em `docs/assets/architecture/sgs-fluxo-*.svg` são gerados a partir dos blocos Mermaid
deste arquivo. Depois de editar um diagrama, regere para não deixar imagem e fonte
dessincronizadas.

```bash
# 1. extrair os blocos mermaid deste md para arquivos .mmd
node -e "
const fs=require('fs');
const md=fs.readFileSync('docs/architecture/SGS-FLUXOGRAMA-COMPLETO.md','utf8');
const blocks=[...md.matchAll(/\`\`\`mermaid\n([\s\S]*?)\`\`\`/g)].map(m=>m[1]);
const names=['1-topologia','2-ciclo-documento','3-request-tenant','4-filas','5-validacao-qr'];
blocks.forEach((b,i)=>fs.writeFileSync('/tmp/d'+names[i]+'.mmd',b));
"

# 2. gerar os SVGs (reusa o Chromium do Puppeteer, não baixa outro)
#    puppeteer-config.json: {"executablePath":"<caminho do chrome>","args":["--no-sandbox"]}
for n in 1-topologia 2-ciclo-documento 3-request-tenant 4-filas 5-validacao-qr; do
  npx -y @mermaid-js/mermaid-cli@11 \
    -i "/tmp/d$n.mmd" \
    -o "docs/assets/architecture/sgs-fluxo-$n.svg" \
    -p puppeteer-config.json -b white
done
```

## Fontes de verdade

Diagramas conferidos contra o código, não contra documentação anterior:

- `backend/src/app.module.ts` · `worker.module.ts` · `main.ts`
- `backend/src/infra/config/modules.config.ts`
- `backend/src/shared/tenant/` · `shared/guards/` · `shared/security/file-inspection.service.ts`
- `backend/src/modules/document-registry/`
- Filas: `grep -r "registerQueue" backend/src`

Correções feitas nesta revisão (a documentação anterior divergia do código):

- **Google Calendar não é integração ativa** — o módulo `calendar` agrega eventos das próprias
  entidades no próprio banco, sem chamar API do Google. O diagrama anterior mostrava
  `MODULES --> GCAL` como fluxo em uso.
- **13 filas BullMQ**, não 6 — faltavam `tenant-backup`, `dashboard-revalidate`,
  `business-metrics-refresh`, `ai-recovery` e as 3 DLQs.
- **ClamAV** não aparecia no diagrama, apesar de bloquear todo upload (fail-closed).
- O fluxograma anterior era um stub apontando para um SVG por caminho **absoluto**
  (`C:/Users/User/...`), que quebrava para qualquer outra pessoa.
