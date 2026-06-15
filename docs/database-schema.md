# Database Schema — SGS Segurança

> Schema completo do banco PostgreSQL. Todas as tabelas usam UUID como primary key.
> Herdam `created_at`, `updated_at`, `deleted_at` quando extends `BaseAuditEntity`.

---

## Domínio: IDENTITY

### `users`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| nome | varchar | |
| cpf | varchar | Nullable |
| cpf_hash | varchar(64) | HMAC para lookup |
| cpf_ciphertext | text | AES-256-GCM |
| email | varchar | Nullable |
| funcao | varchar | Nullable |
| password | varchar | Argon2id hash, select: false |
| auth_user_id | uuid | Nullable, select: false |
| identity_type | varchar(32) | |
| access_status | varchar(32) | |
| signature_pin_hash, _salt | string | select: false |
| status | boolean | Default true |
| ai_processing_consent | boolean | Default false |
| module_access_keys | jsonb | |
| company_id | varchar | FK → companies |
| site_id | varchar | Nullable |
| profile_id | varchar | FK → profiles |
| created_at, updated_at, deletedAt | timestamp | |

**Índices:** `company_id`, `site_id`, `profile_id`

### `profiles`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| nome | varchar | |
| permissoes | jsonb | |
| status | boolean | Default true |
| created_at, updated_at | timestamp | |

**Relacionamentos:** `users.profile_id → profiles.id`

### `user_sites`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK |
| user_id | uuid | FK → users |
| site_id | uuid | FK → sites |
| created_at | timestamp | |

**Unique:** `(user_id, site_id)`

### `user_sessions`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK |
| company_id | uuid | FK |
| ip, device, country, state, city | varchar | Geolocalização |
| token_hash | varchar | Nullable |
| is_active | boolean | Default true |
| expires_at | timestamptz | |
| revoked_at | timestamptz | Nullable |
| last_active | timestamp | |

**Índice:** `(user_id, is_active, expires_at)`

### `user_mfa_credentials`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| user_id, company_id | uuid | |
| type | varchar(32) | Default 'totp' |
| secret_ciphertext, _iv, _tag, _version | text | TOTP secret |
| is_enabled | boolean | |
| verified_at, disabled_at, last_used_at | timestamptz | |

**Unique:** `(user_id, type)`

### `user_mfa_recovery_codes`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| credential_id | uuid | FK |
| user_id, company_id | uuid | |
| code_hash | text | |
| consumed_at | timestamptz | |

---

## Domínio: TENANT

### `companies`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| razao_social | varchar | |
| cnpj | varchar | Unique |
| endereco | text | |
| responsavel | varchar | |
| email_contato | text | |
| logo_url, logo_storage_key, logo_sha256 | text | Nullable |
| status | boolean | Default true |
| account_status | varchar(32) | active/suspended/trial |
| trial_started_at, trial_ends_at, activated_at, suspended_at | timestamptz | |
| suspension_reason | text | |
| pt_approval_rules | jsonb | |
| alert_settings | jsonb | |
| created_at, updated_at, deleted_at | timestamp | |

**Relacionamentos:** `users → companies`, `sites → companies`

### `sites`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| nome, local, endereco, cidade, estado | varchar | |
| status | boolean | Default true |
| company_id | string | FK |
| created_at, updated_at, deleted_at | timestamp | Herdado |

**Índice:** `company_id`

### `tenant_document_policies`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK, unique |
| retention_days_apr, _dds, _pts | integer | |
| created_at, updated_at | timestamp | |

### `tenant_onboarding_invites`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| token_hash | varchar(64) | Unique |
| email | varchar(255) | |
| intended_company_name | varchar(255) | |
| expires_at, used_at, revoked_at | timestamptz | |
| metadata | jsonb | |

---

## Domínio: OPERATIONS

### `aprs`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| numero, titulo | varchar | |
| descricao | text | |
| tipo_atividade, frente_trabalho, area_risco, turno | varchar | Nullable |
| local_execucao_detalhado | varchar(200) | |
| responsavel_tecnico_nome, _registro | varchar | |
| data_inicio, data_fim | date | |
| status | varchar | Default 'PENDENTE' |
| is_modelo, is_modelo_padrao | boolean | |
| itens_risco | jsonb | |
| probability, severity, exposure, initial_risk | int | |
| residual_risk | varchar | |
| company_id, site_id, elaborador_id | uuid | FK |
| workflow completo de aprovação (+10 cols) | | aprovado/reprovado/auditado |
| pdf_file_key, pdf_folder_path, pdf_original_name | text | |
| final_pdf_hash_sha256 | varchar(64) | |
| verification_code | varchar(24) | |
| versao | int | Default 1 |
| parent_apr_id | varchar | Nullable |
| classificacao_resumo | jsonb | |
| workflowConfigId | uuid | |
| rulesSnapshot | jsonb | |
| complianceScore | int | |
| created_at, updated_at, deleted_at | timestamp | Herdado |

