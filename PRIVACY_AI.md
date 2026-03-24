# Privacidade e IA — Dados Enviados ao Agente SOPHIE

> Documento de referência para conformidade com a **LGPD (Lei 13.709/2018)** e para
> Due Diligence técnica do processamento de dados via OpenAI.
>
> Atualizado em: 2026-03-24

---

## 1. Visão Geral

O agente SOPHIE utiliza a **API da OpenAI** (gpt-5-mini, servidor nos EUA) para gerar
respostas sobre indicadores de SST da empresa. Para isso, ferramentas (tools) buscam dados
no banco de dados e os enviam como contexto para o modelo de linguagem.

**Princípio fundamental:** apenas dados **estatísticos e agregados** são enviados.
Nenhum dado individual de trabalhador (nome, CPF, resultado de exame) trafega para a OpenAI.

---

## 2. Mapeamento de Ferramentas

### 2.1 `buscar_treinamentos_pendentes`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de treinamentos pendentes | Número | Necessário | Enviar |
| Contagem por NR/categoria | Agrupamento | Necessário | Enviar |
| Quantidade vencidos | Número | Necessário | Enviar |
| Quantidade a vencer em N dias | Número | Necessário | Enviar |
| Nome do treinamento | String | ~~Enviado anteriormente~~ | **Removido** |
| Nome do trabalhador | String | PII — nunca deve sair | **Nunca enviado** |

**Fonte:** `TrainingsService.findExpirySummary()` → retorna contagens agregadas.

---

### 2.2 `buscar_exames_medicos_pendentes`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de exames pendentes | Número | Necessário | Enviar |
| Contagem por tipo de exame | Agrupamento | Necessário | Enviar |
| Quantidade vencidos | Número | Necessário | Enviar |
| Quantidade a vencer em N dias | Número | Necessário | Enviar |
| Nome do trabalhador | String | **Art. 11 LGPD — dado de saúde** | **Nunca enviado** |
| CPF do trabalhador | String | **Art. 11 LGPD — dado de saúde** | **Nunca enviado** |
| Resultado individual (apto/inapto) | String | **Art. 11 LGPD — dado de saúde** | **Nunca enviado** |

**Fonte:** `MedicalExamsService.findExpirySummary()` → retorna contagens agregadas.

> ⚠️ **Dado sensível (Art. 11 LGPD):** resultado de exame médico é dado de saúde.
> A minimização é obrigatória mesmo com consentimento, pois o processamento deve ser
> proporcional à finalidade (gestão de vencimentos, não diagnóstico individual).

---

### 2.3 `buscar_estatisticas_cats`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de CATs | Número | Necessário | Enviar |
| Por tipo (típico, trajeto, doença) | Agrupamento | Necessário | Enviar |
| Por gravidade | Agrupamento | Necessário | Enviar |
| Evolução mensal (últimos 12 meses) | Série temporal | Necessário | Enviar |
| Nome do acidentado | String | PII | **Nunca enviado** |
| Descrição detalhada do acidente | String | Pode conter PII | **Nunca enviado** |
| `pessoas_envolvidas` (JSON) | Array | PII | **Nunca enviado** |

**Fonte:** `CatsService.getStatistics()` → retorna estatísticas sem identificação.

---

### 2.4 `buscar_nao_conformidades`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de NCs | Número | Necessário | Enviar |
| Por status (aberta, em andamento, etc.) | Agrupamento | Necessário | Enviar |
| Responsável pela NC | String | PII | **Nunca enviado** |
| Descrição detalhada | String | Pode conter PII | **Nunca enviado** |

**Fonte:** `NonConformitiesService.summarizeByStatus()` → retorna totais por status.

---

### 2.5 `buscar_epis`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de EPIs cadastrados | Número | Necessário | Enviar |
| Quantidade com CA vencido | Número | Necessário | Enviar |
| Quantidade com CA a vencer em N dias | Número | Necessário | Enviar |
| Usuário vinculado ao EPI | String | PII | **Nunca enviado** |

**Fonte:** `EpisService.findCaExpirySummary()` → retorna contagens de CA.

---

### 2.6 `buscar_riscos`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de riscos identificados | Número | Necessário | Enviar |
| Quantidade de riscos alto nível | Número | Necessário | Enviar |
| Matrix: categoria, probabilidade, severidade, count | Agrupamento | Necessário | Enviar |
| Nome do elaborador da APR | String | PII | **Nunca enviado** |
| Trabalhadores expostos | Array | PII | **Nunca enviado** |

**Fonte:** `AprsService.getRiskMatrix()` → retorna matrix agregada de APRs.

---

### 2.7 `buscar_ordens_de_servico`

