-- ==========================================================================
-- SGS SEGURANCA - SUPABASE BASELINE MIGRATION
-- ==========================================================================
-- Fonte: export saneado de temp/supabase-migration/schema.sql
-- Objetivo: estabelecer o baseline oficial versionado do schema public.
-- Regras:
--   1. Novas mudancas estruturais entram sempre como migrations incrementais.
--   2. Este baseline nao deve ser reaplicado diretamente em producao ja populada.
--   3. A coluna public.users.password permanece apenas por compatibilidade legada.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT extensions.uuid_generate_v4();
$$;

--
-- PostgreSQL database dump
--




--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: document_registry_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_registry_status_enum AS ENUM (
    'ACTIVE',
    'EXPIRED'
);


--
-- Name: current_company(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_company() RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
      DECLARE
        v text;
      BEGIN
        -- Preferir a chave atual
        v := current_setting('app.current_company_id', true);
        IF v IS NULL OR v = '' THEN
          -- Compat: nome alternativo usado em alguns exemplos
          v := current_setting('app.current_company', true);
        END IF;
        IF v IS NULL OR v = '' THEN
          RETURN NULL;
        END IF;
        RETURN v::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$;


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$;


--
-- Name: prevent_forensic_trail_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_forensic_trail_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RAISE EXCEPTION 'forensic_trail_events is append-only';
      END;
      $$;




--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    descricao text,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.activities FORCE ROW LEVEL SECURITY;


--
-- Name: ai_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying NOT NULL,
    user_id character varying NOT NULL,
    question text NOT NULL,
    response json,
    tools_called json,
    status character varying DEFAULT 'success'::character varying NOT NULL,
    error_message text,
    tokens_used integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    model character varying,
    provider character varying,
    latency_ms integer,
    token_usage_input integer,
    token_usage_output integer,
    estimated_cost_usd numeric(12,8),
    confidence character varying,
    needs_human_review boolean,
    human_review_reasons json,
    human_review_reason text
);

ALTER TABLE ONLY public.ai_interactions FORCE ROW LEVEL SECURITY;


--
-- Name: apr_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_activities (
    apr_id uuid NOT NULL,
    activity_id uuid NOT NULL
);


--
-- Name: apr_epis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_epis (
    apr_id uuid NOT NULL,
    epi_id uuid NOT NULL
);


--
-- Name: apr_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    apr_id uuid NOT NULL,
    usuario_id uuid,
    acao character varying(100) NOT NULL,
    metadata jsonb,
    data_hora timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: apr_machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_machines (
    apr_id uuid NOT NULL,
    machine_id uuid NOT NULL
);


--
-- Name: apr_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_participants (
    apr_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: apr_risk_evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_risk_evidences (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    apr_id uuid NOT NULL,
    apr_risk_item_id uuid NOT NULL,
    uploaded_by_id uuid,
    file_key text NOT NULL,
    original_name text,
    mime_type character varying(100) NOT NULL,
    file_size_bytes integer NOT NULL,
    hash_sha256 character varying(64) NOT NULL,
    watermarked_file_key text,
    watermarked_hash_sha256 character varying(64),
    watermark_text text,
    captured_at timestamp without time zone,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    accuracy_m numeric(10,2),
    device_id character varying(120),
    ip_address character varying(64),
    exif_datetime timestamp without time zone,
    integrity_flags jsonb
);

ALTER TABLE ONLY public.apr_risk_evidences FORCE ROW LEVEL SECURITY;


--
-- Name: apr_risk_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_risk_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    apr_id uuid NOT NULL,
    atividade text,
    agente_ambiental text,
    condicao_perigosa text,
    fonte_circunstancia text,
    lesao text,
    probabilidade integer,
    severidade integer,
    score_risco integer,
    categoria_risco character varying(40),
    prioridade character varying(40),
    medidas_prevencao text,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    responsavel text,
    prazo date,
    status_acao character varying(60)
);


--
-- Name: apr_risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_risks (
    apr_id uuid NOT NULL,
    risk_id uuid NOT NULL
);


--
-- Name: apr_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apr_tools (
    apr_id uuid NOT NULL,
    tool_id uuid NOT NULL
);


--
-- Name: aprs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aprs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    numero character varying NOT NULL,
    titulo character varying NOT NULL,
    descricao text,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    status character varying DEFAULT 'Pendente'::character varying NOT NULL,
    is_modelo boolean DEFAULT false NOT NULL,
    is_modelo_padrao boolean DEFAULT false NOT NULL,
    itens_risco jsonb,
    company_id uuid NOT NULL,
    site_id uuid NOT NULL,
    elaborador_id uuid NOT NULL,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    versao integer DEFAULT 1 NOT NULL,
    parent_apr_id uuid,
    aprovado_por_id uuid,
    aprovado_em timestamp without time zone,
    aprovado_motivo text,
    reprovado_por_id uuid,
    reprovado_em timestamp without time zone,
    reprovado_motivo text,
    classificacao_resumo jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    probability integer,
    severity integer,
    exposure integer,
    initial_risk integer,
    residual_risk character varying,
    evidence_photo text,
    evidence_document text,
    control_description text,
    control_evidence boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone
);

ALTER TABLE ONLY public.aprs FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" character varying NOT NULL,
    action character varying NOT NULL,
    entity character varying NOT NULL,
    "entityId" character varying NOT NULL,
    changes jsonb,
    ip character varying NOT NULL,
    "userAgent" character varying,
    "companyId" character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    user_id character varying,
    entity_type character varying,
    entity_id character varying,
    before jsonb,
    after jsonb,
    created_at timestamp without time zone
);


--
-- Name: audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audits (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    titulo character varying NOT NULL,
    data_auditoria date NOT NULL,
    tipo_auditoria character varying NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid NOT NULL,
    auditor_id uuid NOT NULL,
    representantes_empresa text,
    objetivo text,
    escopo text,
    referencias json,
    metodologia text,
    caracterizacao json,
    documentos_avaliados json,
    resultados_conformidades json,
    resultados_nao_conformidades json,
    resultados_observacoes json,
    resultados_oportunidades json,
    avaliacao_riscos json,
    plano_acao json,
    conclusao text,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);

ALTER TABLE ONLY public.audits FORCE ROW LEVEL SECURITY;


--
-- Name: cats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    numero character varying NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid,
    contract_id uuid,
    worker_id uuid,
    data_ocorrencia timestamp without time zone NOT NULL,
    tipo character varying DEFAULT 'tipico'::character varying NOT NULL,
    gravidade character varying DEFAULT 'moderada'::character varying NOT NULL,
    descricao text NOT NULL,
    local_ocorrencia text,
    pessoas_envolvidas jsonb,
    acao_imediata text,
    investigacao_detalhes text,
    causa_raiz text,
    plano_acao_fechamento text,
    licoes_aprendidas text,
    status character varying DEFAULT 'aberta'::character varying NOT NULL,
    opened_by_id uuid,
    investigated_by_id uuid,
    closed_by_id uuid,
    opened_at timestamp without time zone,
    investigated_at timestamp without time zone,
    closed_at timestamp without time zone,
    attachments jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    pdf_file_key character varying,
    pdf_folder_path character varying,
    pdf_original_name character varying,
    pdf_file_hash character varying,
    pdf_generated_at timestamp without time zone
);

ALTER TABLE ONLY public.cats FORCE ROW LEVEL SECURITY;


--
-- Name: checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    titulo character varying NOT NULL,
    descricao text,
    equipamento character varying,
    maquina character varying,
    foto_equipamento text,
    data date NOT NULL,
    status character varying DEFAULT 'Pendente'::character varying NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid,
    inspetor_id uuid,
    itens jsonb,
    is_modelo boolean DEFAULT false NOT NULL,
    template_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    categoria character varying,
    periodicidade character varying,
    nivel_risco_padrao character varying,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);

