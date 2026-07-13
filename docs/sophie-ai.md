# Sophie AI — Architecture Reference

> Sophie = Safety Operations & Process Hybrid Intelligence Engine.
> Assistente de IA especializado em SST integrado ao SGS.

---

## High-Level Architecture

```
HTTP Request
  → Guards (FeatureAiGuard, AiConsentGuard, JwtAuthGuard, TenantGuard, RolesGuard)
    → Controllers (AiController | SstAgentController | SophieController)
      → SophieFacadeService
        → AiService (structured JSON generation for insights, APR, PT, DDS, checklists)
        → SstAgentService (conversational agent with tool-calling loop)
        → SophieEngineService (local rule-based analysis from knowledge base)
```

**2 módulos NestJS:**
| Módulo | Path | Propósito |
|--------|------|-----------|
| `AiModule` | `backend/src/modules/ai/` | Integração LLM (NVIDIA NIM/OpenAI), agente SST, facade e análises |
| `SophieModule` | `backend/src/modules/sophie/` | Local knowledge-based engine (rule matching) |

---

## Provider & Models

| Variável | Default | Descrição |
|----------|---------|-----------|
| `AI_PROVIDER` | `openai` | `nvidia` / `openai` / `stub` / `local` |
| `NVIDIA_API_KEY` | — | Obrigatório para `AI_PROVIDER=nvidia`; nunca usar chave OpenAI como fallback |
| `NVIDIA_MODEL` | `openai/gpt-oss-120b` | Modelo principal NVIDIA NIM |
| `NVIDIA_FALLBACK_MODEL` | — | Fallback NVIDIA opcional |
| `NVIDIA_REASONING_EFFORT` | `medium` | `low` / `medium` / `high` para GPT-OSS |
| `OPENAI_API_KEY` | — | Obrigatório apenas para `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o-2024-11-20` | Modelo principal OpenAI |
| `OPENAI_VISION_MODEL` | `gpt-4o-2024-11-20` | Modelo para imagem OpenAI |
| `OPENAI_FALLBACK_MODEL` | — | Fallback OpenAI opcional |
| `OPENAI_CHAT_COMPLETION_TIMEOUT_MS` | `30000` | Timeout |

**NVIDIA GPT-OSS 120B:** usa `https://integrate.api.nvidia.com/v1/chat/completions`, aceita ferramentas e reasoning effort, mas é somente texto. O SGS bloqueia análise de imagens nesse runtime para não transferir fotos a um modelo sem visão.

**Stub mode:** Quando a chave do provedor configurado não está disponível, Sophie retorna mensagens de "não configurada" e o endpoint `/ai/status` reporta `configured: false`.

---

## Request Flow

```
1. Build model candidates: [primary, fallback, recoveryCandidates]
2. For each candidate:
   - Build request (developer role prompt + user message)
   - Call requestOpenAiChatCompletionResponse()
     → Check circuit breaker (assertRequestAllowed)
     → Execute via IntegrationResilienceService (timeout + retry + CB)
     → POST para a URL do runtime já resolvido (OpenAI ou NVIDIA NIM)
     → Record success/failure
   - If 200 OK: return + log if fallback
   - If fails: try next model
3. Parse JSON response (strip markdown fences)
4. Return structured data
```

---

## Circuit Breaker

| Parâmetro | Valor |
|-----------|-------|
| Failure threshold | 3 em 60s (sliding) |
| Open cooldown | 30s |
| Flapping threshold | 3 trips em 1h |
| State TTL | 3600s |

**States:** `CLOSED → OPEN → HALF_OPEN → CLOSED`

**Quando OPEN:** retorna 503 e enfileira em `ai-recovery` queue para reprocessamento.

**Failures contáveis:** HTTP 500/502/503, GatewayTimeout, ECONNREFUSED, ECONNRESET, timeouts.

---

## PII Sanitization

Antes de enviar dados para OpenAI, o sanitizador (`openai-payload-boundary.util.ts`):
- Redacta CPF → `[CPF]`, CNPJ → `[CNPJ]`, email → `[EMAIL]`, phone → `[PHONE]`
- Substitui keys conhecidas (nome, cpf, email, telefone) por `[REDACTED_*]`
- Preserva chaves do protocolo OpenAI (model, role, name)

---

## 3-Layer Prompt Architecture

