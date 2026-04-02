-- ============================================================================
-- SGS SEGURANÇA - COMPLETE DATABASE SCHEMA (DDL)
-- ============================================================================
-- This is a reference DDL representation of the TypeORM entities
-- Generated from entity files analysis
-- Database: PostgreSQL (with SQLite fallback support)
-- Date: April 2, 2026
-- ============================================================================

-- ============================================================================
-- CORE MULTI-TENANT STRUCTURE
-- ============================================================================

-- Companies (Tenants)
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  razao_social VARCHAR NOT NULL,
  cnpj VARCHAR NOT NULL UNIQUE,
  endereco TEXT NOT NULL,
  responsavel VARCHAR NOT NULL,
  email_contato TEXT,
  logo_url TEXT,
  status BOOLEAN DEFAULT TRUE,
  pt_approval_rules JSONB,
  alert_settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_companies_cnpj ON companies(cnpj) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_active ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_razao_social_trgm ON companies USING gin(razao_social gin_trgm_ops);
CREATE INDEX idx_companies_responsavel_trgm ON companies USING gin(responsavel gin_trgm_ops);
CREATE INDEX idx_companies_cnpj_trgm ON companies USING gin(cnpj gin_trgm_ops);

-- Sites (Work locations)
CREATE TABLE sites (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  local VARCHAR,
  endereco VARCHAR,
  cidade VARCHAR,
  estado VARCHAR,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_sites_company ON sites(company_id);

-- ============================================================================
-- AUTHENTICATION & AUTHORIZATION
-- ============================================================================

-- Profiles (Access control templates)
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  permissoes JSONB,
  status BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Users (Employees/Workers)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  cpf VARCHAR UNIQUE,
  email VARCHAR UNIQUE,
  funcao VARCHAR,
  password VARCHAR,
  signature_pin_hash VARCHAR,
  signature_pin_salt VARCHAR,
  status BOOLEAN DEFAULT TRUE,
  ai_processing_consent BOOLEAN DEFAULT FALSE,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email_unique ON users(LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_company_status ON users(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_company_created ON users(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_cpf ON users(cpf);
CREATE INDEX idx_users_nome_trgm ON users USING gin(nome gin_trgm_ops);
CREATE INDEX idx_users_cpf_trgm ON users USING gin(cpf gin_trgm_ops) WHERE cpf IS NOT NULL;

-- RBAC: Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  description TEXT
);

-- RBAC: Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  description TEXT
);

-- RBAC: User Roles (Bridge)
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- RBAC: Role Permissions (Bridge)
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- User Sessions
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  ip VARCHAR NOT NULL,
  device VARCHAR,
  country VARCHAR,
  state VARCHAR,
  city VARCHAR,
  token_hash VARCHAR,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active, expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_token_hash ON user_sessions(token_hash) WHERE is_active = TRUE;

-- ============================================================================
-- HEALTH & SAFETY CORE TABLES
-- ============================================================================

-- Trainings (Mandatory certifications)
CREATE TABLE trainings (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  nr_codigo VARCHAR,
  carga_horaria INTEGER,
  obrigatorio_para_funcao BOOLEAN DEFAULT TRUE,
  bloqueia_operacao_quando_vencido BOOLEAN DEFAULT TRUE,
  data_conclusao TIMESTAMP NOT NULL,
  data_vencimento TIMESTAMP NOT NULL,
  certificado_url VARCHAR,
  user_id UUID NOT NULL REFERENCES users(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  auditado_por_id UUID REFERENCES users(id),
  data_auditoria TIMESTAMP,
  resultado_auditoria VARCHAR,
  notas_auditoria TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_trainings_company_created ON trainings(company_id, created_at);

-- Medical Exams
CREATE TABLE medical_exams (
  id UUID PRIMARY KEY,
  tipo_exame VARCHAR NOT NULL,
  resultado VARCHAR NOT NULL,
  data_realizacao DATE NOT NULL,
  data_vencimento DATE,
  medico_responsavel VARCHAR,
  crm_medico VARCHAR,
  observacoes TEXT,
  user_id UUID NOT NULL REFERENCES users(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  auditado_por_id UUID REFERENCES users(id),
  data_auditoria TIMESTAMP,
  resultado_auditoria VARCHAR,
  notas_auditoria TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_medical_exams_company_created ON medical_exams(company_id, created_at);

-- EPIs (Personal Protective Equipment)
CREATE TABLE epis (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  ca VARCHAR,
  validade_ca DATE,
  descricao TEXT,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EPI Assignments
CREATE TABLE epi_assignments (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  epi_id UUID NOT NULL REFERENCES epis(id),
  user_id UUID NOT NULL REFERENCES users(id),
  site_id UUID REFERENCES sites(id),
  ca VARCHAR,
  validade_ca DATE,
  quantidade INTEGER DEFAULT 1,
  status VARCHAR DEFAULT 'entregue',
  entregue_em TIMESTAMP NOT NULL,
  devolvido_em TIMESTAMP,
  motivo_devolucao TEXT,
  observacoes TEXT,
  assinatura_entrega JSONB NOT NULL,
  assinatura_devolucao JSONB,
  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_epi_assignments_company_status ON epi_assignments(company_id, status);
CREATE INDEX idx_epi_assignments_company_user ON epi_assignments(company_id, user_id);
CREATE INDEX idx_epi_assignments_company_created ON epi_assignments(company_id, created_at);

-- ============================================================================
-- RISK ASSESSMENT TABLES
-- ============================================================================

-- Risks (Risk register)
CREATE TABLE risks (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  categoria VARCHAR NOT NULL,
  descricao TEXT,
  medidas_controle TEXT,
  probability INTEGER,
  severity INTEGER,
  exposure INTEGER,
  initial_risk INTEGER,
  residual_risk VARCHAR,
  control_hierarchy VARCHAR,
  evidence_photo TEXT,
  evidence_document TEXT,
  control_description TEXT,
  control_evidence BOOLEAN DEFAULT FALSE,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk History
CREATE TABLE risk_history (
  id UUID PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  changed_by VARCHAR,
  old_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activities
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  descricao TEXT,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Machines
CREATE TABLE machines (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  placa VARCHAR,
  horimetro_atual FLOAT DEFAULT 0,
  descricao TEXT,
  requisitos_seguranca TEXT,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tools
CREATE TABLE tools (
  id UUID PRIMARY KEY,
  nome VARCHAR NOT NULL,
  numero_serie VARCHAR,
  descricao TEXT,
  status BOOLEAN DEFAULT TRUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- RISK ANALYSIS PROCEDURES
-- ============================================================================

-- APRs (Análise Preliminar de Risco)
CREATE TABLE aprs (
  id UUID PRIMARY KEY,
  numero VARCHAR NOT NULL,
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status VARCHAR DEFAULT 'Pendente',
  is_modelo BOOLEAN DEFAULT FALSE,
  is_modelo_padrao BOOLEAN DEFAULT FALSE,
  itens_risco JSONB,
  probability INTEGER,
  severity INTEGER,
  exposure INTEGER,
  initial_risk INTEGER,
  residual_risk VARCHAR,
  evidence_photo TEXT,
  evidence_document TEXT,
  control_description TEXT,
  control_evidence BOOLEAN DEFAULT FALSE,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  elaborador_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IDX_aprs_company_created ON aprs(company_id, created_at DESC);
CREATE INDEX IDX_aprs_status_company ON aprs(status, company_id);
CREATE INDEX IDX_aprs_site_company ON aprs(site_id, company_id);
CREATE INDEX idx_aprs_company_updated_active ON aprs(company_id, updated_at DESC) WHERE deleted_at IS NULL;

-- APR Activities (Junction)
CREATE TABLE apr_activities (
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  PRIMARY KEY (apr_id, activity_id)
);

-- APR Risks (Junction)
CREATE TABLE apr_risks (
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  PRIMARY KEY (apr_id, risk_id)
);

-- APR EPIs (Junction)
CREATE TABLE apr_epis (
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  epi_id UUID NOT NULL REFERENCES epis(id) ON DELETE CASCADE,
  PRIMARY KEY (apr_id, epi_id)
);

-- APR Tools (Junction)
CREATE TABLE apr_tools (
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  PRIMARY KEY (apr_id, tool_id)
);

-- APR Machines (Junction)
CREATE TABLE apr_machines (
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  PRIMARY KEY (apr_id, machine_id)
);

-- APR Risk Items
CREATE TABLE apr_risk_items (
  id UUID PRIMARY KEY,
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  atividade TEXT,
  agente_ambiental TEXT,
  condicao_perigosa TEXT,
  fonte_circunstancia TEXT,
  lesao TEXT,
  probabilidade INTEGER,
  severidade INTEGER,
  score_risco INTEGER,
  categoria_risco VARCHAR,
  prioridade VARCHAR,
  medidas_prevencao TEXT,
  responsavel TEXT,
  prazo DATE,
  status_acao VARCHAR,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- APR Risk Evidences
CREATE TABLE apr_risk_evidences (
  id UUID PRIMARY KEY,
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  apr_risk_item_id UUID NOT NULL REFERENCES apr_risk_items(id) ON DELETE CASCADE,
  uploaded_by_id UUID REFERENCES users(id),
  file_key TEXT NOT NULL,
  original_name TEXT,
  mime_type VARCHAR NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  hash_sha256 VARCHAR NOT NULL,
  watermarked_file_key TEXT,
  watermarked_hash_sha256 VARCHAR,
  watermark_text TEXT,
  captured_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  accuracy_m NUMERIC(10,2),
  device_id VARCHAR,
  ip_address VARCHAR,
  exif_datetime TIMESTAMP,
  integrity_flags JSONB
);

-- APR Logs
CREATE TABLE apr_logs (
  id UUID PRIMARY KEY,
  apr_id UUID NOT NULL REFERENCES aprs(id) ON DELETE CASCADE,
  usuario_id UUID,
  acao VARCHAR(100) NOT NULL,
  metadata JSONB,
  data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- WORK PERMITS & AUTHORIZATION
-- ============================================================================

-- PTs (Permissão de Trabalho)
CREATE TABLE pts (
  id UUID PRIMARY KEY,
  numero VARCHAR NOT NULL,
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  data_hora_inicio TIMESTAMP NOT NULL,
  data_hora_fim TIMESTAMP NOT NULL,
  status VARCHAR DEFAULT 'Pendente',
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  apr_id UUID REFERENCES aprs(id),
  responsavel_id UUID NOT NULL REFERENCES users(id),
  trabalho_altura BOOLEAN DEFAULT FALSE,
  espaco_confinado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IDX_pts_company_created ON pts(company_id, created_at);
CREATE INDEX idx_pts_company_updated_active ON pts(company_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_pts_company_status_active ON pts(company_id, status) WHERE deleted_at IS NULL;

-- PT Executantes (Workers assigned to PT)
CREATE TABLE pt_executantes (
  pt_id UUID NOT NULL REFERENCES pts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (pt_id, user_id)
);

-- ============================================================================
-- DAILY SAFETY & REPORTS
-- ============================================================================

-- DDSs (Diálogo Diário de Segurança)
CREATE TABLE dds (
  id UUID PRIMARY KEY,
  tema VARCHAR NOT NULL,
  conteudo TEXT,
  data DATE NOT NULL,
  is_modelo BOOLEAN DEFAULT FALSE,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  facilitador_id UUID NOT NULL REFERENCES users(id),
  auditado_por_id UUID REFERENCES users(id),
  data_auditoria TIMESTAMP,
  resultado_auditoria VARCHAR,
  notas_auditoria TEXT,
  pdf_file_key TEXT,
  pdf_folder_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IDX_dds_company_created ON dds(company_id, created_at);

-- DDS Participants
CREATE TABLE dds_participants (
  dds_id UUID NOT NULL REFERENCES dds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (dds_id, user_id)
);

-- RDOs (Diário de Obra)
CREATE TABLE rdos (
  id UUID PRIMARY KEY,
  numero VARCHAR NOT NULL,
  data DATE NOT NULL,
  status VARCHAR DEFAULT 'rascunho',
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  responsavel_id UUID REFERENCES users(id),
  clima_manha VARCHAR,
  clima_tarde VARCHAR,
  temperatura_min DECIMAL(5,1),
  temperatura_max DECIMAL(5,1),
  mao_de_obra JSONB,
  equipamentos JSONB,
  materiais JSONB,
  servicos JSONB,
  ocorrencias JSONB,
  observacoes_gerais TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX UQ_rdos_company_numero ON rdos(company_id, numero);

-- RDO Audit Events
CREATE TABLE rdo_audit_events (
  id UUID PRIMARY KEY,
  rdo_id UUID NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rdo_audit_events_rdo_created ON rdo_audit_events(rdo_id, created_at);

-- ============================================================================
-- INSPECTIONS & ASSESSMENTS
-- ============================================================================

-- Inspections
CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  setor_area VARCHAR NOT NULL,
  tipo_inspecao VARCHAR NOT NULL,
  data_inspecao DATE NOT NULL,
  horario VARCHAR NOT NULL,
  responsavel_id UUID NOT NULL REFERENCES users(id),
  objetivo TEXT,
  descricao_local_atividades TEXT,
  metodologia JSONB,
  perigos_riscos JSONB,
  plano_acao JSONB,
  evidencias JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_inspections_company_updated ON inspections(company_id, updated_at DESC);

-- Checklists
CREATE TABLE checklists (
  id UUID PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  equipamento VARCHAR,
  maquina VARCHAR,
  foto_equipamento TEXT,
  data DATE NOT NULL,
  status VARCHAR DEFAULT 'Pendente',
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  inspetor_id UUID REFERENCES users(id),
  itens JSONB,
  is_modelo BOOLEAN DEFAULT FALSE,
  template_id UUID REFERENCES checklists(id),
  ativo BOOLEAN DEFAULT TRUE,
  categoria VARCHAR,
  periodicidade VARCHAR,
  nivel_risco_padrao VARCHAR,
  auditado_por_id UUID REFERENCES users(id),
  data_auditoria TIMESTAMP,
  resultado_auditoria VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_checklists_company_updated_active ON checklists(company_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_checklists_company_status_active ON checklists(company_id, status) WHERE deleted_at IS NULL;

-- ============================================================================
-- COMPLIANCE & AUDITING
-- ============================================================================

-- Audits
CREATE TABLE audits (
  id UUID PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  data_auditoria DATE NOT NULL,
  tipo_auditoria VARCHAR NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  auditor_id UUID NOT NULL REFERENCES users(id),
  representantes_empresa TEXT,
  objetivo TEXT,
  escopo TEXT,
  referencias JSONB,
  metodologia TEXT,
  caracterizacao JSONB,
  documentos_avaliados JSONB,
  resultados_conformidades JSONB,
  resultados_nao_conformidades JSONB,
  resultados_observacoes JSONB,
  resultados_oportunidades JSONB,
  avaliacao_riscos JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_audits_company_updated_active ON audits(company_id, updated_at DESC) WHERE deleted_at IS NULL;

-- Non-Conformities
CREATE TABLE nonconformities (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  codigo_nc VARCHAR NOT NULL,
  tipo VARCHAR NOT NULL,
  data_identificacao DATE NOT NULL,
  local_setor_area VARCHAR NOT NULL,
  atividade_envolvida VARCHAR NOT NULL,
  responsavel_area VARCHAR NOT NULL,
  auditor_responsavel VARCHAR NOT NULL,
  classificacao JSONB,
  descricao TEXT NOT NULL,
  evidencia_observada TEXT NOT NULL,
  condicao_insegura TEXT NOT NULL,
  ato_inseguro TEXT,
  requisito_nr VARCHAR NOT NULL,
  requisito_item VARCHAR NOT NULL,
  requisito_procedimento VARCHAR,
  requisito_politica VARCHAR,
  risco_perigo VARCHAR NOT NULL,
  risco_associado VARCHAR NOT NULL,
  risco_consequencias JSONB,
  risco_nivel VARCHAR NOT NULL,
  causa JSONB,
  causa_outro VARCHAR,
  acao_imediata_descricao TEXT,
  acao_imediata_data DATE,
  acao_imediata_responsavel VARCHAR,
  acao_imediata_status VARCHAR,
  closed_at TIMESTAMP,
  closed_resolution_type VARCHAR,
  closed_resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX UQ_nonconformities_company_codigo_nc_active ON nonconformities(company_id, codigo_nc) WHERE deleted_at IS NULL;
CREATE INDEX idx_nonconformities_company_updated_active ON nonconformities(company_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_nonconformities_company_status_active ON nonconformities(company_id, status) WHERE deleted_at IS NULL;

-- Corrective Actions
CREATE TABLE corrective_actions (
  id UUID PRIMARY KEY,
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  source_type VARCHAR DEFAULT 'manual',
  source_id UUID,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  responsible_user_id UUID REFERENCES users(id),
  responsible_name VARCHAR,
  due_date DATE NOT NULL,
  status VARCHAR DEFAULT 'open',
  priority VARCHAR DEFAULT 'medium',
  sla_days INTEGER,
  evidence_notes TEXT,
  evidence_files JSONB,
  last_reminder_at TIMESTAMP,
  escalation_level INTEGER DEFAULT 0,
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CATs (Comunicação de Acidente do Trabalho)
CREATE TABLE cats (
  id UUID PRIMARY KEY,
  numero VARCHAR NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  site_id UUID REFERENCES sites(id),
  worker_id UUID REFERENCES users(id),
  data_ocorrencia DATE NOT NULL,
  tipo VARCHAR DEFAULT 'tipico',
  gravidade VARCHAR DEFAULT 'moderada',
  descricao TEXT NOT NULL,
  local_ocorrencia TEXT,
  pessoas_envolvidas JSONB,
  acao_imediata TEXT,
  investigacao_detalhes TEXT,
  causa_raiz TEXT,
  plano_acao_fechamento TEXT,
  status VARCHAR DEFAULT 'aberta',
  attachments JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_cats_company_numero ON cats(company_id, numero);
CREATE INDEX idx_cats_company_status ON cats(company_id, status);
CREATE INDEX idx_cats_company_created ON cats(company_id, created_at);
CREATE INDEX idx_cats_worker ON cats(worker_id);

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

-- Contracts
CREATE TABLE contracts (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  number VARCHAR,
  contractor_name VARCHAR,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Orders
CREATE TABLE service_orders (
  id UUID PRIMARY KEY,
  numero VARCHAR NOT NULL,
  titulo VARCHAR NOT NULL,
  descricao_atividades TEXT NOT NULL,
  riscos_identificados JSONB,
  epis_necessarios JSONB,
  responsabilidades TEXT,
  status VARCHAR DEFAULT 'ativo',
  data_emissao DATE NOT NULL,
  data_inicio DATE,
  data_fim_previsto DATE,
  responsavel_id UUID REFERENCES users(id),
  site_id UUID REFERENCES sites(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  assinatura_responsavel TEXT,
  assinatura_colaborador TEXT,
  pdf_file_key VARCHAR,
  pdf_folder_path VARCHAR,
  pdf_original_name VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX UQ_service_orders_company_numero ON service_orders(company_id, numero);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  estatisticas JSONB NOT NULL,
  analise_gandra TEXT,
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DOCUMENT & FILE MANAGEMENT
-- ============================================================================

-- Document Registry
CREATE TABLE document_registry (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  module VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) DEFAULT 'pdf',
  entity_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  document_date TIMESTAMP,
  iso_year INTEGER NOT NULL,
  iso_week INTEGER NOT NULL,
  file_key TEXT NOT NULL,
  folder_path TEXT,
  original_name TEXT,
  mime_type VARCHAR,
  file_hash VARCHAR,
  document_code VARCHAR,
  status VARCHAR DEFAULT 'ACTIVE',
  litigation_hold BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP,
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IDX_document_registry_company_week ON document_registry(company_id, iso_year, iso_week);
CREATE INDEX IDX_document_registry_module_entity ON document_registry(module, entity_id);
CREATE INDEX IDX_document_registry_company_status_expiry ON document_registry(company_id, status, expires_at);

-- Document Imports (AI processing queue)
CREATE TABLE document_imports (
  id UUID PRIMARY KEY,
  empresa_id UUID NOT NULL,
  tipo_documento VARCHAR(50),
  nome_arquivo VARCHAR(255),
  hash VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128),
  tamanho INTEGER,
  mime_type VARCHAR(120),
  texto_extraido TEXT,
  arquivo_staging BYTEA,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX UQ_document_imports_empresa_hash ON document_imports(empresa_id, hash);
CREATE UNIQUE INDEX UQ_document_imports_empresa_idempotency_key ON document_imports(empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Document Video Attachments
CREATE TABLE document_video_attachments (
  id UUID PRIMARY KEY,
  company_id VARCHAR(120) NOT NULL,
  module VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_id VARCHAR(120) NOT NULL,
  original_name TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_id VARCHAR,
  uploaded_at TIMESTAMP NOT NULL,
  duration_seconds INTEGER,
  processing_status VARCHAR DEFAULT 'ready',
  availability VARCHAR DEFAULT 'stored',
  removed_at TIMESTAMP,
  removed_by_id VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_document_video_company_module_document_created ON document_video_attachments(company_id, module, document_id, created_at);
CREATE INDEX IDX_document_video_company_module_document_removed ON document_video_attachments(company_id, module, document_id, removed_at);
CREATE INDEX IDX_document_video_storage_key ON document_video_attachments(storage_key);

-- Signatures
CREATE TABLE signatures (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  document_id VARCHAR NOT NULL,
  document_type VARCHAR NOT NULL,
  signature_data TEXT NOT NULL,
  type VARCHAR NOT NULL,
  company_id VARCHAR,
  signature_hash VARCHAR,
  timestamp_token VARCHAR,
  timestamp_authority VARCHAR,
  signed_at TIMESTAMP,
  integrity_payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- PDF Integrity Records
CREATE TABLE pdf_integrity_records (
  id UUID PRIMARY KEY,
  hash VARCHAR(64) NOT NULL UNIQUE,
  original_name TEXT,
  signed_by_user_id VARCHAR,
  company_id VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- COMMUNICATION & LOGGING
-- ============================================================================

-- Mail Logs
CREATE TABLE mail_logs (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  to VARCHAR NOT NULL,
  subject VARCHAR NOT NULL,
  filename VARCHAR NOT NULL,
  message_id VARCHAR,
  accepted JSONB,
  rejected JSONB,
  provider_response TEXT,
  using_test_account BOOLEAN DEFAULT FALSE,
  status VARCHAR NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  userId VARCHAR NOT NULL,
  user_id VARCHAR,
  action VARCHAR NOT NULL,
  entity VARCHAR NOT NULL,
  entity_type VARCHAR,
  entityId VARCHAR NOT NULL,
  entity_id VARCHAR,
  changes JSONB,
  before JSONB,
  after JSONB,
  ip VARCHAR NOT NULL,
  userAgent VARCHAR,
  companyId VARCHAR NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP
);

CREATE INDEX idx_audit_logs_entity_date ON audit_logs(entity_type, entity_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_company_date ON audit_logs(companyId, timestamp DESC) WHERE companyId IS NOT NULL;

-- Forensic Trail Events
CREATE TABLE forensic_trail_events (
  id UUID PRIMARY KEY,
  stream_key VARCHAR(255) NOT NULL,
  stream_sequence INTEGER NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  entity_id VARCHAR(120) NOT NULL,
  company_id VARCHAR(120),
  user_id VARCHAR(120),
  request_id VARCHAR(120),
  ip VARCHAR,
  user_agent TEXT,
  metadata JSONB,
  previous_event_hash VARCHAR(64),
  event_hash VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX UQ_forensic_trail_events_stream_sequence ON forensic_trail_events(stream_key, stream_sequence);
CREATE UNIQUE INDEX UQ_forensic_trail_events_event_hash ON forensic_trail_events(event_hash);
CREATE INDEX IDX_forensic_trail_events_company_module_entity_created ON forensic_trail_events(company_id, module, entity_id, created_at);

-- Push Subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  userId VARCHAR NOT NULL,
  endpoint VARCHAR NOT NULL,
  keys JSONB NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  userId VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  readAt TIMESTAMP
);

-- ============================================================================
-- ANALYTICS & CACHING
-- ============================================================================

-- Monthly Snapshots (Dashboard cache)
CREATE TABLE monthly_snapshots (
  id UUID PRIMARY KEY,
  month VARCHAR NOT NULL,
  site_id UUID NOT NULL,
  company_id UUID NOT NULL,
  risk_score NUMERIC(10,2) DEFAULT 0,
  nc_count INTEGER DEFAULT 0,
  training_compliance NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Interactions
CREATE TABLE ai_interactions (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  question TEXT NOT NULL,
  response JSONB,
  tools_called JSONB,
  status VARCHAR DEFAULT 'SUCCESS',
  error_message TEXT,
  model VARCHAR,
  provider VARCHAR,
  latency_ms INTEGER,
  token_usage_input INTEGER,
  token_usage_output INTEGER,
  estimated_cost_usd NUMERIC,
  confidence VARCHAR,
  needs_human_review BOOLEAN,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_ai_interactions_tenant_created ON ai_interactions(tenant_id, created_at);
CREATE INDEX IDX_ai_interactions_tenant_user_created ON ai_interactions(tenant_id, user_id, created_at);

-- ============================================================================
-- POLICIES & CONFIGURATION
-- ============================================================================

-- Tenant Document Policies
CREATE TABLE tenant_document_policies (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  retention_days_apr INTEGER DEFAULT 2555,
  retention_days_dds INTEGER DEFAULT 1825,
  retention_days_pts INTEGER DEFAULT 2555,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disaster Recovery Executions
CREATE TABLE disaster_recovery_executions (
  id UUID PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  environment VARCHAR(50) NOT NULL,
  target_environment VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  trigger_source VARCHAR(50) NOT NULL,
  requested_by_user_id VARCHAR,
  backup_name VARCHAR,
  artifact_path TEXT,
  artifact_storage_key TEXT,
  error_message TEXT,
  metadata JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_dr_execution_operation_environment_started ON disaster_recovery_executions(operation_type, environment, started_at);
CREATE INDEX IDX_dr_execution_status_started ON disaster_recovery_executions(status, started_at);

-- ============================================================================
-- RLS POLICY SETUP (PostgreSQL specific)
-- ============================================================================

-- Enable RLS on critical tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cats ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE apr_risk_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_video_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_trail_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_integrity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshots ENABLE ROW LEVEL SECURITY;

-- Force RLS application
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE document_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE cats FORCE ROW LEVEL SECURITY;
ALTER TABLE signatures FORCE ROW LEVEL SECURITY;
ALTER TABLE apr_risk_evidences FORCE ROW LEVEL SECURITY;
ALTER TABLE document_video_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE forensic_trail_events FORCE ROW LEVEL SECURITY;
ALTER TABLE pdf_integrity_records FORCE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshots FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (Summary)
-- ============================================================================

-- Most foreign keys are defined inline in CREATE TABLE statements
-- Key constraint patterns:
-- - All main tables → companies (multi-tenant)
-- - Operational tables → sites (location)
-- - Operational tables → users (responsibility)
-- - APR → risks, activities, epis, tools, machines via junction tables
-- - PT → APR (optional)
-- - Audit tables → audits, nonconformities, etc.

-- ============================================================================
-- CREATE EXTENSION FOR TEXT SEARCH (if not already created)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Soft Deletes: Tables with 'deleted_at' use logical deletion (WHERE deleted_at IS NULL)
-- 2. Timestamps: All timestamps use UTC by default
-- 3. UUIDs: Primary keys are UUID v4
-- 4. Multi-tenant: All operational tables have company_id for isolation
-- 5. RLS: Restrictive policies enforce company_id = current_user's_company
-- 6. Indexes: Optimized for multi-tenant query patterns (company_id leading)
-- 7. JSONB: Used for flexible schema elements (approval rules, alert settings, etc.)
-- 8. Junction tables: Used for many-to-many relationships (apr_activities, apr_risks, etc.)