| Campo enviado | Tipo | Classificação | Ação |
|---|---|---|---|
| Total de OS ativas | Número | Necessário | Enviar |
| Número da OS | String | Identificador técnico | Enviar |
| Título da OS | String | Necessário | Enviar |
| Data de emissão | Data | Necessário | Enviar |
| Nome do site/obra | String | Necessário | Enviar |
| `responsavel.nome` | String | **PII — nome da pessoa** | **Removido em 2026-03-24** |

**Fonte:** `ServiceOrdersService.findPaginated()` com mapeamento explícito que exclui `responsavel.nome`.

---

### 2.8 `gerar_resumo_sst`

Agrega resultados de `buscar_treinamentos_pendentes` e `buscar_exames_medicos_pendentes`.
Não acessa dados adicionais. Inclui links de navegação para os módulos do sistema.

---

## 3. Camadas de Proteção

```
[Banco de Dados]
     │ dados completos (nome, CPF, resultado)
     ▼
[Service.findExpirySummary() / getStatistics()]
     │ retorna apenas contagens agregadas
     ▼
[SstToolsExecutor.execute()]
     │ adiciona sanitized_for_ai: true em cada retorno
     ▼
[sanitizeForAi(toolResult.data)]           ← rede de segurança
     │ regex scan para CPF e e-mail
     │ substitui por [CPF] e [EMAIL]
     ▼
[JSON.stringify → messages[role='tool']]
     │ enviado para OpenAI API
     ▼
[OpenAI gpt-5-mini]
```

**Defesa primária:** minimização na camada de serviço (cada tool retorna só o necessário).
**Defesa secundária:** `sanitizeForAi()` faz regex scan em todo o resultado antes do envio.
**Auditoria:** `sanitized_for_ai: true` em cada retorno indica que o dado passou pela pipeline de sanitização.

---

## 4. O que NÃO é Enviado

- Nomes de trabalhadores
- CPFs
- E-mails
- Resultados individuais de exames (apto/inapto)
- Descrições narrativas de acidentes
- Dados de pessoas envolvidas em CATs
- Nomes de responsáveis por OS ou NCs

---

## 5. O que É Enviado

- Contagens e totais (ex: "12 treinamentos pendentes")
- Agrupamentos por categoria/tipo (ex: "NR-35: 3, NR-10: 2")
- Séries temporais agregadas (ex: CATs por mês nos últimos 12 meses)
- Metadados não-identificantes (títulos de OS, nomes de obras/setores)
- Links de navegação interna do sistema

---

## 6. Pergunta do Usuário

A pergunta digitada pelo usuário é enviada **integralmente** para a OpenAI como parte
da conversa. Se o usuário digitar um CPF ou nome na pergunta, esse dado será processado.

**Medida mitigadora:** o system prompt instrui a SOPHIE a **não solicitar** dados pessoais
e a **orientar o usuário** a consultar o módulo do sistema em vez de digitar dados
individuais na conversa.

**Medida futura recomendada:** implementar scan de PII na pergunta antes do envio
(usando a mesma função `sanitizeForAi()`).

---

## 7. Consentimento (LGPD)

- Campo `ai_processing_consent` na tabela `users` (default: `false`)
- `AiConsentGuard` bloqueia todos os endpoints de IA se `consent = false`
- Modal de consentimento exibido no primeiro acesso ao SOPHIE
- Toggle de revogação disponível em **Configurações → Privacidade**
- Endpoint: `PATCH /users/me/ai-consent { consent: boolean }`

---

## 8. Operador de Dados (OpenAI)

| Atributo | Valor |
|---|---|
| Empresa | OpenAI, L.L.C. |
| País | Estados Unidos |
| Finalidade | Geração de respostas via LLM |
| Base legal | Consentimento explícito (Art. 7º, I — LGPD) |
| DPA disponível | platform.openai.com/terms (Enterprise DPA) |
| Retenção pelo operador | Conforme política de privacidade da OpenAI |

> ⚠️ **Ação pendente:** assinar o DPA com a OpenAI antes de processar dados reais
> em produção. Verificar se o plano atual inclui opt-out do uso para treinamento de modelos.

---

## 9. Histórico de Alterações

| Data | Alteração |
|---|---|
| 2026-03-24 | Criação deste documento |
| 2026-03-24 | Removido `responsavel.nome` de `buscar_ordens_de_servico` |
| 2026-03-24 | Adicionado `sanitizeForAi()` como rede de segurança no service loop |
| 2026-03-24 | Adicionado `sanitized_for_ai: true` em todos os retornos de ferramenta |
| 2026-03-24 | Adicionada seção 14 (Privacidade) no system prompt da SOPHIE |
| 2026-03-24 | Implementado `AiConsentGuard` + campo `ai_processing_consent` |
