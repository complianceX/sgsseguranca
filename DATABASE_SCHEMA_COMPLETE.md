# Complete Database Schema - SGS Segurança

**Generated:** April 2, 2026  
**Type:** PostgreSQL/TypeORM Schema with RLS (Row-Level Security)  
**Database:** Multi-tenant with Company-scoped isolation  
**Security Pattern:** RLS enforced on critical tables + RBAC via roles/permissions

---

## Table of Contents

1. [Core Multi-Tenant Structure](#core-multi-tenant-structure)
2. [Authentication & Authorization](#authentication--authorization)
3. [Health & Safety Core](#health--safety-core)
4. [Procedures & Documentation](#procedures--documentation)
5. [Risk Management](#risk-management)
6. [Operational Documents](#operational-documents)
7. [Auditing & Compliance](#auditing--compliance)
8. [Supporting Tables](#supporting-tables)
9. [Junction/Bridge Tables](#junctionbridge-tables)
10. [Indexes & Performance](#indexes--performance)
11. [RLS Policies](#rls-policies)
12. [Key Relationships](#key-relationships)

---

## Core Multi-Tenant Structure

### `companies` (Tenants)
```
┌─ id (UUID) - PRIMARY KEY
├─ razao_social (VARCHAR) - Legal name
├─ cnpj (VARCHAR) - UNIQUE - Tax ID
├─ endereco (TEXT) - Address
├─ responsavel (VARCHAR) - Responsible person
├─ email_contato (TEXT, nullable)
├─ logo_url (TEXT, nullable)
├─ status (BOOLEAN) - default: true
├─ pt_approval_rules (JSONB, nullable) - PT workflow rules
│  ├─ blockCriticalRiskWithoutEvidence: boolean
│  ├─ blockWorkerWithoutValidMedicalExam: boolean
│  ├─ blockWorkerWithExpiredBlockingTraining: boolean
│  └─ requireAtLeastOneExecutante: boolean
├─ alert_settings (JSONB, nullable) - Email/WhatsApp alert configuration
│  ├─ enabled: boolean
│  ├─ recipients: string[]
│  ├─ includeWhatsapp: boolean
│  ├─ lookaheadDays: number (default: 30)
│  ├─ includeComplianceSummary: boolean
│  ├─ deliveryHour: number (default: 8)
│  ├─ cadenceDays: number (default: 1)
│  └─ snoozeUntil: timestamp (nullable)
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable) - Soft delete
```

**Unique Constraints:**
- `cnpj` - UNIQUE

**Relationships:**
- ONE-TO-MANY → users
- ONE-TO-MANY → sites
- ONE-TO-MANY → machines
- ONE-TO-MANY → aprs
- ONE-TO-MANY → contracts
- ONE-TO-MANY → audits
- ONE-TO-MANY → checklists
- ONE-TO-MANY → nonconformities
- ONE-TO-MANY → trainings
- ONE-TO-MANY → pts
- ONE-TO-MANY → rdos
- ONE-TO-MANY → reports
- ONE-TO-MANY → service-orders
- ONE-TO-MANY → document-registry

---

### `sites` (Work Sites/Locations)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR) - Site name
├─ local (VARCHAR, nullable) - Location descriptor
├─ endereco (VARCHAR, nullable) - Full address
├─ cidade (VARCHAR, nullable) - City
├─ estado (VARCHAR, nullable) - State
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable) - Soft delete
```

**Relationships:**
- MANY-TO-ONE → companies
- ONE-TO-MANY → users
- ONE-TO-MANY → aprs
- ONE-TO-MANY → pts
- ONE-TO-MANY → rdos
- ONE-TO-MANY → audits
- ONE-TO-MANY → checklists
- ONE-TO-MANY → nonconformities
- ONE-TO-MANY → dds
- ONE-TO-MANY → corrective_actions

---

## Authentication & Authorization

### `users` (Employee/Worker Records)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR) - Full name
├─ cpf (VARCHAR, nullable) - UNIQUE - Personal tax number
├─ email (VARCHAR, nullable) - UNIQUE
├─ funcao (VARCHAR, nullable) - Job function
├─ password (VARCHAR, select: false, nullable) - Hashed password
├─ signature_pin_hash (VARCHAR, select: false, nullable) - PIN for digital signatures
├─ signature_pin_salt (VARCHAR, select: false, nullable) - PIN salt
├─ status (BOOLEAN) - default: true - Active flag
├─ ai_processing_consent (BOOLEAN) - default: false - LGPD consent for AI
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ profile_id (UUID) - FOREIGN KEY → profiles (Access control)
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable) - Soft delete
```

**Indexes:**
- `idx_users_email_unique` - UNIQUE on LOWER(email)
- `idx_users_company_status` - (company_id, status)
- `idx_users_company_created` - (company_id, created_at DESC)
- `idx_users_cpf` - (cpf)
- `idx_users_nome_trgm` - GIN trigram for fuzzy search
- `idx_users_cpf_trgm` - GIN trigram

**Relationships:**
- MANY-TO-ONE → companies
- MANY-TO-ONE → sites
- MANY-TO-ONE → profiles
- ONE-TO-MANY → trainings
- ONE-TO-MANY → medical_exams
- ONE-TO-MANY → aprs (elaborador)
- ONE-TO-MANY → pts (responsavel)
- ONE-TO-MANY → rdos (responsavel)
- ONE-TO-MANY → audits (auditor)
- ONE-TO-MANY → checklists (inspetor, auditado_por)
- ONE-TO-MANY → dds (facilitador, auditado_por)
- ONE-TO-MANY → user_sessions
- ONE-TO-MANY → user_roles

---

### `profiles` (Role/Permission Templates)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR) - Profile name (e.g., "Admin", "Safety Officer")
├─ permissoes (JSONB | simple-json) - List of permission identifiers
├─ status (BOOLEAN) - default: true
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ users (ONE-TO-MANY) → users via profile_id
```

---

### RBAC Tables (Role-Based Access Control)

#### `roles`
```
┌─ id (UUID) - PRIMARY KEY
├─ name (VARCHAR) - UNIQUE - Role name (e.g., "Admin", "TST", "Manager")
└─ description (TEXT, nullable)
```

**Predefined roles:**
- "Administrador da Empresa" / "ADMIN_EMPRESA"
- "Técnico de Segurança do Trabalho (TST)" / "TST"
- "Supervisor"
- "Worker"

#### `permissions`
```
┌─ id (UUID) - PRIMARY KEY
├─ name (VARCHAR) - UNIQUE - Permission identifier
└─ description (TEXT, nullable)
```

#### `user_roles` (Bridge table)
```
┌─ user_id (UUID) - PRIMARY KEY (composite)
├─ role_id (UUID) - PRIMARY KEY (composite)
├─ FOREIGN KEY (user_id) → users (CASCADE DELETE)
├─ FOREIGN KEY (role_id) → roles (CASCADE Delete)
└─ created_at (TIMESTAMP) - default: CURRENT_TIMESTAMP
```

**Constraints:**
- PK: (user_id, role_id)

#### `role_permissions` (Bridge table)
```
┌─ role_id (UUID) - PRIMARY KEY (composite)
├─ permission_id (UUID) - PRIMARY KEY (composite)
├─ FOREIGN KEY (role_id) → roles (CASCADE Delete)
├─ FOREIGN KEY (permission_id) → permissions (CASCADE Delete)
└─ created_at (TIMESTAMP) - default: CURRENT_TIMESTAMP
```

**Constraints:**
- PK: (role_id, permission_id)

---

### `user_sessions`
```
┌─ id (UUID) - PRIMARY KEY
├─ user_id (UUID) - FOREIGN KEY → users
├─ ip (VARCHAR) - Client IP address
├─ device (VARCHAR, nullable) - Device/User-Agent
├─ country (VARCHAR, nullable)
├─ state (VARCHAR, nullable)
├─ city (VARCHAR, nullable)
├─ token_hash (VARCHAR, nullable) - Hash of refresh/access token
├─ is_active (BOOLEAN) - default: true
├─ created_at (TIMESTAMP) - AUTO
└─ last_active (TIMESTAMP) - Auto-updated on each access
```

**Indexes:**
- `idx_sessions_user_active` - (user_id, is_active, expires_at)
- `idx_sessions_token_hash` - (token_hash) WHERE is_active = true

---

## Health & Safety Core

### `trainings` (Mandatory Certifications)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR) - Training name (e.g., "NR-35", "NR-10")
├─ nr_codigo (VARCHAR, nullable) - NR code
├─ carga_horaria (INT, nullable) - Duration in hours
├─ obrigatorio_para_funcao (BOOLEAN) - default: true
├─ bloqueia_operacao_quando_vencido (BOOLEAN) - Blocks PT if expired
├─ data_conclusao (TIMESTAMP) - Completion date
├─ data_vencimento (TIMESTAMP) - Expiration date
├─ certificado_url (VARCHAR, nullable) - Link to certificate
├─ user_id (UUID) - FOREIGN KEY → users
├─ company_id (UUID) - FOREIGN KEY → companies
├─ auditado_por_id (UUID, nullable) - FOREIGN KEY → users
├─ data_auditoria (TIMESTAMP, nullable) - Audit date
├─ resultado_auditoria (VARCHAR, nullable) - "Conforme", "Não Conforme", "Observação"
├─ notas_auditoria (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `IDX_trainings_company_created` - (company_id, created_at)

---

### `medical_exams`
```
┌─ id (UUID) - PRIMARY KEY
├─ tipo_exame (VARCHAR) - "admissional | periodico | retorno | demissional | mudanca_funcao"
├─ resultado (VARCHAR) - "apto | inapto | apto_com_restricoes"
├─ data_realizacao (DATE) - Exam date
├─ data_vencimento (DATE, nullable) - Next exam due date
├─ medico_responsavel (VARCHAR, nullable) - Doctor name
├─ crm_medico (VARCHAR, nullable) - Medical license
├─ observacoes (TEXT, nullable) - Notes
├─ user_id (UUID) - FOREIGN KEY → users
├─ company_id (UUID) - FOREIGN KEY → companies
├─ auditado_por_id (UUID, nullable) - FOREIGN KEY → users
├─ data_auditoria (TIMESTAMP, nullable)
├─ resultado_auditoria (VARCHAR, nullable)
├─ notas_auditoria (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `IDX_medical_exams_company_created` - (company_id, created_at)

---

### `epis` (Personal Protective Equipment)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR) - EPI name
├─ ca (VARCHAR, nullable) - Certificate of Approval (CA) number
├─ validade_ca (DATE, nullable) - CA expiration
├─ descricao (TEXT, nullable)
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `epi_assignments` (Worker EPI Delivery Records)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - FOREIGN KEY → companies
├─ epi_id (UUID) - FOREIGN KEY → epis
├─ user_id (UUID) - FOREIGN KEY → users (assigned to)
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ ca (VARCHAR, nullable) - EPI certificate
├─ validade_ca (DATE, nullable) - Certificate expiration
├─ quantidade (INT) - default: 1
├─ status (VARCHAR) - "entregue | devolvido | substituido"
├─ entregue_em (TIMESTAMP) - Delivery date/time
├─ devolvido_em (TIMESTAMP, nullable) - Return date/time
├─ motivo_devolucao (TEXT, nullable)
├─ observacoes (TEXT, nullable)
├─ assinatura_entrega (JSONB) - Digital signature on delivery
│  ├─ signer_user_id: string
│  ├─ signature_data: string (base64)
│  ├─ signature_type: string
│  ├─ signature_hash: string
│  └─ timestamp_authority: string
├─ assinatura_devolucao (JSONB, nullable) - Digital signature on return
├─ created_by_id (UUID, nullable) - FOREIGN KEY → users
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- (company_id, status)
- (company_id, user_id)
- (company_id, created_at)

---

## Procedures & Documentation

### `aprs` (Análise Preliminar de Risco - Preliminary Risk Analysis)
```
┌─ id (UUID) - PRIMARY KEY
├─ numero (VARCHAR) - Unique identifier within company
├─ titulo (VARCHAR)
├─ descricao (TEXT, nullable)
├─ data_inicio (DATE)
├─ data_fim (DATE)
├─ status (VARCHAR) - "Pendente | Aprovada | Cancelada | Encerrada"
├─ is_modelo (BOOLEAN) - default: false - Reusable template flag
├─ is_modelo_padrao (BOOLEAN) - default: false - Default model flag
├─ itens_risco (simple-json, nullable) - Array of risk items
├─ probability (INT, nullable) - 1-5 scale
├─ severity (INT, nullable) - 1-5 scale
├─ exposure (INT, nullable)
├─ initial_risk (INT, nullable) - probability × severity
├─ residual_risk (VARCHAR, nullable) - "LOW | MEDIUM | HIGH | CRITICAL"
├─ evidence_photo (TEXT, nullable) - Photo file path
├─ evidence_document (TEXT, nullable) - Document file path
├─ control_description (TEXT, nullable)
├─ control_evidence (BOOLEAN) - default: false
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID) - FOREIGN KEY → sites
├─ elaborador_id (UUID) - FOREIGN KEY → users
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable)
```

**Indexes:**
- `IDX_aprs_company_created` - (company_id, created_at DESC)
- `IDX_aprs_status_company` - (status, company_id)
- `IDX_aprs_site_company` - (site_id, company_id)
- `idx_aprs_company_updated_active` - (company_id, updated_at DESC) WHERE deleted_at IS NULL

**Junction Tables:**
- apr_activities (apr_id, activity_id)
- apr_risks (apr_id, risk_id)
- apr_epis (apr_id, epi_id)
- apr_tools (apr_id, tool_id)
- apr_machines (apr_id, machine_id)

---

### `apr_risk_items` (Detail breakdown of risks in APR)
```
┌─ id (UUID) - PRIMARY KEY
├─ apr_id (UUID) - FOREIGN KEY → aprs (CASCADE)
├─ atividade (TEXT, nullable) - Activity description
├─ agente_ambiental (TEXT, nullable) - Environmental hazard
├─ condicao_perigosa (TEXT, nullable) - Dangerous condition
├─ fonte_circunstancia (TEXT, nullable) - Source/Circumstance
├─ lesao (TEXT, nullable) - Potential injury
├─ probabilidade (INT, nullable) - Probability score
├─ severidade (INT, nullable) - Severity score
├─ score_risco (INT, nullable) - Risk score (probability × severity)
├─ categoria_risco (VARCHAR, nullable) - "Baixo | Médio | Alto | Crítico"
├─ prioridade (VARCHAR, nullable)
├─ medidas_prevencao (TEXT, nullable) - Prevention measures
├─ responsavel (TEXT, nullable)
├─ prazo (DATE, nullable) - Deadline
├─ status_acao (VARCHAR, nullable) - Action status
├─ ordem (INT) - default: 0 - Display order
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Relationships:**
- ONE-TO-MANY → apr_risk_evidences

---

### `apr_risk_evidences` (Photos/Documents proving APR compliance)
```
┌─ id (UUID) - PRIMARY KEY
├─ apr_id (UUID) - FOREIGN KEY → aprs (CASCADE)
├─ apr_risk_item_id (UUID) - FOREIGN KEY → apr_risk_items (CASCADE)
├─ uploaded_by_id (UUID, nullable) - FOREIGN KEY → users
├─ file_key (TEXT) - S3/Storage path
├─ original_name (TEXT, nullable) - Original filename
├─ mime_type (VARCHAR) - MIME type
├─ file_size_bytes (INTEGER) - File size in bytes
├─ hash_sha256 (VARCHAR) - SHA256 hash for integrity
├─ watermarked_file_key (TEXT, nullable) - Watermarked version
├─ watermarked_hash_sha256 (VARCHAR, nullable) - Watermark hash
├─ watermark_text (TEXT, nullable)
├─ captured_at (TIMESTAMP, nullable) - Photo capture time
├─ uploaded_at (TIMESTAMP) - AUTO
├─ latitude (NUMERIC 10,7, nullable) - GPS latitude
├─ longitude (NUMERIC 10,7, nullable) - GPS longitude
├─ accuracy_m (NUMERIC 10,2, nullable) - GPS accuracy in meters
├─ device_id (VARCHAR, nullable) - Device identifier
├─ ip_address (VARCHAR, nullable) - Uploader IP
├─ exif_datetime (TIMESTAMP, nullable) - Photo EXIF timestamp
└─ integrity_flags (simple-json, nullable) - Validation flags
```

**RLS Policy:** Via parent APR verification
- Users can only access evidences for APRs in their company

---

### `apr_logs` (Audit trail for APR state changes)
```
┌─ id (UUID) - PRIMARY KEY
├─ apr_id (UUID) - FOREIGN KEY → aprs (CASCADE)
├─ usuario_id (UUID, nullable) - User who made change
├─ acao (VARCHAR, length: 100) - Action type
├─ metadata (simple-json, nullable) - Extra information
└─ data_hora (TIMESTAMP) - AUTO timestamp
```

---

### `pts` (Permissão de Trabalho - Work Permit)
```
┌─ id (UUID) - PRIMARY KEY
├─ numero (VARCHAR) - PT number
├─ titulo (VARCHAR) - PT title
├─ descricao (TEXT, nullable)
├─ data_hora_inicio (TIMESTAMP) - Start date/time
├─ data_hora_fim (TIMESTAMP) - End date/time
├─ status (VARCHAR) - "Pendente | Aprovada | Cancelada | Encerrada | Expirada"
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID) - FOREIGN KEY → sites
├─ apr_id (UUID, nullable) - FOREIGN KEY → aprs
├─ responsavel_id (UUID) - FOREIGN KEY → users (Supervisor)
├─ trabalho_altura (BOOLEAN) - Height work
├─ espaco_confinado (BOOLEAN) - Confined space
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable)
```

**Junction Table:**
- pt_executantes (pt_id, user_id) - Workers assigned to PT

**Indexes:**
- `IDX_pts_company_created` - (company_id, created_at)
- `idx_pts_company_updated_active` - (company_id, updated_at DESC)
- `idx_pts_company_status_active` - (company_id, status)

---

### `dds` (Diálogo Diário de Segurança - Daily Safety Dialogue)
```
┌─ id (UUID) - PRIMARY KEY
├─ tema (VARCHAR) - Topic/Subject
├─ conteudo (TEXT, nullable) - Content
├─ data (DATE) - DDS date
├─ is_modelo (BOOLEAN) - default: false - Template flag
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID) - FOREIGN KEY → sites
├─ facilitador_id (UUID) - FOREIGN KEY → users (Facilitator)
├─ auditado_por_id (UUID, nullable) - FOREIGN KEY → users
├─ data_auditoria (TIMESTAMP, nullable)
├─ resultado_auditoria (VARCHAR, nullable) - "Conforme | Não Conforme | Observação"
├─ notas_auditoria (TEXT, nullable)
├─ pdf_file_key (TEXT, nullable) - Generated PDF
├─ pdf_folder_path (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Junction Table:**
- dds_participants (dds_id, user_id) - Workers who attended

**Indexes:**
- `IDX_dds_company_created` - (company_id, created_at)

---

### `inspections` (Safety Inspections)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID) - FOREIGN KEY → sites
├─ setor_area (VARCHAR) - Department/Area
├─ tipo_inspecao (VARCHAR) - "Rotina | Programada | Especial | Atendimento a NR"
├─ data_inspecao (DATE)
├─ horario (VARCHAR)
├─ responsavel_id (UUID) - FOREIGN KEY → users
├─ objetivo (TEXT, nullable)
├─ descricao_local_atividades (TEXT, nullable)
├─ metodologia (JSON, nullable) - Array of methods used
├─ perigos_riscos (JSON, nullable) - Risk assessment details
│  └─ Array of {
│     ├─ grupo_risco: string
│     ├─ perigo_fator_risco: string
│     ├─ fonte_circunstancia: string
│     ├─ trabalhadores_expostos: string
│     ├─ tipo_exposicao: string
│     ├─ medidas_existentes: string
│     ├─ severidade: string
│     ├─ probabilidade: string
│     ├─ nivel_risco: string
│     ├─ classificacao_risco: string
│     ├─ acoes_necessarias: string
│     ├─ prazo: string
│     └─ responsavel: string
│  }
├─ plano_acao (JSON, nullable) - Action plan
├─ evidencias (JSON, nullable) - Evidence files
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `checklists`
```
┌─ id (UUID) - PRIMARY KEY
├─ titulo (VARCHAR)
├─ descricao (TEXT, nullable)
├─ equipamento (VARCHAR, nullable)
├─ maquina (VARCHAR, nullable)
├─ foto_equipamento (TEXT, nullable)
├─ data (DATE)
├─ status (VARCHAR) - default: "Pendente" - "Conforme | Não Conforme | Pendente"
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ inspetor_id (UUID, nullable) - FOREIGN KEY → users
├─ itens (JSONB, nullable) - Array of checklist items
├─ is_modelo (BOOLEAN) - default: false
├─ template_id (UUID, nullable) - FOREIGN KEY → checklists (self-ref)
├─ ativo (BOOLEAN) - default: true
├─ categoria (VARCHAR, nullable) - "SST | Qualidade | Equipamento | Interno"
├─ periodicidade (VARCHAR, nullable) - "Diário | Semanal | Mensal | Eventual"
├─ nivel_risco_padrao (VARCHAR, nullable) - "Baixo | Médio | Alto"
├─ auditado_por_id (UUID, nullable) - FOREIGN KEY → users
├─ data_auditoria (TIMESTAMP, nullable)
├─ resultado_auditoria (VARCHAR, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `idx_checklists_company_updated_active` - (company_id, updated_at DESC)
- `idx_checklists_company_status_active` - (company_id, status)

---

## Risk Management

### `risks` (Risk Register)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR)
├─ categoria (VARCHAR) - "Físico | Químico | Biológico | Ergonômico | Acidente"
├─ descricao (TEXT, nullable)
├─ medidas_controle (TEXT, nullable)
├─ probability (INT, nullable) - 1-5 scale
├─ severity (INT, nullable) - 1-5 scale
├─ exposure (INT, nullable)
├─ initial_risk (INT, nullable)
├─ residual_risk (VARCHAR, nullable) - "LOW | MEDIUM | HIGH | CRITICAL"
├─ control_hierarchy (VARCHAR, nullable) - "ELIMINATION | SUBSTITUTION | ENGINEERING | ADMINISTRATIVE | PPE"
├─ evidence_photo (TEXT, nullable)
├─ evidence_document (TEXT, nullable)
├─ control_description (TEXT, nullable)
├─ control_evidence (BOOLEAN) - default: false
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `risk_history` (Risk audit trail)
```
┌─ id (UUID) - PRIMARY KEY
├─ risk_id (UUID) - FOREIGN KEY → risks (CASCADE)
├─ changed_by (VARCHAR, nullable) - Who made the change
├─ old_value (JSONB) - Previous state
├─ new_value (JSONB) - New state
└─ created_at (TIMESTAMP) - AUTO
```

---

### `nonconformities` (Non-Conformity Reports)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ codigo_nc (VARCHAR) - Internal code
├─ tipo (VARCHAR)
├─ data_identificacao (DATE)
├─ local_setor_area (VARCHAR)
├─ atividade_envolvida (VARCHAR)
├─ responsavel_area (VARCHAR)
├─ auditor_responsavel (VARCHAR)
├─ classificacao (simple-json, nullable) - Array of tags
├─ descricao (TEXT)
├─ evidencia_observada (TEXT)
├─ condicao_insegura (TEXT)
├─ ato_inseguro (TEXT, nullable)
├─ requisito_nr (VARCHAR) - NR requirement
├─ requisito_item (VARCHAR)
├─ requisito_procedimento (VARCHAR, nullable)
├─ requisito_politica (VARCHAR, nullable)
├─ risco_perigo (VARCHAR)
├─ risco_associado (VARCHAR)
├─ risco_consequencias (simple-json, nullable)
├─ risco_nivel (VARCHAR) - "Baixo | Médio | Alto | Crítico"
├─ causa (simple-json, nullable) - Root causes
├─ causa_outro (VARCHAR, nullable)
├─ acao_imediata_descricao (TEXT, nullable)
├─ acao_imediata_data (DATE, nullable)
├─ acao_imediata_responsavel (VARCHAR, nullable)
├─ acao_imediata_status (VARCHAR, nullable)
├─ closed_at (TIMESTAMP, nullable) - When closed
├─ closed_resolution_type (VARCHAR, nullable) - Type of resolution
├─ closed_resolution_notes (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable)
```

**Unique Constraint:**
- `UQ_nonconformities_company_codigo_nc_active` - (company_id, codigo_nc) WHERE deleted_at IS NULL

**Indexes:**
- `idx_nonconformities_company_updated_active` - (company_id, updated_at DESC)
- `idx_nonconformities_company_status_active` - (company_id, status)

---

### `corrective_actions` (CAP - Corrective Action Plan)
```
┌─ id (UUID) - PRIMARY KEY
├─ title (VARCHAR)
├─ description (TEXT)
├─ source_type (VARCHAR) - "manual | nonconformity | audit"
├─ source_id (UUID, nullable) - Link to NC or Audit
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ responsible_user_id (UUID, nullable) - FOREIGN KEY → users
├─ responsible_name (VARCHAR, nullable)
├─ due_date (DATE) - Deadline
├─ status (VARCHAR) - "open | in_progress | done | overdue | cancelled"
├─ priority (VARCHAR) - "low | medium | high | critical"
├─ sla_days (INT, nullable) - SLA threshold
├─ evidence_notes (TEXT, nullable)
├─ evidence_files (JSONB, nullable) - Array of file paths
├─ last_reminder_at (TIMESTAMP, nullable)
├─ escalation_level (INT) - default: 0
├─ closed_at (TIMESTAMP, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

## Operational Documents

### `rdos` (Diário de Obra - Daily Work Report)
```
┌─ id (UUID) - PRIMARY KEY
├─ numero (VARCHAR) - RDO number (unique per company)
├─ data (DATE)
├─ status (VARCHAR) - default: "rascunho" - "rascunho | enviado | aprovado | cancelado"
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ responsavel_id (UUID, nullable) - FOREIGN KEY → users
├─ clima_manha (VARCHAR, nullable)
├─ clima_tarde (VARCHAR, nullable)
├─ temperatura_min (DECIMAL 5,1, nullable)
├─ temperatura_max (DECIMAL 5,1, nullable)
├─ mao_de_obra (JSONB, nullable) - Array of {funcao, quantidade, turno, horas}
├─ equipamentos (JSONB, nullable) - Array of {nome, quantidade, horas_trabalhadas}
├─ materiais (JSONB, nullable) - Array of materials
├─ servicos (JSONB, nullable) - Array of services
├─ ocorrencias (JSONB, nullable) - Array of incidents
├─ observacoes_gerais (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable)
```

**Unique Constraint:**
- `UQ_rdos_company_numero` - (company_id, numero)

---

### `rdo_audit_events`
```
┌─ id (UUID) - PRIMARY KEY
├─ rdo_id (UUID) - FOREIGN KEY → rdos (CASCADE)
├─ user_id (UUID, nullable) - FOREIGN KEY → users
├─ event_type (VARCHAR) - Type of event
├─ details (JSONB, nullable)
└─ created_at (TIMESTAMP) - AUTO
```

**Indexes:**
- (rdo_id, created_at)

---

### `service_orders` (OS - Ordem de Serviço)
```
┌─ id (UUID) - PRIMARY KEY
├─ numero (VARCHAR) - "OS-YYYYMM-NNN"
├─ titulo (VARCHAR)
├─ descricao_atividades (TEXT)
├─ riscos_identificados (JSON, nullable) - Array of {risco, medida_controle}
├─ epis_necessarios (JSON, nullable) - Array of {nome, ca}
├─ responsabilidades (TEXT, nullable)
├─ status (VARCHAR) - default: "ativo" - "ativo | concluido | cancelado"
├─ data_emissao (DATE)
├─ data_inicio (DATE, nullable)
├─ data_fim_previsto (DATE, nullable)
├─ responsavel_id (UUID, nullable) - FOREIGN KEY → users
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ company_id (UUID) - FOREIGN KEY → companies
├─ assinatura_responsavel (TEXT, nullable) - Base64 signature
├─ assinatura_colaborador (TEXT, nullable)
├─ pdf_file_key (VARCHAR, nullable)
├─ pdf_folder_path (VARCHAR, nullable)
├─ pdf_original_name (VARCHAR, nullable)
└─ created_at (TIMESTAMP) - AUTO
```

**Unique Constraint:**
- `UQ_service_orders_company_numero` - (company_id, numero)

---

### `audits` (Safety Audits)
```
┌─ id (UUID) - PRIMARY KEY
├─ titulo (VARCHAR)
├─ data_auditoria (DATE)
├─ tipo_auditoria (VARCHAR) - "interna | externa | cliente | legal | sistema_gestao"
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID) - FOREIGN KEY → sites
├─ auditor_id (UUID) - FOREIGN KEY → users
├─ representantes_empresa (TEXT, nullable)
├─ objetivo (TEXT, nullable)
├─ escopo (TEXT, nullable)
├─ referencias (JSON, nullable) - Standards referenced
├─ metodologia (TEXT, nullable)
├─ caracterizacao (JSON, nullable) - CNAE, grau_risco, num_trabalhadores, etc.
├─ documentos_avaliados (JSON, nullable)
├─ resultados_conformidades (JSON, nullable)
├─ resultados_nao_conformidades (JSON, nullable) - Details with classification
├─ resultados_observacoes (JSON, nullable)
├─ resultados_oportunidades (JSON, nullable)
├─ avaliacao_riscos (JSON, nullable)
├─ created_at (TIMESTAMP) - AUTO
├─ updated_at (TIMESTAMP) - AUTO
└─ deleted_at (TIMESTAMP, nullable)
```

**Indexes:**
- `idx_audits_company_updated_active` - (company_id, updated_at DESC)

---

### `cats` (Comunicação de Acidente do Trabalho - Work Accident Reports)
```
┌─ id (UUID) - PRIMARY KEY
├─ numero (VARCHAR) - CAT number (unique per company)
├─ company_id (UUID) - FOREIGN KEY → companies
├─ site_id (UUID, nullable) - FOREIGN KEY → sites
├─ worker_id (UUID, nullable) - FOREIGN KEY → users
├─ data_ocorrencia (DATE) - Accident date
├─ tipo (VARCHAR) - "tipico | trajeto | doenca_ocupacional | outros"
├─ gravidade (VARCHAR) - "leve | moderada | grave | fatal"
├─ descricao (TEXT)
├─ local_ocorrencia (TEXT, nullable)
├─ pessoas_envolvidas (JSONB, nullable) - Array of people
├─ acao_imediata (TEXT, nullable)
├─ investigacao_detalhes (TEXT, nullable)
├─ causa_raiz (TEXT, nullable)
├─ plano_acao_fechamento (TEXT, nullable)
├─ status (VARCHAR) - "aberta | investigacao | fechada"
├─ attachments (JSONB, nullable) - Array of {id, file_name, file_key, category, uploaded_at}
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Unique Constraint:**
- (company_id, numero)

---

## Auditing & Compliance

### `audit_logs` (Action Audit Trail)
```
┌─ id (UUID) - PRIMARY KEY
├─ userId (VARCHAR) - User who performed action
├─ user_id (VARCHAR, nullable) - Normalized field
├─ action (VARCHAR) - "CREATE | UPDATE | DELETE | READ"
├─ entity (VARCHAR) - Entity type (e.g., "User", "Company")
├─ entity_type (VARCHAR, nullable)
├─ entityId (VARCHAR)
├─ entity_id (VARCHAR, nullable)
├─ changes (simple-json, nullable) - Details of changes
├─ before (simple-json, nullable) - State before
├─ after (simple-json, nullable) - State after
├─ ip (VARCHAR)
├─ userAgent (VARCHAR, nullable)
├─ companyId (VARCHAR)
├─ timestamp (TIMESTAMP) - AUTO
└─ created_at (TIMESTAMP, nullable)
```

**Indexes:**
- `idx_audit_logs_entity_date` - (entity_type, entity_id, timestamp DESC)
- `idx_audit_logs_user_date` - (user_id, timestamp DESC)
- `idx_audit_logs_company_date` - (company_id, timestamp DESC)

---

### `forensic_trail_events` (Immutable event stream for legal evidence)
```
┌─ id (UUID) - PRIMARY KEY
├─ stream_key (VARCHAR) - Logical stream identifier
├─ stream_sequence (INTEGER) - Sequence number within stream
├─ event_type (VARCHAR) - Type of event
├─ module (VARCHAR, length: 50) - Which module (APR, PT, DDS, etc.)
├─ entity_id (VARCHAR) - ID of entity affected
├─ company_id (VARCHAR, nullable) - Tenant association
├─ user_id (VARCHAR, nullable) - Who performed action
├─ request_id (VARCHAR, nullable) - API request ID
├─ ip (VARCHAR, nullable)
├─ user_agent (TEXT, nullable)
├─ metadata (JSONB, nullable) - Extra event data
├─ previous_event_hash (VARCHAR, nullable) - Hash chain
├─ event_hash (VARCHAR) - SHA256 of this event
├─ occurred_at (TIMESTAMP) - When event happened
└─ created_at (TIMESTAMP) - AUTO
```

**Unique Constraints:**
- `UQ_forensic_trail_events_stream_sequence` - (stream_key, stream_sequence)
- `UQ_forensic_trail_events_event_hash` - (event_hash)

**Indexes:**
- `IDX_forensic_trail_events_company_module_entity_created` - (company_id, module, entity_id, created_at)

---

### `pdf_integrity_records` (PDF signature integrity tracking)
```
┌─ id (UUID) - PRIMARY KEY
├─ hash (VARCHAR, length: 64) - UNIQUE - SHA256 of PDF
├─ original_name (TEXT, nullable)
├─ signed_by_user_id (VARCHAR, nullable) - FOREIGN KEY → users
├─ company_id (VARCHAR, nullable) - FOREIGN KEY → companies
└─ created_at (TIMESTAMP) - AUTO
```

**RLS Policy:** Via company association

---

## Supporting Tables

### `activities` (Atividades - Job Activities/Risk Areas)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR)
├─ descricao (TEXT, nullable)
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `machines` (Machines/Equipment)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR)
├─ placa (VARCHAR, nullable) - License plate
├─ horimetro_atual (FLOAT) - Current operating hours
├─ descricao (TEXT, nullable)
├─ requisitos_seguranca (TEXT, nullable)
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `tools` (Tools Register)
```
┌─ id (UUID) - PRIMARY KEY
├─ nome (VARCHAR)
├─ numero_serie (VARCHAR, nullable)
├─ descricao (TEXT, nullable)
├─ status (BOOLEAN) - default: true
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `contracts` (Service Contracts)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - FOREIGN KEY → companies
├─ number (VARCHAR, nullable) - Contract number
├─ contractor_name (VARCHAR, nullable) - Service provider name
├─ description (TEXT, nullable)
├─ start_date (DATE, nullable)
├─ end_date (DATE, nullable)
├─ status (VARCHAR) - default: "active"
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `reports` (Monthly Reports)
```
┌─ id (UUID) - PRIMARY KEY
├─ titulo (VARCHAR)
├─ descricao (TEXT, nullable)
├─ mes (INT)
├─ ano (INT)
├─ estatisticas (JSONB) - Report metrics
├─ analise_gandra (TEXT, nullable) - AI analysis
├─ company_id (UUID) - FOREIGN KEY → companies
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `document_registry` (Document System Registry)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - FOREIGN KEY → companies
├─ module (VARCHAR, length: 50) - Which module (APR, PT, DDS)
├─ document_type (VARCHAR, length: 50) - default: "pdf"
├─ entity_id (VARCHAR) - ID of entity
├─ title (VARCHAR)
├─ document_date (TIMESTAMP, nullable)
├─ iso_year (INT) - Year of generation
├─ iso_week (INT) - Week of generation
├─ file_key (TEXT) - S3/Storage path
├─ folder_path (TEXT, nullable)
├─ original_name (TEXT, nullable)
├─ mime_type (VARCHAR, nullable)
├─ file_hash (VARCHAR, nullable) - SHA256
├─ document_code (VARCHAR, nullable)
├─ status (ENUM) - "ACTIVE | EXPIRED"
├─ litigation_hold (BOOLEAN) - default: false
├─ expires_at (TIMESTAMP, nullable) - Retention expiration
├─ created_by (UUID, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Unique Constraint:**
- (company_id, module, document_type) per year/week

**RLS Policy:** company_id isolation

---

### `document_import` (Document Analysis Queue for AI processing)
```
┌─ id (UUID) - PRIMARY KEY
├─ empresaId (UUID) - Company to charge
├─ tipoDocumento (VARCHAR, nullable)
├─ nomeArquivo (VARCHAR, nullable)
├─ hash (VARCHAR, length: 64) - SHA256
├─ idempotencyKey (VARCHAR, nullable) - For dedup
├─ tamanho (INTEGER, nullable)
├─ mimeType (VARCHAR, nullable)
├─ textoExtraido (TEXT, nullable) - OCR result
├─ arquivo_staging (BYTEA, nullable) - Temp file storage
├─ metadata (JSONB, nullable) - Processing metadata
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Unique Constraints:**
- `UQ_document_imports_empresa_hash` - (empresaId, hash)
- `UQ_document_imports_empresa_idempotency_key` - (empresaId, idempotencyKey)

---

### `document_video_attachments` (Video evidence/inspection recordings)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (VARCHAR, length: 120) - Tenant
├─ module (VARCHAR, length: 50) - "inspection | rdo | dds"
├─ document_type (VARCHAR, length: 50)
├─ document_id (VARCHAR, length: 120) - Entity ID
├─ original_name (TEXT)
├─ mime_type (VARCHAR, length: 120)
├─ size_bytes (INTEGER)
├─ file_hash (VARCHAR, length: 64) - File hash
├─ storage_key (TEXT) - Where stored
├─ uploaded_by_id (VARCHAR, nullable)
├─ uploaded_at (TIMESTAMP)
├─ duration_seconds (INTEGER, nullable)
├─ processing_status (VARCHAR) - default: "ready"
├─ availability (VARCHAR) - default: "stored" - "stored | registered_without_signed_url | removed"
├─ removed_at (TIMESTAMP, nullable)
├─ removed_by_id (VARCHAR, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `IDX_document_video_company_module_document_created`
- `IDX_document_video_company_module_document_removed`
- `IDX_document_video_storage_key`

---

### `signatures` (Digital Signatures on documents)
```
┌─ id (UUID) - PRIMARY KEY
├─ user_id (UUID) - FOREIGN KEY → users
├─ document_id (VARCHAR)
├─ document_type (VARCHAR) - "DDS | APR | etc"
├─ signature_data (TEXT) - Base64/SVG
├─ type (VARCHAR) - "digital | upload | facial"
├─ company_id (VARCHAR, nullable)
├─ signature_hash (VARCHAR, nullable) - SHA256
├─ timestamp_token (VARCHAR, nullable) - Timestamping authority
├─ timestamp_authority (VARCHAR, nullable)
├─ signed_at (TIMESTAMP, nullable)
├─ integrity_payload (JSONB, nullable)
└─ created_at (TIMESTAMP) - AUTO
```

**RLS Policy:** company_id isolation

---

### `mail_logs` (Email delivery audit)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID, nullable) - FOREIGN KEY → companies
├─ user_id (UUID, nullable) - FOREIGN KEY → users
├─ to (VARCHAR) - Recipient
├─ subject (VARCHAR)
├─ filename (VARCHAR)
├─ message_id (VARCHAR, nullable) - Provider's message ID
├─ accepted (JSONB, nullable) - Array of accepted emails
├─ rejected (JSONB, nullable) - Array of rejected emails
├─ provider_response (TEXT, nullable)
├─ using_test_account (BOOLEAN) - default: false
├─ status (VARCHAR) - "sent | failed | bounced"
├─ error_message (TEXT, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `push_subscriptions` (Web Push Notification Subscriptions)
```
┌─ id (UUID) - PRIMARY KEY
├─ userId (VARCHAR)
├─ endpoint (VARCHAR) - Push service endpoint
├─ keys (simple-json) - {p256dh, auth}
└─ createdAt (TIMESTAMP) - AUTO
```

---

### `notifications`
```
┌─ id (UUID) - PRIMARY KEY
├─ userId (VARCHAR)
├─ type (VARCHAR) - "info | success | warning | error"
├─ title (VARCHAR)
├─ message (TEXT)
├─ data (JSONB, nullable) - Extra data
├─ read (BOOLEAN) - default: false
├─ createdAt (TIMESTAMP) - AUTO
└─ readAt (TIMESTAMP, nullable)
```

---

### `monthly_snapshots` (Cached metrics for dashboard)
```
┌─ id (UUID) - PRIMARY KEY
├─ month (VARCHAR) - YYYY-MM format
├─ site_id (UUID)
├─ company_id (UUID)
├─ risk_score (NUMERIC 10,2) - Aggregated risk score
├─ nc_count (INT) - Non-conformity count
├─ training_compliance (NUMERIC 5,2) - % compliance
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `ai_interactions` (AI Agent usage audit)
```
┌─ id (UUID) - PRIMARY KEY
├─ tenant_id (VARCHAR) - Company ID
├─ user_id (VARCHAR)
├─ question (TEXT) - User query
├─ response (JSON, nullable) - AI response
├─ tools_called (JSON, nullable) - Array of tools
├─ status (VARCHAR) - default: "SUCCESS"
├─ error_message (TEXT, nullable)
├─ model (VARCHAR, nullable) - "claude-sonnet-4-6"
├─ provider (VARCHAR, nullable) - "anthropic"
├─ latency_ms (INTEGER, nullable)
├─ token_usage_input (INTEGER, nullable)
├─ token_usage_output (INTEGER, nullable)
├─ estimated_cost_usd (NUMERIC, nullable)
├─ confidence (VARCHAR, nullable) - Confidence level
├─ needs_human_review (BOOLEAN, nullable)
├─ reviewed_at (TIMESTAMP, nullable)
├─ review_notes (TEXT, nullable)
└─ created_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `IDX_ai_interactions_tenant_created` - (tenant_id, created_at)
- `IDX_ai_interactions_tenant_user_created` - (tenant_id, user_id, created_at)

---

### `tenant_document_policies` (Document retention policy per tenant)
```
┌─ id (UUID) - PRIMARY KEY
├─ company_id (UUID) - UNIQUE - FOREIGN KEY → companies (CASCADE)
├─ retention_days_apr (INT) - default: 2555 (7 years)
├─ retention_days_dds (INT) - default: 1825 (5 years)
├─ retention_days_pts (INT) - default: 2555 (7 years)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

---

### `disaster_recovery_executions` (DR/Backup operation tracking)
```
┌─ id (UUID) - PRIMARY KEY
├─ operation_type (VARCHAR, length: 50) - "backup | restore | test"
├─ scope (VARCHAR, length: 20) - "full | incremental | targeted"
├─ environment (VARCHAR, length: 50) - "production | staging"
├─ target_environment (VARCHAR, nullable)
├─ status (VARCHAR, length: 50) - "running | completed | failed"
├─ trigger_source (VARCHAR, length: 50) - "scheduled | manual | alert"
├─ requested_by_user_id (VARCHAR, nullable)
├─ backup_name (VARCHAR, nullable)
├─ artifact_path (TEXT, nullable)
├─ artifact_storage_key (TEXT, nullable)
├─ error_message (TEXT, nullable)
├─ metadata (JSONB, nullable)
├─ started_at (TIMESTAMPTZ)
├─ completed_at (TIMESTAMPTZ, nullable)
├─ created_at (TIMESTAMP) - AUTO
└─ updated_at (TIMESTAMP) - AUTO
```

**Indexes:**
- `IDX_dr_execution_operation_environment_started` - (operation_type, environment, started_at)
- `IDX_dr_execution_status_started` - (status, started_at)

---

## Junction/Bridge Tables

### `apr_activities` (APR ↔ Activities)
```
┌─ apr_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → aprs (CASCADE)
└─ activity_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → activities (CASCADE)
```

---

### `apr_risks` (APR ↔ Risks)
```
┌─ apr_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → aprs (CASCADE)
└─ risk_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → risks (CASCADE)
```

---

### `apr_epis` (APR ↔ EPIs)
```
┌─ apr_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → aprs (CASCADE)
└─ epi_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → epis (CASCADE)
```

---

### `apr_tools` (APR ↔ Tools)
```
┌─ apr_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → aprs (CASCADE)
└─ tool_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → tools (CASCADE)
```

---

### `apr_machines` (APR ↔ Machines)
```
┌─ apr_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → aprs (CASCADE)
└─ machine_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → machines (CASCADE)
```

---

### `pt_executantes` (PT ↔ Workers)
```
┌─ pt_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → pts (CASCADE)
└─ user_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → users (CASCADE)
```

---

### `dds_participants` (DDS ↔ Attendees)
```
┌─ dds_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → dds (CASCADE)
└─ user_id (UUID) - PRIMARY KEY (composite) - FOREIGN KEY → users (CASCADE)
```

---

## Indexes & Performance

### Core Performance Indexes

#### Company-Scoped Queries
```sql
-- Dashboard feed (recent records)
IDX_aprs_company_updated_active - (company_id, updated_at DESC) WHERE deleted_at IS NULL
IDX_pts_company_updated_active - (company_id, updated_at DESC) WHERE deleted_at IS NULL
IDX_checklists_company_updated_active - (company_id, updated_at DESC) WHERE deleted_at IS NULL
IDX_audits_company_updated_active - (company_id, updated_at DESC) WHERE deleted_at IS NULL
IDX_nonconformities_company_updated_active - (company_id, updated_at DESC) WHERE deleted_at IS NULL
IDX_inspections_company_updated - (company_id, updated_at DESC)

-- Status filtering (pending items)
IDX_pts_company_status_active - (company_id, status) WHERE deleted_at IS NULL
IDX_checklists_company_status_active - (company_id, status) WHERE deleted_at IS NULL
IDX_nonconformities_company_status_active - (company_id, status) WHERE deleted_at IS NULL

-- Pagination/List queries
IDX_aprs_company_created - (company_id, created_at DESC)
IDX_aprs_status_company - (status, company_id)
IDX_aprs_site_company - (site_id, company_id)
IDX_pts_company_created - (company_id, created_at)
IDX_trainings_company_created - (company_id, created_at)
IDX_medical_exams_company_created - (company_id, created_at)
IDX_dds_company_created - (company_id, created_at)
```

#### Text Search
```sql
-- Full-text trigram search (fuzzy matching)
idx_users_nome_trgm - GIN on nome (trigram ops)
idx_users_cpf_trgm - GIN on cpf (trigram ops) WHERE cpf IS NOT NULL
idx_companies_razao_social_trgm - GIN on razao_social (trigram ops)
idx_companies_responsavel_trgm - GIN on responsavel (trigram ops)
idx_companies_cnpj_trgm - GIN on cnpj (trigram ops)
```

#### Audit/Forensics
```sql
IDX_forensic_trail_events_company_module_entity_created - (company_id, module, entity_id, created_at)
IDX_ai_interactions_tenant_created - (tenant_id, created_at)
IDX_ai_interactions_tenant_user_created - (tenant_id, user_id, created_at)
idx_audit_logs_entity_date - (entity_type, entity_id, timestamp DESC)
idx_audit_logs_user_date - (user_id, timestamp DESC)
idx_audit_logs_company_date - (company_id, timestamp DESC)
```

#### Document Registry
```sql
IDX_document_registry_company_week - (company_id, iso_year, iso_week)
IDX_document_registry_module_entity - (module, entity_id)
IDX_document_registry_company_status_expiry - (company_id, status, expires_at)
```

#### Video Attachments
```sql
IDX_document_video_company_module_document_created - (company_id, module, document_id, created_at)
IDX_document_video_company_module_document_removed - (company_id, module, document_id, removed_at)
IDX_document_video_storage_key - (storage_key)
```

#### Disaster Recovery
```sql
IDX_dr_execution_operation_environment_started - (operation_type, environment, started_at)
IDX_dr_execution_status_started - (status, started_at)
```

---

## RLS Policies

### Restrictive Policies (Apply to all connections)

#### `tenant_guard_public_hardening`
**Tables:**
- document_registry
- checklists
- inspections
- cats
- signatures
- apr_risk_evidences (special: checks parent APR)

**Policy Rule:**
```sql
-- For direct company_id tables
USING (
  company_id = current_company()
  OR is_super_admin() = true
)
WITH CHECK (
  company_id = current_company()
  OR is_super_admin() = true
)

-- For apr_risk_evidences (checks parent APR)
USING (
  is_super_admin() = true
  OR EXISTS (
    SELECT 1
    FROM aprs a
    WHERE a.id = apr_risk_evidences.apr_id
      AND a.company_id = current_company()
  )
)
WITH CHECK (
  is_super_admin() = true
  OR EXISTS (
    SELECT 1
    FROM aprs a
    WHERE a.id = apr_risk_evidences.apr_id
      AND a.company_id = current_company()
  )
)
```

---

### Tenant Isolation Policies

#### `tenant_isolation_policy`
**Tables:**
- document_video_attachments
- forensic_trail_events
- pdf_integrity_records
- monthly_snapshots

**Policy Rule:**
```sql
USING (
  (company_id)::text = (current_company())::text
  OR is_super_admin() = true
)
WITH CHECK (
  (company_id)::text = (current_company())::text
  OR is_super_admin() = true
)
```

---

### Database Functions (RLS Helpers)

```sql
-- Get current tenant/company from session
current_company() → UUID

-- Check if user is super admin
is_super_admin() → BOOLEAN
```

---

## Key Relationships

### Hierarchical Structure
```
┌─ Companies (Tenant)
│  ├─ Users (with Profiles & Roles)
│  ├─ Sites (Work locations)
│  ├─ Contracts
│  ├─ Machines
│  ├─ Tools
│  ├─ EPIs
│  ├─ Activities
│  ├─ Risks
│  │  └─ RiskHistory (audit trail)
│  ├─ APRs (Preliminary Risk Analysis)
│  │  ├─ APR Risk Items
│  │  │  └─ APR Risk Evidences
│  │  ├─ APR Logs
│  │  ├─ Junction: apr_activities
│  │  ├─ Junction: apr_risks
│  │  └─ PTs linked via apr_id
│  ├─ PTs (Work Permits)
│  │  └─ PT Executantes (assigned workers)
│  ├─ RDOs (Daily Work Reports)
│  │  └─ RDO Audit Events
│  ├─ DDSs (Daily Safety Dialogues)
│  │  └─ DDS Participants
│  ├─ Service Orders
│  ├─ Inspections
│  ├─ Checklists
│  ├─ Audits
│  ├─ NonConformities
│  │  └─ Corrective Actions (via source_id)
│  ├─ CATs (Accidents)
│  ├─ Trainings (per User)
│  ├─ Medical Exams (per User)
│  ├─ EPI Assignments (per User)
│  ├─ Reports (monthly)
│  ├─ Document Registry
│  ├─ Tenant Document Policies
│  ├─ Mail Logs
│  ├─ AI Interactions
│  └─ Signatures
│
├─ Global/Cross-tenant
│  ├─ Roles (RBAC)
│  ├─ Permissions (RBAC)
│  ├─ User Roles (bridge)
│  ├─ Role Permissions (bridge)
│  ├─ User Sessions
│  ├─ Audit Logs
│  ├─ Forensic Trail Events
│  ├─ PDF Integrity Records
│  ├─ Push Subscriptions
│  ├─ Notifications
│  ├─ Document Imports (AI queue)
│  ├─ Document Video Attachments
│  └─ Disaster Recovery Executions
```

---

## Multi-Tenant Security Model

### Data Isolation Strategy
1. **Company ID Column**: All main tables have `company_id` for tenant association
2. **RLS Policies**: Restrictive policies enforce `company_id = current_company()` on critical tables
3. **Soft Deletes**: `deleted_at` column for logical deletion without data loss
4. **Audit Trail**: Forensic trail event table maintains immutable history
5. **Digital Signatures**: PDF integrity records + signature verification

### RBAC Implementation
- Users → Profiles (simplified permissions) or User Roles → Roles (advanced RBAC)
- Permissions are composable via Role → Permission bridge tables
- Two-tier structure allows legacy (Profile) and modern (RBAC) coexistence

### Document Security
- File content stored separately from metadata (file_key → S3/storage)
- Hash-based integrity verification (SHA256)
- Watermarking support for sensitive documents
- Lifecycle management via retention policies
- Litigation hold flags prevent premature deletion

### Signature & Integrity
- Digital signatures stored with cryptographic verification
- Timestamp tokens from trusted authorities
- Forensic trail prevents post-event tampering (hash chain)
- GPS metadata for location-aware processes (EPI, APR evidence)

---

## Schema Statistics

**Total Entities:** 49 TypeORM entities  
**Total Tables:** 49+ database tables (including junction tables)  
**Relationships:**
- Foreign Keys: ~80+
- Many-to-Many: 7 (junction tables)
- One-to-Many: ~60+

**Indexes:** 50+ performance indexes + RLS policies  
**RLS Tables:** 11 tables with RLS enforced  
**Soft-Delete Tables:** ~15 tables with `deleted_at`

---

## Notes

- **Database Type:** PostgreSQL (primary) with SQLite support for development
- **ORM:** TypeORM with full TypeScript support
- **Timestamp Strategy:** UTC timestamps with CURRENT_TIMESTAMP defaults
- **Soft Deletes:** Using `deleted_at IS NULL` in WHERE clauses for logical deletion
- **UUID:** Standard across all primary keys
- **JSON Storage:** JSONB (PostgreSQL) for flexible schema, simple-json for SQLite fallback
- **Performance:** Indexes optimized for multi-tenant queries with company_id leading
- **Security:** RLS + RBAC + cryptographic hashing throughout