**Índices:** `company_id`, `site_id`, `elaborador_id`, `parent_apr_id`, `aprovado_por_id`, `reprovado_por_id`

**Relacionamentos M2M:** `activities`, `risks`, `epis`, `tools`, `machines`, `participants`
**Relacionamentos O2M:** `logs`, `approval_steps`, `risk_items`

### `apr_risk_items`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| apr_id | uuid | FK |
| atividade, etapa, agente_ambiental, condicao_perigosa, fonte_circunstancia, lesao | text | |
| probabilidade, severidade, score_risco | int | |
| categoria_risco, prioridade | varchar(40) | |
| medidas_prevencao, epc, epi | text | |
| permissao_trabalho, normas_relacionadas | varchar | |
| hierarquia_controle | varchar(30) | |
| residual_probabilidade, _severidade, _score | int | |
| residual_categoria | varchar(40) | |
| responsavel, prazo, status_acao | text/date/varchar | |
| ordem | int | Default 0 |

### `apr_approval_steps`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| apr_id | uuid | FK |
| level_order, title, approver_role, status, approver_user_id | | |
| decision_reason | text | |
| decided_ip | inet | |
| decided_at | timestamp | |

### `apr_risk_evidences`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| apr_id, apr_risk_item_id | uuid | FK |
| uploaded_by_id | varchar | |
| file_key, original_name | text | |
| mime_type, file_size_bytes, hash_sha256 | |
| watermarked_file_key, _hash, _text | |
| captured_at, latitude, longitude, accuracy_m, device_id, ip_address, exif_datetime | GPS/metadata |
| integrity_flags | jsonb | |

### `apr_workflow_configs` / `apr_workflow_steps`
Configurações de workflow por tenant/site/activityType.
Steps com roleName, stepOrder, isRequired, timeoutHours.

### `apr_logs`
| Coluna | Tipo |
|--------|------|
| apr_id, usuario_id, acao, metadata(jsonb), data_hora |

### `apr_metrics` / `apr_feature_flags` / `apr_rules`
Métricas de performance, feature flags por tenant, regras de compliance.

### `pts`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| numero, titulo, descricao | varchar/text | |
| data_hora_inicio, data_hora_fim | timestamp | |
| status | varchar | Default 'PENDENTE' |
| company_id, site_id, apr_id, responsavel_id | uuid | FK |
| trabalho_altura, espaco_confinado, trabalho_quente, eletricidade, escavacao | boolean | |
| probability, severity, exposure, initial_risk, residual_risk | int/varchar | |
| *checklists específicos* | jsonb | 6 tipos de checklist |
| approval workflow cols | | aprovado/reprovado/auditado |
| pdf cols | text | |

**Relacionamentos:** M2M `executantes` (users)

### `dds`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| tema, conteudo, data | text/date | |
| is_modelo | boolean | |
| company_id, site_id, facilitador_id | uuid | FK |
| audit cols | | auditado_por, resultado, notas |
| photo_reuse_justification | text | |
| pdf cols | text | |
| emitted cols | | user_id, ip, user_agent |
| status | varchar | Default 'RASCUNHO' |
| version | int | @VersionColumn |

**Relacionamentos:** M2M `participants` (via `dds_participants`)

### `dds_signature_invites`
| Coluna | Tipo |
|--------|------|
| company_id, dds_id, participant_user_id, created_by_user_id | uuid |
| signed_signature_id | uuid |
| token_hash | varchar(64), unique |
| dds_version, expires_at, revoked_at, used_at, last_viewed_at | |
| signed_ip_hash, signed_user_agent_hash | |

### `dds_approval_records`
| Coluna | Tipo | Notas |
|--------|------|-------|
| company_id, dds_id, cycle, level_order, title, approver_role | |
| action, actor_user_id, actor_signature_id, decision_reason | |
| event_hash | varchar(64), unique | Hash chain |
| previous_event_hash | varchar(64) | |

### `arrs` / `dids` / `rdos`
Estrutura similar: `company_id`, `site_id`, `responsavel_id`, `status`, `pdf_*`, `created_at/updated_at/deleted_at`.

### `epis` / `epi_assignments`
EPI: `nome`, `ca`, `validade_ca`, `status`, `company_id`
EpiAssignment: `epi_id`, `user_id`, `site_id`, `quantidade`, `status` (entregue/devolvido), `entregue_em/devolvido_em`