ALTER TABLE ONLY public.checklists FORCE ROW LEVEL SECURITY;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    razao_social character varying NOT NULL,
    cnpj character varying NOT NULL,
    endereco text NOT NULL,
    responsavel character varying NOT NULL,
    logo_url text,
    status boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    pt_approval_rules jsonb DEFAULT '{"requireAtLeastOneExecutante": false, "blockCriticalRiskWithoutEvidence": true, "blockWorkerWithoutValidMedicalExam": true, "blockWorkerWithExpiredBlockingTraining": true}'::jsonb,
    alert_settings jsonb DEFAULT '{"enabled": true, "recipients": [], "includeWhatsapp": false}'::jsonb,
    email_contato text
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    number character varying(100),
    contractor_name character varying(255),
    description text,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.contracts FORCE ROW LEVEL SECURITY;


--
-- Name: corrective_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corrective_actions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying NOT NULL,
    description text NOT NULL,
    source_type character varying DEFAULT 'manual'::character varying NOT NULL,
    source_id character varying,
    company_id uuid NOT NULL,
    site_id uuid,
    responsible_user_id uuid,
    responsible_name character varying,
    due_date date NOT NULL,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    priority character varying DEFAULT 'medium'::character varying NOT NULL,
    sla_days integer,
    evidence_notes text,
    evidence_files jsonb,
    last_reminder_at timestamp without time zone,
    escalation_level integer DEFAULT 0 NOT NULL,
    closed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.corrective_actions FORCE ROW LEVEL SECURITY;


--
-- Name: dds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dds (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tema character varying NOT NULL,
    conteudo text,
    data date NOT NULL,
    is_modelo boolean DEFAULT false NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid NOT NULL,
    facilitador_id uuid NOT NULL,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying DEFAULT 'rascunho'::character varying NOT NULL,
    deleted_at timestamp without time zone
);

ALTER TABLE ONLY public.dds FORCE ROW LEVEL SECURITY;


--
-- Name: dds_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dds_participants (
    dds_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: disaster_recovery_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disaster_recovery_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_type character varying(50) NOT NULL,
    scope character varying(20) NOT NULL,
    environment character varying(50) NOT NULL,
    target_environment character varying(50),
    status character varying(50) NOT NULL,
    trigger_source character varying(50) NOT NULL,
    requested_by_user_id character varying(120),
    backup_name character varying(180),
    artifact_path text,
    artifact_storage_key text,
    error_message text,
    metadata jsonb,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_imports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    empresa_id uuid NOT NULL,
    tipo_documento character varying(50),
    nome_arquivo character varying(255),
    hash character varying(64) NOT NULL,
    tamanho integer,
    texto_extraido text,
    json_estruturado jsonb,
    metadata jsonb,
    status character varying DEFAULT 'uploaded'::character varying NOT NULL,
    score_confianca numeric(5,2) DEFAULT 0 NOT NULL,
    data_documento date,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    mensagem_erro text,
    mime_type character varying(120),
    arquivo_staging bytea,
    processing_job_id character varying(128),
    processing_attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    dead_lettered_at timestamp with time zone,
    idempotency_key character varying(128)
);

ALTER TABLE ONLY public.document_imports FORCE ROW LEVEL SECURITY;


--
-- Name: document_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_registry (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    module character varying(50) NOT NULL,
    document_type character varying(50) DEFAULT 'pdf'::character varying NOT NULL,
    entity_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    document_date timestamp without time zone,
    iso_year integer NOT NULL,
    iso_week integer NOT NULL,
    file_key text NOT NULL,
    folder_path text,
    original_name text,
    mime_type character varying(120),
    file_hash character varying(128),
    document_code character varying(100),
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    status public.document_registry_status_enum DEFAULT 'ACTIVE'::public.document_registry_status_enum NOT NULL,
    litigation_hold boolean DEFAULT false NOT NULL,
    expires_at timestamp without time zone
);

ALTER TABLE ONLY public.document_registry FORCE ROW LEVEL SECURITY;


