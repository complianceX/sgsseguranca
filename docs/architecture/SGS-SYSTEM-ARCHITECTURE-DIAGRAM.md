# Diagrama de Arquitetura do SGS

Visão executiva da arquitetura atual do SGS, baseada na estrutura real do monorepo, no `render.yaml` e nos ADRs de multi-tenancy e backend.

```mermaid
%%{init: {
  "theme": "base",
  "flowchart": { "curve": "basis", "nodeSpacing": 28, "rankSpacing": 34 },
  "themeVariables": {
    "primaryColor": "#0b63ce",
    "primaryTextColor": "#08233f",
    "primaryBorderColor": "#084b9a",
    "secondaryColor": "#eff6ff",
    "secondaryTextColor": "#08233f",
    "secondaryBorderColor": "#93c5fd",
    "tertiaryColor": "#ecfdf5",
    "tertiaryTextColor": "#14532d",
    "tertiaryBorderColor": "#34d399",
    "lineColor": "#2563eb",
    "fontFamily": "Arial"
  }
}}%%
flowchart LR
    USER[Usuario autenticado]
    EXT[Consumidor externo]

    subgraph EDGE[Camada de acesso]
        FE[Frontend<br/>Next.js 15<br/>Vercel]
        PUBLIC[Rotas publicas de validacao<br/>/validar e links publicos]
    end

    subgraph APP[Aplicacao principal]
        API[Backend Web<br/>NestJS 11<br/>Render]
        WS[Gateway de notificacoes<br/>WebSocket / Socket.IO]
        AUTH[Auth + RBAC + CSRF<br/>Consentimento IA]
        TENANT[TenantMiddleware + AsyncLocalStorage<br/>TenantDbContextService]
        MODULES[Modulos SST<br/>APR, ARR, DDS, PT, RDO, CAT,<br/>Treinamentos, Exames, Trabalhadores]
        QUEUE[Produtores de fila<br/>BullMQ]
    end

    subgraph ASYNC[Processamento assincrono]
        WORKER[Backend Worker<br/>NestJS worker<br/>Render]
        JOBS[Jobs pesados<br/>PDF, importacao documental,<br/>mail, revalidacao, DR]
    end

    subgraph DATA[Dados e persistencia]
        PG[(Supabase PostgreSQL<br/>TypeORM + RLS)]
        REDIS[(Redis<br/>cache + rate limit + BullMQ)]
        R2[Cloudflare R2 / S3-compatible<br/>PDFs, anexos, videos]
        REG[Registry documental<br/>integridade e governanca]
    end

    subgraph EXTINT[Integracoes externas]
        OPENAI[OpenAI<br/>Sophie]
        GCAL[Google Calendar API]
        MAIL[Provedor de email]
        SENTRY[Sentry / Observabilidade]
    end

    subgraph GUARDS[Regras nao negociaveis]
        LGPD[LGPD + sanitizacao de PII]
        RLS[RLS + current_company()<br/>is_super_admin()]
        RL[Rate limiting<br/>IP + tenant + usuario]
    end

    USER --> FE
    EXT --> PUBLIC
    PUBLIC --> API

    FE --> API
    FE -. notificacoes .-> WS

    API --> AUTH
    API --> TENANT
    API --> MODULES
    API --> QUEUE
    API --> WS

    TENANT --> PG
    MODULES --> PG
    MODULES --> R2
    MODULES --> REG
    AUTH --> REDIS
    QUEUE --> REDIS
    REDIS --> WORKER
    WORKER --> JOBS
    JOBS --> PG
    JOBS --> R2
    JOBS --> REG
    WORKER --> REDIS

    MODULES --> OPENAI
    MODULES --> GCAL
    MODULES --> MAIL
    API --> SENTRY
    WORKER --> SENTRY
    FE --> SENTRY

    LGPD -. protege .-> OPENAI
    LGPD -. protege .-> R2
    RLS -. protege .-> PG
    RL -. protege .-> API
    RL -. protege .-> OPENAI
```

## Leitura rapida

- `Frontend`: shell autenticado, dashboards, formularios densos e fluxos documentais.
- `Backend Web`: autoridade de auth, RBAC, tenant scoping, regras de negocio e integracoes.
- `Worker`: concentra processamento assincrono e jobs pesados desacoplados da request HTTP.
- `Supabase PostgreSQL`: persistencia principal com RLS para defesa em profundidade multi-tenant.
- `Redis`: cache, coordenacao operacional, throttling e filas BullMQ.
- `Cloudflare R2`: storage governado dos artefatos oficiais.
- `OpenAI / Sophie`: sempre atras de consentimento e sanitizacao de PII.

## Notas arquiteturais criticas

- O isolamento multi-tenant nao depende apenas de filtro manual: o backend propaga contexto de tenant e o banco reforca com RLS.
- O frontend nao acessa banco, Redis ou storage diretamente; todo acesso passa pelo backend.
- Documentos oficiais e evidencias passam por governanca documental antes de serem expostos ou validados publicamente.
- Jobs pesados saem do caminho sincrono para preservar performance do web e reduzir timeout em operacoes documentais.