```
Layer 1: Identity (312 lines)
  - SOPHIE's role, hierarchy of controls, risk matrix, NR map, LGPD rules
  - Compartilhado entre todas as tasks

Layer 2: JSON Output Policy (12 lines)
  - Strict JSON-only: no markdown, no extra fields

Layer 3: Task Contract (9 tasks defined)
  - Task-specific mode, objective, directives, JSON schema, rules
```

Combinado por `getSophieSystemPrompt(task)` em `sophie.prompt-resolver.ts`.

---

## 9 Task Types

| Task | Propósito |
|------|-----------|
| `insights` | Insights executivos SST a partir de dados do tenant |
| `apr` | Analisar APR: selecionar riscos e EPIs |
| `pt` | Analisar PT: nível de risco e controles |
| `checklist` | Analisar checklist: gaps, NCs, ações |
| `dds` | Gerar conteúdo de DDS |
| `generic` | Geração genérica de JSON |
| `image-analysis` | Identificar riscos visíveis em fotos |
| `photographic-report-image` | Analisar uma foto para relatório |
| `photographic-report-summary` | Consolidar múltiplas fotos |

---

## SST Agent (Conversational)

**Service:** `sst-agent/sst-agent.service.ts` (1744 linhas)
**Controller:** `/ai/sst/chat`, `/ai/sst/analyze-image-risk`, `/ai/sst/history`

**Tool-calling loop:** até 5 iterações com OpenAI + execução de tools.

### 9 Tools (dados reais do sistema)

| Tool | Service chamado |
|------|----------------|
| `buscar_treinamentos_pendentes` | `TrainingsService.findExpirySummary()` |
| `buscar_exames_medicos_pendentes` | `MedicalExamsService.findExpirySummary()` |
| `buscar_estatisticas_cats` | `CatsService.getStatistics()` |
| `gerar_resumo_sst` | Combina treinamentos + exames |
| `buscar_nao_conformidades` | `NonConformitiesService.summarizeByStatus()` |
| `buscar_epis` | `EpisService.findCaExpirySummary()` |
| `buscar_riscos` | `AprsService.getRiskMatrix()` |
| `buscar_ordens_de_servico` | `ServiceOrdersService.findPaginated()` |
| `buscar_dds_recentes` | `DdsService.findPaginated()` |

Todas retornam apenas **agregados** (sem PII) + flag `sanitized_for_ai: true`.

---

## Human Review Detection

5 critérios que marcam resposta como `needs_human_review`:

| Critério | Gatilho |
|----------|---------|
| `SENSITIVE_KEYWORD` | Termos: "laudo técnico", "insalubridade", "periculosidade", "nexo causal", "óbito" |
| `LOW_CONFIDENCE_NORMATIVE` | Pergunta normativa + confiança LOW |
| `MISSING_NORMATIVE_SOURCES` | Pergunta normativa sem fontes NR/CLT |
| `CONCLUSIVE_QUESTION` | "Posso demitir", "sou obrigado", "preciso pagar" |
| `STUB_TOOL_USED` | Tool stub usada (atualmente vazio — todas reais) |

**Confidence heuristic:**
- 0 tools → LOW
- Todas stub → MEDIUM
- 2+ reais → HIGH
- senão → MEDIUM

---

## Local Knowledge Base (Sophie Module)

**KB files:** `sophie/kb/rules.json`, `synonyms.json`, `version.json`

### Rules (4 atuais)

| Rule | Keywords match | Outputs |
|------|---------------|---------|
| `soldagem` | atividade_contains | perigos, agentes, NRs, controles |
| `trabalho_em_altura` | atividade_contains | perigos, normas, EPIs |
| `eletricidade` | atividade_contains, processo_contains | perigos, agentes, controles |
| `espaco_confinado` | atividade_contains, ambiente_contains | perigos, normas, EPIs |

Cada rule tem: `when{ atividade_contains, setor_contains, maquina_contains, processo_contains, material_contains, ambiente_contains }` e `outputs{ perigos[], agentes[], normas[], controles{eliminacao, substituicao, engenharia, administrativas, epi} }`.

**Synonyms:** 13 mapeamentos (ex: "solda" → "soldagem", "nr 35" → "nr-35").

---

## Activity Profiles (Hardcoded)

7 perfis para sugestão inteligente:

| Perfil | Keywords | PT Checklist |
|--------|----------|-------------|
| `altura` | altura, telhado, escada, andaime | trabalho_altura_checklist |
| `eletricidade` | eletric, painel, subestação | trabalho_eletrico_checklist |
| `quente` | solda, oxicorte, esmerilh | trabalho_quente_checklist |
| `confinado` | confinado, tanque, silo | trabalho_espaco_confinado_checklist |
| `escavacao` | escav, vala, talude | trabalho_escavacao_checklist |
| `icamento` | icamento, guindaste | (nenhum) |
| `maquinas` | maquina, equipamento, prensa | (nenhum) |