### `activities` / `tools` / `machines`
Tabelas de catálogo: `nome`, `status`, `company_id`

### `trainings`
| Coluna | Tipo |
|--------|------|
| nome, nr_codigo, carga_horaria, obrigatorio_para_funcao, bloqueia_operacao_quando_vencido | |
| data_conclusao, data_vencimento | date |
| user_id, company_id | FK |

### `medical_exams`
| Coluna | Tipo |
|--------|------|
| tipo_exame, resultado, data_realizacao, data_vencimento | |
| medico_responsavel, crm_medico | |
| user_id, company_id | FK |

### `service_orders`
| Coluna | Tipo |
|--------|------|
| numero, titulo, descricao_atividades, riscos_identificados(jsonb), epis_necessarios(jsonb) | |
| status (ativo/concluído/cancelado), datas | |
| company_id, responsavel_id, site_id | FK |

---

## Domínio: COMPLIANCE

### `audits`
| Coluna | Tipo |
|--------|------|
| titulo, data_auditoria, tipo_auditoria | |
| company_id, site_id, auditor_id | FK |
| objetivo, escopo, referencias(jsonb), metodologia | |
| caracterizacao, documentos_avaliados, resultados_* (jsonb) | |
| avaliacao_riscos, plano_acao(jsonb), conclusao | |
| pdf_* | text |

### `nonconformities`
| Coluna | Tipo |
|--------|------|
| codigo_nc, tipo, data_identificacao | |
| local_setor_area, atividade_envolvida, responsavel_area | |
| classificacao(jsonb), descricao, evidencia_observada | |
| condicao_insegura, ato_inseguro | |
| requisito_nr, _item, _procedimento, _politica | |
| risco_perigo, _associado, _consequencias(jsonb), _nivel | |
| causa(jsonb), causa_outro | |
| acao_imediata_* (descricao, data, responsavel, status) | |
| acao_definitiva_* (descricao, prazo, responsavel, recursos) | |
| acao_preventiva_* (medidas, treinamento, revisao, melhoria) | |
| verificacao_* (resultado, evidencias, data, responsavel) | |
| status (aberta/em_andamento/concluida/fechada) | |
| pdf_* | text |

### `checklists`
Similar a audits: `titulo`, `itens(jsonb)`, `status`, `is_modelo`, `template_id`, `categoria`, `periodicidade`, `nivel_risco_padrao`
Company_id, site_id, inspetor_id FK

### `corrective_actions`
| Coluna | Tipo |
|--------|------|
| title, description, source_type/source_id | |
| company_id, site_id, responsible_user_id, responsible_name | |
| due_date, status (open/in_progress/resolved/closed), priority | |
| sla_days, evidence_notes, evidence_files(jsonb) | |
| escalation_level, closed_at | |

### `contracts` / `document_registry`
Contratos e documentos governados com controle de versão.

---

## Domínio: PRIVACY

### `consent_versions`
| Coluna | Tipo |
|--------|------|
| type (privacy/terms/cookies/ai_processing/marketing) | varchar(64) |
| version_label, body_md, body_hash, summary | |
| effective_at, retired_at | timestamptz |

### `user_consents`
| Coluna | Tipo |
|--------|------|
| user_id, company_id, type, version_id | |
| accepted_at, accepted_ip, accepted_user_agent | |
| revoked_at, revoked_ip, revoked_user_agent | |
| migrated_from_legacy | boolean |

### `privacy_requests` / `privacy_request_events`
Requisições LGPD com tipo (access/deletion/correction/portability), status, eventos de auditoria.

---

## Domínio: COMMUNICATION

### `signatures`
| Coluna | Tipo |
|--------|------|
| company_id, user_id | FK |
| document_id, document_type (apr/pt/dds/checklist/cat/nonconformity/audit/rdo) | |
| type (digital/upload/facial) | |
| signature_data, integrity_payload | |
| canonical_payload_hash, signature_evidence_hash, document_binding_hash | |
| timestamp_token, timestamp_authority | |

---

## Infraestrutura

### `audit_logs`
Logs de auditoria de todas as ações críticas (tabela grande — particionar por `created_at`)

### `mail_logs`
Logs de envio de email (tabela grande — particionar por `created_at`)

### `ai_interactions`
Interações com a IA Sophie (tabela grande — particionar, TTL 1 ano)

### `pdf_integrity_records`
| Coluna | Tipo |
|--------|------|
| hash | varchar(64), unique |
| original_name, signed_by_user_id, company_id | |

### `document_download_grants`
Grants temporários para download de documentos.

### `public_validation_grants`
Grants para validação pública de documentos.