--
-- Name: document_video_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_video_attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id character varying(120) NOT NULL,
    module character varying(50) NOT NULL,
    document_type character varying(50) NOT NULL,
    document_id character varying(120) NOT NULL,
    original_name text NOT NULL,
    mime_type character varying(120) NOT NULL,
    size_bytes integer NOT NULL,
    file_hash character varying(64) NOT NULL,
    storage_key text NOT NULL,
    uploaded_by_id character varying(120),
    uploaded_at timestamp without time zone NOT NULL,
    duration_seconds integer,
    processing_status character varying(32) DEFAULT 'ready'::character varying NOT NULL,
    availability character varying(64) DEFAULT 'stored'::character varying NOT NULL,
    removed_at timestamp without time zone,
    removed_by_id character varying(120),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: epi_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epi_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    epi_id uuid NOT NULL,
    user_id uuid NOT NULL,
    site_id uuid,
    contract_id uuid,
    ca character varying,
    validade_ca date,
    quantidade integer DEFAULT 1 NOT NULL,
    status character varying DEFAULT 'entregue'::character varying NOT NULL,
    entregue_em timestamp without time zone NOT NULL,
    devolvido_em timestamp without time zone,
    motivo_devolucao text,
    observacoes text,
    assinatura_entrega jsonb NOT NULL,
    assinatura_devolucao jsonb,
    created_by_id uuid,
    updated_by_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.epi_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: epis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epis (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    ca character varying,
    validade_ca date,
    descricao text,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.epis FORCE ROW LEVEL SECURITY;


--
-- Name: forensic_trail_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_trail_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    stream_key character varying(255) NOT NULL,
    stream_sequence integer NOT NULL,
    event_type character varying(100) NOT NULL,
    module character varying(50) NOT NULL,
    entity_id character varying(120) NOT NULL,
    company_id character varying(120),
    user_id character varying(120),
    request_id character varying(120),
    ip character varying(120),
    user_agent text,
    metadata jsonb,
    previous_event_hash character varying(64),
    event_hash character varying(64) NOT NULL,
    occurred_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid NOT NULL,
    setor_area character varying NOT NULL,
    tipo_inspecao character varying NOT NULL,
    data_inspecao date NOT NULL,
    horario character varying NOT NULL,
    responsavel_id uuid NOT NULL,
    objetivo text,
    descricao_local_atividades text,
    metodologia json,
    perigos_riscos json,
    plano_acao json,
    evidencias json,
    conclusao text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.inspections FORCE ROW LEVEL SECURITY;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    placa character varying,
    horimetro_atual double precision DEFAULT 0 NOT NULL,
    descricao text,
    requisitos_seguranca text,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.machines FORCE ROW LEVEL SECURITY;


--
-- Name: mail_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid,
    user_id uuid,
    "to" character varying NOT NULL,
    subject character varying NOT NULL,
    filename character varying NOT NULL,
    message_id character varying,
    accepted jsonb,
    rejected jsonb,
    provider_response text,
    using_test_account boolean DEFAULT false NOT NULL,
    status character varying NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.mail_logs FORCE ROW LEVEL SECURITY;


--
-- Name: medical_exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_exams (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tipo_exame character varying NOT NULL,
    resultado character varying NOT NULL,
    data_realizacao date NOT NULL,
    data_vencimento date,
    medico_responsavel character varying,
    crm_medico character varying,
    observacoes text,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.medical_exams FORCE ROW LEVEL SECURITY;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: monthly_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_snapshots (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    month character varying NOT NULL,
    site_id uuid NOT NULL,
    company_id uuid NOT NULL,
    risk_score numeric(10,2) DEFAULT 0 NOT NULL,
    nc_count integer DEFAULT 0 NOT NULL,
    training_compliance numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: nonconformities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nonconformities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid,
    codigo_nc character varying NOT NULL,
    tipo character varying NOT NULL,
    data_identificacao date NOT NULL,
    local_setor_area character varying NOT NULL,
    atividade_envolvida character varying NOT NULL,
    responsavel_area character varying NOT NULL,
    auditor_responsavel character varying NOT NULL,
    classificacao json,
    descricao text NOT NULL,
    evidencia_observada text NOT NULL,
    condicao_insegura text NOT NULL,
    ato_inseguro text,
    requisito_nr character varying NOT NULL,
    requisito_item character varying NOT NULL,
    requisito_procedimento character varying,
    requisito_politica character varying,
    risco_perigo character varying NOT NULL,
    risco_associado character varying NOT NULL,
    risco_consequencias json,
    risco_nivel character varying NOT NULL,
    causa json,
    causa_outro character varying,
    acao_imediata_descricao text,
    acao_imediata_data date,
    acao_imediata_responsavel character varying,
    acao_imediata_status character varying,
    acao_definitiva_descricao text,
    acao_definitiva_prazo date,
    acao_definitiva_responsavel character varying,
    acao_definitiva_recursos text,
    acao_definitiva_data_prevista date,
    acao_preventiva_medidas text,
    acao_preventiva_treinamento text,
    acao_preventiva_revisao_procedimento text,
    acao_preventiva_melhoria_processo text,
    acao_preventiva_epc_epi text,
    verificacao_resultado character varying,
    verificacao_evidencias text,
    verificacao_data date,
    verificacao_responsavel character varying,
    status character varying NOT NULL,
    observacoes_gerais text,
    anexos json,
    assinatura_responsavel_area character varying,
    assinatura_tecnico_auditor character varying,
    assinatura_gestao character varying,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    closed_at timestamp without time zone,
    resolved_by uuid
);

ALTER TABLE ONLY public.nonconformities FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" character varying NOT NULL,
    type character varying NOT NULL,
    title character varying NOT NULL,
    message text NOT NULL,
    data jsonb,
    read boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "readAt" timestamp without time zone
);


--
-- Name: pdf_integrity_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_integrity_records (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    hash character varying(64) NOT NULL,
    original_name text,
    signed_by_user_id uuid,
    company_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    permissoes jsonb NOT NULL,
    status boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pt_executantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pt_executantes (
    pt_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: pts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    numero character varying NOT NULL,
    titulo character varying NOT NULL,
    descricao text,
    data_hora_inicio timestamp without time zone NOT NULL,
    data_hora_fim timestamp without time zone NOT NULL,
    status character varying DEFAULT 'Pendente'::character varying NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid NOT NULL,
    apr_id uuid,
    responsavel_id uuid NOT NULL,
    trabalho_altura boolean DEFAULT false NOT NULL,
    espaco_confinado boolean DEFAULT false NOT NULL,
    trabalho_quente boolean DEFAULT false NOT NULL,
    eletricidade boolean DEFAULT false NOT NULL,
    escavacao boolean DEFAULT false NOT NULL,
    trabalho_altura_checklist jsonb,
    trabalho_eletrico_checklist jsonb,
    trabalho_quente_checklist jsonb,
    trabalho_espaco_confinado_checklist jsonb,
    trabalho_escavacao_checklist jsonb,
    recomendacoes_gerais_checklist jsonb,
    analise_risco_rapida_checklist jsonb,
    analise_risco_rapida_observacoes text,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    aprovado_por_id uuid,
    aprovado_em timestamp without time zone,
    aprovado_motivo text,
    reprovado_por_id uuid,
    reprovado_em timestamp without time zone,
    reprovado_motivo text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    probability integer,
    severity integer,
    exposure integer,
    initial_risk integer,
    residual_risk character varying,
    evidence_photo text,
    evidence_document text,
    control_description text,
    control_evidence boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone
);

ALTER TABLE ONLY public.pts FORCE ROW LEVEL SECURITY;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" character varying NOT NULL,
    endpoint character varying NOT NULL,
    keys text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rdos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rdos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    numero character varying NOT NULL,
    data date NOT NULL,
    status character varying DEFAULT 'rascunho'::character varying NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid,
    responsavel_id uuid,
    clima_manha character varying,
    clima_tarde character varying,
    temperatura_min numeric(5,1),
    temperatura_max numeric(5,1),
    condicao_terreno character varying,
    mao_de_obra json,
    equipamentos json,
    materiais_recebidos json,
    servicos_executados json,
    ocorrencias json,
    houve_acidente boolean DEFAULT false NOT NULL,
    houve_paralisacao boolean DEFAULT false NOT NULL,
    motivo_paralisacao text,
    observacoes text,
    programa_servicos_amanha text,
    assinatura_responsavel text,
    assinatura_engenheiro text,
    pdf_file_key character varying,
    pdf_folder_path character varying,
    pdf_original_name character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.rdos FORCE ROW LEVEL SECURITY;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    titulo character varying NOT NULL,
    descricao text,
    mes integer NOT NULL,
    ano integer NOT NULL,
    estatisticas jsonb NOT NULL,
    analise_gandra text,
    company_id uuid NOT NULL,
    pdf_file_key text,
    pdf_folder_path text,
    pdf_original_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reports FORCE ROW LEVEL SECURITY;


--
-- Name: risk_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    risk_id uuid NOT NULL,
    changed_by character varying,
    old_value jsonb NOT NULL,
    new_value jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    categoria character varying NOT NULL,
    descricao text,
    medidas_controle text,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    probability integer,
    severity integer,
    exposure integer,
    initial_risk integer,
    residual_risk character varying,
    control_hierarchy character varying,
    evidence_photo text,
    evidence_document text,
    control_description text,
    control_evidence boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.risks FORCE ROW LEVEL SECURITY;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description text
);


--
-- Name: service_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    numero character varying NOT NULL,
    titulo character varying NOT NULL,
    descricao_atividades text NOT NULL,
    riscos_identificados json,
    epis_necessarios json,
    responsabilidades text,
    status character varying DEFAULT 'ativo'::character varying NOT NULL,
    data_emissao date NOT NULL,
    data_inicio date,
    data_fim_previsto date,
    responsavel_id uuid,
    site_id uuid,
    company_id uuid NOT NULL,
    assinatura_responsavel text,
    assinatura_colaborador text,
    pdf_file_key character varying,
    pdf_folder_path character varying,
    pdf_original_name character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.service_orders FORCE ROW LEVEL SECURITY;


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signatures (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    document_id character varying NOT NULL,
    document_type character varying NOT NULL,
    signature_data text NOT NULL,
    type character varying NOT NULL,
    company_id uuid,
    signature_hash character varying,
    timestamp_token character varying,
    timestamp_authority character varying,
    signed_at timestamp without time zone,
    integrity_payload jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.signatures FORCE ROW LEVEL SECURITY;


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    local character varying,
    endereco character varying,
    cidade character varying,
    estado character varying,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.sites FORCE ROW LEVEL SECURITY;


--
-- Name: system_theme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_theme (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    background_color character varying DEFAULT '#122318'::character varying NOT NULL,
    sidebar_color character varying DEFAULT '#0b1710'::character varying NOT NULL,
    card_color character varying DEFAULT '#183224'::character varying NOT NULL,
    primary_color character varying DEFAULT '#22c55e'::character varying NOT NULL,
    secondary_color character varying DEFAULT '#16a34a'::character varying NOT NULL,
    text_primary character varying DEFAULT '#e2e8f0'::character varying NOT NULL,
    text_secondary character varying DEFAULT '#b8c5d8'::character varying NOT NULL,
    success_color character varying DEFAULT '#4ade80'::character varying NOT NULL,
    warning_color character varying DEFAULT '#facc15'::character varying NOT NULL,
    danger_color character varying DEFAULT '#f87171'::character varying NOT NULL,
    info_color character varying DEFAULT '#60a5fa'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_document_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_document_policies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    retention_days_apr integer DEFAULT 1825 NOT NULL,
    retention_days_dds integer DEFAULT 730 NOT NULL,
    retention_days_pts integer DEFAULT 1825 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tenant_document_policies FORCE ROW LEVEL SECURITY;


--
-- Name: tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tools (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    numero_serie character varying,
    descricao text,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tools FORCE ROW LEVEL SECURITY;


--
-- Name: trainings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    nr_codigo character varying,
    carga_horaria integer,
    obrigatorio_para_funcao boolean DEFAULT true NOT NULL,
    bloqueia_operacao_quando_vencido boolean DEFAULT true NOT NULL,
    data_conclusao timestamp without time zone NOT NULL,
    data_vencimento timestamp without time zone NOT NULL,
    certificado_url character varying,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    auditado_por_id uuid,
    data_auditoria timestamp without time zone,
    resultado_auditoria character varying,
    notas_auditoria text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.trainings FORCE ROW LEVEL SECURITY;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    ip character varying NOT NULL,
    device character varying,
    country character varying,
    state character varying,
    city character varying,
    token_hash character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_active timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome character varying NOT NULL,
    cpf character varying,
    email character varying,
    funcao character varying,
    password character varying,
    status boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    site_id uuid,
    profile_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    signature_pin_hash character varying,
    signature_pin_salt character varying,
    ai_processing_consent boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: ai_interactions PK_ai_interactions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_interactions
    ADD CONSTRAINT "PK_ai_interactions" PRIMARY KEY (id);


--
-- Name: apr_activities PK_apr_activities; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_activities
    ADD CONSTRAINT "PK_apr_activities" PRIMARY KEY (apr_id, activity_id);


--
-- Name: apr_epis PK_apr_epis; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_epis
    ADD CONSTRAINT "PK_apr_epis" PRIMARY KEY (apr_id, epi_id);


--
-- Name: apr_machines PK_apr_machines; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_machines
    ADD CONSTRAINT "PK_apr_machines" PRIMARY KEY (apr_id, machine_id);


--
-- Name: apr_participants PK_apr_participants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_participants
    ADD CONSTRAINT "PK_apr_participants" PRIMARY KEY (apr_id, user_id);


--
-- Name: apr_risks PK_apr_risks; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risks
    ADD CONSTRAINT "PK_apr_risks" PRIMARY KEY (apr_id, risk_id);


--
-- Name: apr_tools PK_apr_tools; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_tools
    ADD CONSTRAINT "PK_apr_tools" PRIMARY KEY (apr_id, tool_id);


--
-- Name: dds_participants PK_dds_participants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds_participants
    ADD CONSTRAINT "PK_dds_participants" PRIMARY KEY (dds_id, user_id);


--
-- Name: disaster_recovery_executions PK_disaster_recovery_executions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disaster_recovery_executions
    ADD CONSTRAINT "PK_disaster_recovery_executions" PRIMARY KEY (id);


--
-- Name: document_video_attachments PK_document_video_attachments_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_video_attachments
    ADD CONSTRAINT "PK_document_video_attachments_id" PRIMARY KEY (id);


--
-- Name: forensic_trail_events PK_forensic_trail_events_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_trail_events
    ADD CONSTRAINT "PK_forensic_trail_events_id" PRIMARY KEY (id);


--
-- Name: pt_executantes PK_pt_executantes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pt_executantes
    ADD CONSTRAINT "PK_pt_executantes" PRIMARY KEY (pt_id, user_id);


--
-- Name: role_permissions PK_role_permissions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "PK_role_permissions" PRIMARY KEY (role_id, permission_id);


--
-- Name: user_roles PK_user_roles; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "PK_user_roles" PRIMARY KEY (user_id, role_id);


--
-- Name: document_registry UQ_document_registry_source; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_registry
    ADD CONSTRAINT "UQ_document_registry_source" UNIQUE (module, entity_id, document_type);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: apr_logs apr_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_logs
    ADD CONSTRAINT apr_logs_pkey PRIMARY KEY (id);


--
-- Name: apr_risk_evidences apr_risk_evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_evidences
    ADD CONSTRAINT apr_risk_evidences_pkey PRIMARY KEY (id);


--
-- Name: apr_risk_items apr_risk_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_items
    ADD CONSTRAINT apr_risk_items_pkey PRIMARY KEY (id);


--
-- Name: aprs aprs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT aprs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audits audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT audits_pkey PRIMARY KEY (id);


--
-- Name: cats cats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT cats_pkey PRIMARY KEY (id);


--
-- Name: checklists checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_pkey PRIMARY KEY (id);


--
-- Name: companies companies_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_cnpj_key UNIQUE (cnpj);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: corrective_actions corrective_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT corrective_actions_pkey PRIMARY KEY (id);


--
-- Name: dds dds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds
    ADD CONSTRAINT dds_pkey PRIMARY KEY (id);


--
-- Name: document_imports document_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_imports
    ADD CONSTRAINT document_imports_pkey PRIMARY KEY (id);


--
-- Name: document_registry document_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_registry
    ADD CONSTRAINT document_registry_pkey PRIMARY KEY (id);


--
-- Name: epi_assignments epi_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT epi_assignments_pkey PRIMARY KEY (id);


--
-- Name: epis epis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epis
    ADD CONSTRAINT epis_pkey PRIMARY KEY (id);


--
-- Name: inspections inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: mail_logs mail_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_logs
    ADD CONSTRAINT mail_logs_pkey PRIMARY KEY (id);


--
-- Name: medical_exams medical_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_exams
    ADD CONSTRAINT medical_exams_pkey PRIMARY KEY (id);


--
-- Name: monthly_snapshots monthly_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_snapshots
    ADD CONSTRAINT monthly_snapshots_pkey PRIMARY KEY (id);


--
-- Name: nonconformities nonconformities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nonconformities
    ADD CONSTRAINT nonconformities_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pdf_integrity_records pdf_integrity_records_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_integrity_records
    ADD CONSTRAINT pdf_integrity_records_hash_key UNIQUE (hash);


--
-- Name: pdf_integrity_records pdf_integrity_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_integrity_records
    ADD CONSTRAINT pdf_integrity_records_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: pts pts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT pts_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rdos rdos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rdos
    ADD CONSTRAINT rdos_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: risk_history risk_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_history
    ADD CONSTRAINT risk_history_pkey PRIMARY KEY (id);


--
-- Name: risks risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: service_orders service_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_pkey PRIMARY KEY (id);


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: system_theme system_theme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_theme
    ADD CONSTRAINT system_theme_pkey PRIMARY KEY (id);


--
-- Name: tenant_document_policies tenant_document_policies_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_document_policies
    ADD CONSTRAINT tenant_document_policies_company_id_key UNIQUE (company_id);


--
-- Name: tenant_document_policies tenant_document_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_document_policies
    ADD CONSTRAINT tenant_document_policies_pkey PRIMARY KEY (id);


--
-- Name: tools tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT tools_pkey PRIMARY KEY (id);


--
-- Name: trainings trainings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT trainings_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_cpf_key UNIQUE (cpf);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_ai_interactions_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ai_interactions_tenant_created" ON public.ai_interactions USING btree (tenant_id, created_at);


--
-- Name: IDX_ai_interactions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ai_interactions_tenant_id" ON public.ai_interactions USING btree (tenant_id);


--
-- Name: IDX_ai_interactions_tenant_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ai_interactions_tenant_review" ON public.ai_interactions USING btree (tenant_id, needs_human_review);


--
-- Name: IDX_ai_interactions_tenant_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ai_interactions_tenant_user_created" ON public.ai_interactions USING btree (tenant_id, user_id, created_at DESC);


--
-- Name: IDX_apr_logs_apr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_logs_apr_id" ON public.apr_logs USING btree (apr_id);


--
-- Name: IDX_apr_logs_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_logs_usuario_id" ON public.apr_logs USING btree (usuario_id);


--
-- Name: IDX_apr_risk_evidences_apr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_evidences_apr_id" ON public.apr_risk_evidences USING btree (apr_id);


--
-- Name: IDX_apr_risk_evidences_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_evidences_hash" ON public.apr_risk_evidences USING btree (hash_sha256);


--
-- Name: IDX_apr_risk_evidences_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_evidences_item_id" ON public.apr_risk_evidences USING btree (apr_risk_item_id);


--
-- Name: IDX_apr_risk_evidences_uploaded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_evidences_uploaded_at" ON public.apr_risk_evidences USING btree (uploaded_at);


--
-- Name: IDX_apr_risk_evidences_watermarked_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_evidences_watermarked_hash" ON public.apr_risk_evidences USING btree (watermarked_hash_sha256);


--
-- Name: IDX_apr_risk_items_apr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_items_apr_id" ON public.apr_risk_items USING btree (apr_id);


--
-- Name: IDX_apr_risk_items_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_items_categoria" ON public.apr_risk_items USING btree (categoria_risco);


--
-- Name: IDX_apr_risk_items_prioridade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_apr_risk_items_prioridade" ON public.apr_risk_items USING btree (prioridade);


--
-- Name: IDX_aprs_aprovado_por_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aprs_aprovado_por_id" ON public.aprs USING btree (aprovado_por_id);


--
-- Name: IDX_aprs_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aprs_company_created" ON public.aprs USING btree (company_id, created_at DESC);


--
-- Name: IDX_aprs_parent_apr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aprs_parent_apr_id" ON public.aprs USING btree (parent_apr_id);


--
-- Name: IDX_aprs_site_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aprs_site_company" ON public.aprs USING btree (site_id, company_id);


--
-- Name: IDX_aprs_status_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aprs_status_company" ON public.aprs USING btree (status, company_id);


--
-- Name: IDX_cats_company_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cats_company_created_at" ON public.cats USING btree (company_id, created_at);


--
-- Name: IDX_cats_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cats_company_status" ON public.cats USING btree (company_id, status);


--
-- Name: IDX_cats_company_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cats_company_worker" ON public.cats USING btree (company_id, worker_id);


--
-- Name: IDX_dds_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dds_company_created" ON public.dds USING btree (company_id, created_at);


--
-- Name: IDX_document_registry_company_hold; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_registry_company_hold" ON public.document_registry USING btree (company_id, litigation_hold);


--
-- Name: IDX_document_registry_company_status_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_registry_company_status_expiry" ON public.document_registry USING btree (company_id, status, expires_at);


--
-- Name: IDX_document_registry_company_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_registry_company_week" ON public.document_registry USING btree (company_id, iso_year, iso_week);


--
-- Name: IDX_document_registry_module_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_registry_module_entity" ON public.document_registry USING btree (module, entity_id);


--
-- Name: IDX_document_video_company_module_document_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_video_company_module_document_created" ON public.document_video_attachments USING btree (company_id, module, document_id, created_at);


--
-- Name: IDX_document_video_company_module_document_removed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_video_company_module_document_removed" ON public.document_video_attachments USING btree (company_id, module, document_id, removed_at);


--
-- Name: IDX_document_video_storage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_document_video_storage_key" ON public.document_video_attachments USING btree (storage_key);


--
-- Name: IDX_dr_execution_operation_environment_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dr_execution_operation_environment_started" ON public.disaster_recovery_executions USING btree (operation_type, environment, started_at);


--
-- Name: IDX_dr_execution_status_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dr_execution_status_started" ON public.disaster_recovery_executions USING btree (status, started_at);


--
-- Name: IDX_epi_assignments_company_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_epi_assignments_company_created_at" ON public.epi_assignments USING btree (company_id, created_at);


--
-- Name: IDX_epi_assignments_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_epi_assignments_company_status" ON public.epi_assignments USING btree (company_id, status);


--
-- Name: IDX_epi_assignments_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_epi_assignments_company_user" ON public.epi_assignments USING btree (company_id, user_id);


--
-- Name: IDX_forensic_trail_events_company_module_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_forensic_trail_events_company_module_entity_created" ON public.forensic_trail_events USING btree (company_id, module, entity_id, created_at);


--
-- Name: IDX_medical_exams_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_medical_exams_company_created" ON public.medical_exams USING btree (company_id, created_at);


--
-- Name: IDX_monthly_snapshots_company_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_monthly_snapshots_company_month" ON public.monthly_snapshots USING btree (company_id, month);


--
-- Name: IDX_pdf_integrity_records_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_pdf_integrity_records_company_created" ON public.pdf_integrity_records USING btree (company_id, created_at);


--
-- Name: IDX_pts_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_pts_company_created" ON public.pts USING btree (company_id, created_at);


--
-- Name: IDX_signatures_company_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_signatures_company_created_at" ON public.signatures USING btree (company_id, created_at DESC);


--
-- Name: IDX_trainings_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_trainings_company_created" ON public.trainings USING btree (company_id, created_at);


--
-- Name: IDX_trainings_company_user_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_trainings_company_user_vencimento" ON public.trainings USING btree (company_id, user_id, data_vencimento);


--
-- Name: IDX_trainings_company_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_trainings_company_vencimento" ON public.trainings USING btree (company_id, data_vencimento);


--
-- Name: UQ_cats_company_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_cats_company_numero" ON public.cats USING btree (company_id, numero);


--
-- Name: UQ_document_imports_empresa_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_document_imports_empresa_hash" ON public.document_imports USING btree (empresa_id, hash);


--
-- Name: UQ_document_imports_empresa_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_document_imports_empresa_idempotency_key" ON public.document_imports USING btree (empresa_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: UQ_document_registry_module_document_code_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_document_registry_module_document_code_ci" ON public.document_registry USING btree (module, upper((document_code)::text)) WHERE (document_code IS NOT NULL);


--
-- Name: UQ_forensic_trail_events_event_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_forensic_trail_events_event_hash" ON public.forensic_trail_events USING btree (event_hash);


--
-- Name: UQ_forensic_trail_events_stream_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_forensic_trail_events_stream_sequence" ON public.forensic_trail_events USING btree (stream_key, stream_sequence);


--
-- Name: UQ_nonconformities_company_codigo_nc_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_nonconformities_company_codigo_nc_active" ON public.nonconformities USING btree (company_id, codigo_nc) WHERE (deleted_at IS NULL);


--
-- Name: UQ_rdos_company_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_rdos_company_numero" ON public.rdos USING btree (company_id, numero);


--
-- Name: UQ_service_orders_company_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_service_orders_company_numero" ON public.service_orders USING btree (company_id, numero);


--
-- Name: idx_active_companies; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_companies ON public.companies USING btree (id) WHERE (status = true);


--
-- Name: idx_active_users; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_users ON public.users USING btree (id) WHERE (status = true);


--
-- Name: idx_activities_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_company_created ON public.activities USING btree (company_id, created_at DESC);


--
-- Name: idx_activities_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_company_id ON public.activities USING btree (company_id);


--
-- Name: idx_activities_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_company_status ON public.activities USING btree (company_id, status);


--
-- Name: idx_aprs_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_company_created ON public.aprs USING btree (company_id, created_at DESC);


--
-- Name: idx_aprs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_company_id ON public.aprs USING btree (company_id);


--
-- Name: idx_aprs_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_company_site ON public.aprs USING btree (company_id, site_id);


--
-- Name: idx_aprs_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_company_status ON public.aprs USING btree (company_id, status);


--
-- Name: idx_aprs_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_deleted_at ON public.aprs USING btree (deleted_at);


--
-- Name: idx_aprs_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprs_site_id ON public.aprs USING btree (site_id);


--
-- Name: idx_audit_logs_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_logs_companyId" ON public.audit_logs USING btree ("companyId");


--
-- Name: idx_audit_logs_company_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company_timestamp ON public.audit_logs USING btree ("companyId", "timestamp" DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity);


--
-- Name: idx_audit_logs_entityId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_logs_entityId" ON public.audit_logs USING btree ("entityId");


--
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_audit_logs_userId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_logs_userId" ON public.audit_logs USING btree ("userId");


--
-- Name: idx_audits_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audits_company_created ON public.audits USING btree (company_id, created_at DESC);


--
-- Name: idx_audits_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audits_company_id ON public.audits USING btree (company_id);


--
-- Name: idx_audits_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audits_company_site ON public.audits USING btree (company_id, site_id);


--
-- Name: idx_cats_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cats_company_created ON public.cats USING btree (company_id, created_at DESC);


--
-- Name: idx_cats_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cats_company_id ON public.cats USING btree (company_id);


--
-- Name: idx_cats_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cats_company_site ON public.cats USING btree (company_id, site_id);


--
-- Name: idx_cats_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cats_company_status ON public.cats USING btree (company_id, status);


--
-- Name: idx_checklists_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_company_created ON public.checklists USING btree (company_id, created_at DESC);


--
-- Name: idx_checklists_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_company_id ON public.checklists USING btree (company_id);


--
-- Name: idx_checklists_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_company_site ON public.checklists USING btree (company_id, site_id);


--
-- Name: idx_checklists_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_company_status ON public.checklists USING btree (company_id, status);


--
-- Name: idx_checklists_inspetor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_inspetor_id ON public.checklists USING btree (inspetor_id);


--
-- Name: idx_checklists_modelos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_modelos ON public.checklists USING btree (is_modelo) WHERE (is_modelo = true);


--
-- Name: idx_checklists_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_site_id ON public.checklists USING btree (site_id);


--
-- Name: idx_companies_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_cnpj ON public.companies USING btree (cnpj);


--
-- Name: idx_companies_razao_social_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_razao_social_fulltext ON public.companies USING gin (to_tsvector('portuguese'::regconfig, (razao_social)::text));


--
-- Name: idx_contracts_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_company_created ON public.contracts USING btree (company_id, created_at DESC);


--
-- Name: idx_contracts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_company_id ON public.contracts USING btree (company_id);


--
-- Name: idx_contracts_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_company_status ON public.contracts USING btree (company_id, status);


--
-- Name: idx_corrective_actions_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrective_actions_company_created ON public.corrective_actions USING btree (company_id, created_at DESC);


--
-- Name: idx_corrective_actions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrective_actions_company_id ON public.corrective_actions USING btree (company_id);


--
-- Name: idx_corrective_actions_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrective_actions_company_status ON public.corrective_actions USING btree (company_id, status);


--
-- Name: idx_dds_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dds_company_created ON public.dds USING btree (company_id, created_at DESC);


--
-- Name: idx_dds_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dds_company_id ON public.dds USING btree (company_id);


--
-- Name: idx_dds_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dds_company_site ON public.dds USING btree (company_id, site_id);


--
-- Name: idx_dds_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dds_deleted_at ON public.dds USING btree (deleted_at);


--
-- Name: idx_dds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dds_status ON public.dds USING btree (status);


--
-- Name: idx_epi_assignments_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epi_assignments_company_created ON public.epi_assignments USING btree (company_id, created_at DESC);


--
-- Name: idx_epi_assignments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epi_assignments_company_id ON public.epi_assignments USING btree (company_id);


--
-- Name: idx_epi_assignments_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epi_assignments_company_status ON public.epi_assignments USING btree (company_id, status);


--
-- Name: idx_epi_assignments_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epi_assignments_company_user ON public.epi_assignments USING btree (company_id, user_id);


--
-- Name: idx_epi_assignments_epi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epi_assignments_epi_id ON public.epi_assignments USING btree (epi_id);


--
-- Name: idx_epis_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epis_company_created ON public.epis USING btree (company_id, created_at DESC);


--
-- Name: idx_epis_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epis_company_id ON public.epis USING btree (company_id);


--
-- Name: idx_epis_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_epis_company_status ON public.epis USING btree (company_id, status);


--
-- Name: idx_inspections_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_company_created ON public.inspections USING btree (company_id, created_at DESC);


--
-- Name: idx_inspections_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_company_date ON public.inspections USING btree (company_id, created_at DESC);


--
-- Name: idx_inspections_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_company_id ON public.inspections USING btree (company_id);


--
-- Name: idx_inspections_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_company_site ON public.inspections USING btree (company_id, site_id);


--
-- Name: idx_inspections_responsavel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_responsavel_id ON public.inspections USING btree (responsavel_id);


--
-- Name: idx_inspections_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_site_id ON public.inspections USING btree (site_id);


--
-- Name: idx_machines_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_machines_company_created ON public.machines USING btree (company_id, created_at DESC);


--
-- Name: idx_machines_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_machines_company_id ON public.machines USING btree (company_id);


--
-- Name: idx_machines_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_machines_company_status ON public.machines USING btree (company_id, status);


--
-- Name: idx_mail_logs_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_logs_company_created ON public.mail_logs USING btree (company_id, created_at DESC);


--
-- Name: idx_mail_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_logs_company_id ON public.mail_logs USING btree (company_id);


--
-- Name: idx_mail_logs_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_logs_company_status ON public.mail_logs USING btree (company_id, status);


--
-- Name: idx_mail_logs_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_logs_to ON public.mail_logs USING btree ("to");


--
-- Name: idx_medical_exams_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_exams_company_id ON public.medical_exams USING btree (company_id);


--
-- Name: idx_medical_exams_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_exams_company_user ON public.medical_exams USING btree (company_id, user_id);


--
-- Name: idx_medical_exams_company_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_exams_company_vencimento ON public.medical_exams USING btree (company_id, data_vencimento);


--
-- Name: idx_nonconformities_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nonconformities_company_created ON public.nonconformities USING btree (company_id, created_at DESC);


--
-- Name: idx_nonconformities_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nonconformities_company_id ON public.nonconformities USING btree (company_id);


--
-- Name: idx_nonconformities_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nonconformities_company_site ON public.nonconformities USING btree (company_id, site_id);


--
-- Name: idx_nonconformities_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nonconformities_company_status ON public.nonconformities USING btree (company_id, status);


--
-- Name: idx_pts_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_company_created ON public.pts USING btree (company_id, created_at DESC);


--
-- Name: idx_pts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_company_id ON public.pts USING btree (company_id);


--
-- Name: idx_pts_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_company_site ON public.pts USING btree (company_id, site_id);


--
-- Name: idx_pts_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_company_status ON public.pts USING btree (company_id, status);


--
-- Name: idx_pts_data_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_data_inicio ON public.pts USING btree (data_hora_inicio);


--
-- Name: idx_pts_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_deleted_at ON public.pts USING btree (deleted_at);


--
-- Name: idx_pts_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_site_id ON public.pts USING btree (site_id);


--
-- Name: idx_rdos_company_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rdos_company_data ON public.rdos USING btree (company_id, data DESC);


--
-- Name: idx_rdos_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rdos_company_id ON public.rdos USING btree (company_id);


--
-- Name: idx_rdos_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rdos_company_status ON public.rdos USING btree (company_id, status);


--
-- Name: idx_reports_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_company_created ON public.reports USING btree (company_id, created_at DESC);


--
-- Name: idx_reports_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_company_id ON public.reports USING btree (company_id);


--
-- Name: idx_risks_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_company_created ON public.risks USING btree (company_id, created_at DESC);


--
-- Name: idx_risks_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_company_id ON public.risks USING btree (company_id);


--
-- Name: idx_risks_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risks_company_status ON public.risks USING btree (company_id, status);


--
-- Name: idx_service_orders_company_emissao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_orders_company_emissao ON public.service_orders USING btree (company_id, data_emissao DESC);


--
-- Name: idx_service_orders_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_orders_company_id ON public.service_orders USING btree (company_id);


--
-- Name: idx_service_orders_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_orders_company_status ON public.service_orders USING btree (company_id, status);


--
-- Name: idx_signatures_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signatures_company_created ON public.signatures USING btree (company_id, created_at DESC);


--
-- Name: idx_signatures_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signatures_company_id ON public.signatures USING btree (company_id);


--
-- Name: idx_signatures_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signatures_company_user ON public.signatures USING btree (company_id, user_id);


--
-- Name: idx_sites_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_company_created ON public.sites USING btree (company_id, created_at DESC);


--
-- Name: idx_sites_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_company_id ON public.sites USING btree (company_id);


--
-- Name: idx_sites_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_company_status ON public.sites USING btree (company_id, status);


--
-- Name: idx_tools_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tools_company_created ON public.tools USING btree (company_id, created_at DESC);


--
-- Name: idx_tools_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tools_company_id ON public.tools USING btree (company_id);


--
-- Name: idx_tools_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tools_company_status ON public.tools USING btree (company_id, status);


--
-- Name: idx_trainings_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_company_created ON public.trainings USING btree (company_id, created_at DESC);


--
-- Name: idx_trainings_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_company_id ON public.trainings USING btree (company_id);


--
-- Name: idx_trainings_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_company_user ON public.trainings USING btree (company_id, user_id);


--
-- Name: idx_users_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_company_created ON public.users USING btree (company_id, created_at DESC);


--
-- Name: idx_users_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_company_id ON public.users USING btree (company_id);


--
-- Name: idx_users_company_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_company_site ON public.users USING btree (company_id, site_id);


--
-- Name: idx_users_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_company_status ON public.users USING btree (company_id, status);


--
-- Name: idx_users_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_cpf ON public.users USING btree (cpf);


--
-- Name: idx_users_nome_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_nome_fulltext ON public.users USING gin (to_tsvector('portuguese'::regconfig, (nome)::text));


--
-- Name: idx_users_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_profile_id ON public.users USING btree (profile_id);


--
-- Name: idx_users_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_site_id ON public.users USING btree (site_id);


--
-- Name: forensic_trail_events TRG_forensic_trail_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "TRG_forensic_trail_events_append_only" BEFORE DELETE OR UPDATE ON public.forensic_trail_events FOR EACH ROW EXECUTE FUNCTION public.prevent_forensic_trail_mutation();


--
-- Name: activities FK_activities_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_activities_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: apr_activities FK_apr_activities_activity_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_activities
    ADD CONSTRAINT "FK_apr_activities_activity_id" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: apr_activities FK_apr_activities_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_activities
    ADD CONSTRAINT "FK_apr_activities_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_epis FK_apr_epis_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_epis
    ADD CONSTRAINT "FK_apr_epis_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_epis FK_apr_epis_epi_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_epis
    ADD CONSTRAINT "FK_apr_epis_epi_id" FOREIGN KEY (epi_id) REFERENCES public.epis(id) ON DELETE CASCADE;


--
-- Name: apr_logs FK_apr_logs_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_logs
    ADD CONSTRAINT "FK_apr_logs_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_machines FK_apr_machines_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_machines
    ADD CONSTRAINT "FK_apr_machines_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_machines FK_apr_machines_machine_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_machines
    ADD CONSTRAINT "FK_apr_machines_machine_id" FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: apr_participants FK_apr_participants_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_participants
    ADD CONSTRAINT "FK_apr_participants_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_participants FK_apr_participants_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_participants
    ADD CONSTRAINT "FK_apr_participants_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: apr_risk_evidences FK_apr_risk_evidences_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_evidences
    ADD CONSTRAINT "FK_apr_risk_evidences_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_risk_evidences FK_apr_risk_evidences_apr_risk_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_evidences
    ADD CONSTRAINT "FK_apr_risk_evidences_apr_risk_item_id" FOREIGN KEY (apr_risk_item_id) REFERENCES public.apr_risk_items(id) ON DELETE CASCADE;


--
-- Name: apr_risk_evidences FK_apr_risk_evidences_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_evidences
    ADD CONSTRAINT "FK_apr_risk_evidences_item_id" FOREIGN KEY (apr_risk_item_id) REFERENCES public.apr_risk_items(id) ON DELETE CASCADE;


--
-- Name: apr_risk_evidences FK_apr_risk_evidences_uploaded_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_evidences
    ADD CONSTRAINT "FK_apr_risk_evidences_uploaded_by_id" FOREIGN KEY (uploaded_by_id) REFERENCES public.users(id);


--
-- Name: apr_risk_items FK_apr_risk_items_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risk_items
    ADD CONSTRAINT "FK_apr_risk_items_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_risks FK_apr_risks_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risks
    ADD CONSTRAINT "FK_apr_risks_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_risks FK_apr_risks_risk_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_risks
    ADD CONSTRAINT "FK_apr_risks_risk_id" FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: apr_tools FK_apr_tools_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_tools
    ADD CONSTRAINT "FK_apr_tools_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id) ON DELETE CASCADE;


--
-- Name: apr_tools FK_apr_tools_tool_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apr_tools
    ADD CONSTRAINT "FK_apr_tools_tool_id" FOREIGN KEY (tool_id) REFERENCES public.tools(id) ON DELETE CASCADE;


--
-- Name: aprs FK_aprs_aprovado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_aprovado_por_id" FOREIGN KEY (aprovado_por_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: aprs FK_aprs_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: aprs FK_aprs_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: aprs FK_aprs_elaborador_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_elaborador_id" FOREIGN KEY (elaborador_id) REFERENCES public.users(id);


--
-- Name: aprs FK_aprs_parent_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_parent_apr_id" FOREIGN KEY (parent_apr_id) REFERENCES public.aprs(id) ON DELETE SET NULL;


--
-- Name: aprs FK_aprs_reprovado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_reprovado_por_id" FOREIGN KEY (reprovado_por_id) REFERENCES public.users(id);


--
-- Name: aprs FK_aprs_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprs
    ADD CONSTRAINT "FK_aprs_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: audits FK_audits_auditor_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT "FK_audits_auditor_id" FOREIGN KEY (auditor_id) REFERENCES public.users(id);


--
-- Name: audits FK_audits_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT "FK_audits_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: audits FK_audits_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT "FK_audits_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: cats FK_cats_closed_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_closed_by_id" FOREIGN KEY (closed_by_id) REFERENCES public.users(id);


--
-- Name: cats FK_cats_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: cats FK_cats_contract_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_contract_id" FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;


--
-- Name: cats FK_cats_investigated_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_investigated_by_id" FOREIGN KEY (investigated_by_id) REFERENCES public.users(id);


--
-- Name: cats FK_cats_opened_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_opened_by_id" FOREIGN KEY (opened_by_id) REFERENCES public.users(id);


--
-- Name: cats FK_cats_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: cats FK_cats_worker_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cats
    ADD CONSTRAINT "FK_cats_worker_id" FOREIGN KEY (worker_id) REFERENCES public.users(id);


--
-- Name: checklists FK_checklists_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT "FK_checklists_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: checklists FK_checklists_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT "FK_checklists_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: checklists FK_checklists_inspetor_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT "FK_checklists_inspetor_id" FOREIGN KEY (inspetor_id) REFERENCES public.users(id);


--
-- Name: checklists FK_checklists_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT "FK_checklists_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: checklists FK_checklists_template_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT "FK_checklists_template_id" FOREIGN KEY (template_id) REFERENCES public.checklists(id);


--
-- Name: contracts FK_contracts_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT "FK_contracts_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: corrective_actions FK_corrective_actions_company; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_company" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: corrective_actions FK_corrective_actions_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: corrective_actions FK_corrective_actions_responsible_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_responsible_user_id" FOREIGN KEY (responsible_user_id) REFERENCES public.users(id);


--
-- Name: corrective_actions FK_corrective_actions_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_site" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;


--
-- Name: corrective_actions FK_corrective_actions_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: corrective_actions FK_corrective_actions_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrective_actions
    ADD CONSTRAINT "FK_corrective_actions_user" FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: dds FK_dds_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds
    ADD CONSTRAINT "FK_dds_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: dds FK_dds_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds
    ADD CONSTRAINT "FK_dds_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: dds FK_dds_facilitador_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds
    ADD CONSTRAINT "FK_dds_facilitador_id" FOREIGN KEY (facilitador_id) REFERENCES public.users(id);


--
-- Name: dds_participants FK_dds_participants_dds_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds_participants
    ADD CONSTRAINT "FK_dds_participants_dds_id" FOREIGN KEY (dds_id) REFERENCES public.dds(id) ON DELETE CASCADE;


--
-- Name: dds_participants FK_dds_participants_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds_participants
    ADD CONSTRAINT "FK_dds_participants_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dds FK_dds_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dds
    ADD CONSTRAINT "FK_dds_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: document_registry FK_document_registry_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_registry
    ADD CONSTRAINT "FK_document_registry_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: epi_assignments FK_epi_assignments_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: epi_assignments FK_epi_assignments_contract_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_contract_id" FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: epi_assignments FK_epi_assignments_created_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_created_by_id" FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: epi_assignments FK_epi_assignments_epi_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_epi_id" FOREIGN KEY (epi_id) REFERENCES public.epis(id);


--
-- Name: epi_assignments FK_epi_assignments_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: epi_assignments FK_epi_assignments_updated_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_updated_by_id" FOREIGN KEY (updated_by_id) REFERENCES public.users(id);


--
-- Name: epi_assignments FK_epi_assignments_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epi_assignments
    ADD CONSTRAINT "FK_epi_assignments_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: epis FK_epis_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epis
    ADD CONSTRAINT "FK_epis_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: inspections FK_inspections_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT "FK_inspections_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: inspections FK_inspections_responsavel_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT "FK_inspections_responsavel_id" FOREIGN KEY (responsavel_id) REFERENCES public.users(id);


--
-- Name: inspections FK_inspections_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT "FK_inspections_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: machines FK_machines_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT "FK_machines_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: mail_logs FK_mail_logs_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_logs
    ADD CONSTRAINT "FK_mail_logs_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: mail_logs FK_mail_logs_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_logs
    ADD CONSTRAINT "FK_mail_logs_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: medical_exams FK_medical_exams_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_exams
    ADD CONSTRAINT "FK_medical_exams_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: medical_exams FK_medical_exams_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_exams
    ADD CONSTRAINT "FK_medical_exams_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: medical_exams FK_medical_exams_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_exams
    ADD CONSTRAINT "FK_medical_exams_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: monthly_snapshots FK_monthly_snapshots_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_snapshots
    ADD CONSTRAINT "FK_monthly_snapshots_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: monthly_snapshots FK_monthly_snapshots_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_snapshots
    ADD CONSTRAINT "FK_monthly_snapshots_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: nonconformities FK_nonconformities_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nonconformities
    ADD CONSTRAINT "FK_nonconformities_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: nonconformities FK_nonconformities_resolved_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nonconformities
    ADD CONSTRAINT "FK_nonconformities_resolved_by" FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: nonconformities FK_nonconformities_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nonconformities
    ADD CONSTRAINT "FK_nonconformities_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: pdf_integrity_records FK_pdf_integrity_records_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_integrity_records
    ADD CONSTRAINT "FK_pdf_integrity_records_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: pdf_integrity_records FK_pdf_integrity_records_signed_by_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_integrity_records
    ADD CONSTRAINT "FK_pdf_integrity_records_signed_by_user_id" FOREIGN KEY (signed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pt_executantes FK_pt_executantes_pt_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pt_executantes
    ADD CONSTRAINT "FK_pt_executantes_pt_id" FOREIGN KEY (pt_id) REFERENCES public.pts(id) ON DELETE CASCADE;


--
-- Name: pt_executantes FK_pt_executantes_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pt_executantes
    ADD CONSTRAINT "FK_pt_executantes_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pts FK_pts_apr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_apr_id" FOREIGN KEY (apr_id) REFERENCES public.aprs(id);


--
-- Name: pts FK_pts_aprovado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_aprovado_por_id" FOREIGN KEY (aprovado_por_id) REFERENCES public.users(id);


--
-- Name: pts FK_pts_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: pts FK_pts_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: pts FK_pts_reprovado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_reprovado_por_id" FOREIGN KEY (reprovado_por_id) REFERENCES public.users(id);


--
-- Name: pts FK_pts_responsavel_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_responsavel_id" FOREIGN KEY (responsavel_id) REFERENCES public.users(id);


--
-- Name: pts FK_pts_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT "FK_pts_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: rdos FK_rdos_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rdos
    ADD CONSTRAINT "FK_rdos_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: rdos FK_rdos_responsavel_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rdos
    ADD CONSTRAINT "FK_rdos_responsavel_id" FOREIGN KEY (responsavel_id) REFERENCES public.users(id);


--
-- Name: rdos FK_rdos_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rdos
    ADD CONSTRAINT "FK_rdos_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: reports FK_reports_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT "FK_reports_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: risk_history FK_risk_history_risk_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_history
    ADD CONSTRAINT "FK_risk_history_risk_id" FOREIGN KEY (risk_id) REFERENCES public.risks(id) ON DELETE CASCADE;


--
-- Name: risks FK_risks_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT "FK_risks_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: role_permissions FK_role_permissions_permission_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_permission_id" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions FK_role_permissions_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: service_orders FK_service_orders_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_service_orders_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: service_orders FK_service_orders_responsavel_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_service_orders_responsavel_id" FOREIGN KEY (responsavel_id) REFERENCES public.users(id);


--
-- Name: service_orders FK_service_orders_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_service_orders_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: signatures FK_signatures_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT "FK_signatures_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: signatures FK_signatures_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT "FK_signatures_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sites FK_sites_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT "FK_sites_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: tenant_document_policies FK_tenant_document_policies_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_document_policies
    ADD CONSTRAINT "FK_tenant_document_policies_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tools FK_tools_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT "FK_tools_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: trainings FK_trainings_auditado_por_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT "FK_trainings_auditado_por_id" FOREIGN KEY (auditado_por_id) REFERENCES public.users(id);


--
-- Name: trainings FK_trainings_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT "FK_trainings_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: trainings FK_trainings_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT "FK_trainings_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_roles FK_user_roles_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles FK_user_roles_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions FK_user_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT "FK_user_sessions_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users FK_users_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_company_id" FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: users FK_users_profile_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_profile_id" FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: users FK_users_site_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_site_id" FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: apr_risk_evidences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apr_risk_evidences ENABLE ROW LEVEL SECURITY;

--
-- Name: aprs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aprs ENABLE ROW LEVEL SECURITY;

--
-- Name: audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

--
-- Name: cats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

--
-- Name: checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: corrective_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: dds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dds ENABLE ROW LEVEL SECURITY;

--
-- Name: document_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: document_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: epi_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.epi_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: epis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.epis ENABLE ROW LEVEL SECURITY;

--
-- Name: inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mail_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_exams ENABLE ROW LEVEL SECURITY;

--
-- Name: nonconformities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nonconformities ENABLE ROW LEVEL SECURITY;

--
-- Name: pts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pts ENABLE ROW LEVEL SECURITY;

--
-- Name: rdos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rdos ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: risks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;

--
-- Name: service_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_document_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_document_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: apr_risk_evidences tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.apr_risk_evidences AS RESTRICTIVE USING (((public.is_super_admin() = true) OR (EXISTS ( SELECT 1
   FROM public.aprs a
  WHERE ((a.id = apr_risk_evidences.apr_id) AND (a.company_id = public.current_company())))))) WITH CHECK (((public.is_super_admin() = true) OR (EXISTS ( SELECT 1
   FROM public.aprs a
  WHERE ((a.id = apr_risk_evidences.apr_id) AND (a.company_id = public.current_company()))))));


--
-- Name: cats tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.cats AS RESTRICTIVE USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: checklists tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.checklists AS RESTRICTIVE USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: document_registry tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.document_registry AS RESTRICTIVE USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: inspections tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.inspections AS RESTRICTIVE USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: signatures tenant_guard_public_hardening; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_guard_public_hardening ON public.signatures AS RESTRICTIVE USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: activities tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.activities USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: ai_interactions tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.ai_interactions USING ((((tenant_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true))) WITH CHECK ((((tenant_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)));


--
-- Name: aprs tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.aprs USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: audits tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.audits USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: cats tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.cats USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: checklists tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.checklists USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: contracts tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.contracts USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: corrective_actions tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.corrective_actions USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: dds tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.dds USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: document_imports tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.document_imports USING (((empresa_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((empresa_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: document_registry tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.document_registry USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: epi_assignments tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.epi_assignments USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: epis tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.epis USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: inspections tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.inspections USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: machines tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.machines USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: mail_logs tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.mail_logs USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: medical_exams tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.medical_exams USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: monthly_snapshots tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.monthly_snapshots USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: nonconformities tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.nonconformities USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: pts tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.pts USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: rdos tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.rdos USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: reports tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.reports USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: risks tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.risks USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: service_orders tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.service_orders USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: signatures tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.signatures USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: sites tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.sites USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: tenant_document_policies tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.tenant_document_policies USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: tools tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.tools USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: trainings tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.trainings USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: users tenant_isolation_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_policy ON public.users USING (((company_id = public.current_company()) OR (public.is_super_admin() = true))) WITH CHECK (((company_id = public.current_company()) OR (public.is_super_admin() = true)));


--
-- Name: tools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

--
-- Name: trainings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
--



COMMENT ON COLUMN public.users.password IS 'LEGACY: coluna mantida apenas para compatibilidade temporaria durante a migracao para Supabase Auth. Nao introduzir novas dependencias.';