---

## Domain Module Integration

Sophie importa **15 módulos** de domínio via AiModule:
APRs, PTs, EPIs, Risks, Trainings, Checklists, Users, MedicalExams, CATs, NonConformities, ServiceOrders, DDS, Activities, Tools, Machines, Consents

**Padrão de drafting:**
1. Fetch dados do domínio (scoped ao tenant)
2. Passa como JSON context no prompt OpenAI
3. OpenAI retorna IDs dos itens selecionados
4. Backend valida IDs contra o conjunto original
5. Persiste via service de domínio

---

## Rate Limiting

### SST Agent (por tenant)
| Limite | Valor |
|--------|-------|
| Requests/min | 10 |
| Requests/day | 200 |

Redis sliding window (`INCR` + TTL) com fallback em memória.

### Endpoint Throttles

| Endpoint | User RPM | Tenant RPM |
|----------|----------|------------|
| `/ai/insights` | 10 | 60 |
| `/ai/analyze-apr` | 5 | 30 |
| `/ai/generate-apr-draft` | 5 | 30 |
| `/ai/generate-dds` | 5 | 30 |
| `/ai/create-nonconformity` | 5 | 30 |
| `/ai/generate-monthly-report` | 3 | 10 |
| `/ai/sst/chat` | 10 | 60 |

---

## Audit Trail

Toda interação registrada em `ai_interactions`:
```sql
id, company_id, user_id, question, response (jsonb),
tools_called (jsonb), status (success/error/needs_review/rate_limited),
model, provider, latency_ms, token_usage_input, token_usage_output,
estimated_cost_usd, confidence, needs_human_review, human_review_reasons (jsonb),
created_at, deleted_at (GDPR soft delete)
```

Índices: `(company_id, created_at)`, `(company_id, user_id, created_at)`. RLS ativo.

---

## Feature Gating

| Guard | Condição |
|-------|----------|
| `FeatureAiGuard` | `FEATURE_AI_ENABLED=true` |
| `AiConsentGuard` | `ConsentsService.hasActiveConsent(userId, 'ai_processing')` |
| `JwtAuthGuard` | Autenticação JWT |
| `TenantGuard` | Multi-tenant |
| `RolesGuard` | `can_use_ai` permission |

---

## Phase 2 Automation

| Variável | Default | Descrição |
|----------|---------|-----------|
| `SOPHIE_AUTOMATION_PHASE2_ENABLED` | `false` | Auto-NC from checklists |
| `SOPHIE_PHASE2_CHECKLIST_NC_THRESHOLD` | `3` | Min NCs para auto-open |

Quando ativo: AI pode abrir NCs automaticamente. Risco crítico/alto exige aprovação humana.

---

## Queues (BullMQ)

| Queue | Uso |
|-------|-----|
| `pdf-generation` | Relatório mensal Sophie (PDF) |
| `ai-recovery` | Reprocessamento quando circuit breaker está aberto |

Ambas com fallback noop quando Redis indisponível.

---

## Endpoints

| Rota | Descrição |
|------|-----------|
| `POST /ai/insights` | Insights executivos |
| `POST /ai/analyze-apr` | Analisar APR |
| `POST /ai/analyze-pt` | Analisar PT |
| `GET /ai/analyze-checklist/:id` | Analisar checklist |
| `POST /ai/generate-dds` | Gerar DDS |
| `POST /ai/generate-checklist` | Gerar checklist |
| `POST /ai/generate-apr-draft` | Rascunho de APR |
| `POST /ai/apr/suggest-risk-items` | Sugerir riscos |
| `POST /ai/generate-pt-draft` | Rascunho de PT |
| `POST /ai/create-checklist` | Criar checklist |
| `POST /ai/create-dds` | Criar DDS |
| `POST /ai/create-nonconformity` | Abrir NC |
| `POST /ai/generate-monthly-report` | Relatório mensal |
| `POST /ai/sst/chat` | Chat com Sophie |
| `POST /ai/sst/analyze-image-risk` | Análise de imagem |
| `GET /ai/sst/history` | Histórico |
| `GET /ai/status` | Status da IA |
| `GET /sophie/version` | Versão do knowledge base |
| `POST /sophie/analyze` | Análise local (rule-based) |
