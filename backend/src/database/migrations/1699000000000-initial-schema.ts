import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1699000000000 implements MigrationInterface {
  name = 'InitialSchema1699000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // -------------------------------------------------------------------------
    // 1. companies (no foreign key dependencies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "companies" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "razao_social" varchar NOT NULL,
        "cnpj" varchar NOT NULL UNIQUE,
        "endereco" text NOT NULL,
        "responsavel" varchar NOT NULL,
        "logo_url" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "deleted_at" timestamp NULL
      )
    `);

    // -------------------------------------------------------------------------
    // 2. profiles (no foreign key dependencies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profiles" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "permissoes" jsonb NOT NULL,
        "status" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);

    // -------------------------------------------------------------------------
    // 3. sites (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sites" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "local" varchar NULL,
        "endereco" varchar NULL,
        "cidade" varchar NULL,
        "estado" varchar NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_sites_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 4. users (refs companies, sites, profiles)
    //    cpf and funcao are nullable per migration 1709000000015
    //    deleted_at added by migration 1709000000014
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "cpf" varchar NULL UNIQUE,
        "email" varchar NULL UNIQUE,
        "funcao" varchar NULL,
        "password" varchar NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "profile_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "deleted_at" timestamp NULL,
        CONSTRAINT "FK_users_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_users_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_users_profile_id" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 5. activities (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activities" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "descricao" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_activities_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 6. risks (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risks" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "categoria" varchar NOT NULL,
        "descricao" text NULL,
        "medidas_controle" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_risks_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 7. epis (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "epis" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "ca" varchar NULL,
        "validade_ca" date NULL,
        "descricao" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_epis_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 8. tools (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tools" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "numero_serie" varchar NULL,
        "descricao" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_tools_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 9. machines (refs companies)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "machines" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "placa" varchar NULL,
        "horimetro_atual" float NOT NULL DEFAULT 0,
        "descricao" text NULL,
        "requisitos_seguranca" text NULL,
        "status" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_machines_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 10. aprs (refs companies, sites, users; self-ref parent_apr_id)
    //     Includes columns added by migrations 1709000000001 and 1709000000002
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "aprs" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "numero" varchar NOT NULL,
        "titulo" varchar NOT NULL,
        "descricao" text NULL,
        "data_inicio" date NOT NULL,
        "data_fim" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'Pendente',
        "is_modelo" boolean NOT NULL DEFAULT false,
        "is_modelo_padrao" boolean NOT NULL DEFAULT false,
        "itens_risco" jsonb NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "elaborador_id" uuid NOT NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "versao" integer NOT NULL DEFAULT 1,
        "parent_apr_id" uuid NULL,
        "aprovado_por_id" uuid NULL,
        "aprovado_em" timestamp NULL,
        "aprovado_motivo" text NULL,
        "reprovado_por_id" uuid NULL,
        "reprovado_em" timestamp NULL,
        "reprovado_motivo" text NULL,
        "classificacao_resumo" jsonb NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_aprs_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_aprs_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_aprs_elaborador_id" FOREIGN KEY ("elaborador_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_aprs_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_aprs_parent_apr_id" FOREIGN KEY ("parent_apr_id") REFERENCES "aprs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_aprs_aprovado_por_id" FOREIGN KEY ("aprovado_por_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_aprs_reprovado_por_id" FOREIGN KEY ("reprovado_por_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_aprs_parent_apr_id" ON "aprs" ("parent_apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_aprs_aprovado_por_id" ON "aprs" ("aprovado_por_id")`,
    );

    // -------------------------------------------------------------------------
    // 11. apr_risk_items (refs aprs; ON DELETE CASCADE)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_risk_items" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "apr_id" uuid NOT NULL,
        "atividade" text NULL,
        "agente_ambiental" text NULL,
        "condicao_perigosa" text NULL,
        "fonte_circunstancia" text NULL,
        "lesao" text NULL,
        "probabilidade" integer NULL,
        "severidade" integer NULL,
        "score_risco" integer NULL,
        "categoria_risco" varchar(40) NULL,
        "prioridade" varchar(40) NULL,
        "medidas_prevencao" text NULL,
        "ordem" integer NOT NULL DEFAULT 0,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_apr_risk_items_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE
      )
    `);

    // -------------------------------------------------------------------------
    // 12. apr_logs (refs aprs; ON DELETE CASCADE)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_logs" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "apr_id" uuid NOT NULL,
        "usuario_id" uuid NULL,
        "acao" varchar(100) NOT NULL,
        "metadata" jsonb NULL,
        "data_hora" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_apr_logs_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_logs_apr_id" ON "apr_logs" ("apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_logs_usuario_id" ON "apr_logs" ("usuario_id")`,
    );

    // -------------------------------------------------------------------------
    // 13. apr_risk_evidences (refs aprs, apr_risk_items, users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_risk_evidences" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "apr_id" uuid NOT NULL,
        "apr_risk_item_id" uuid NOT NULL,
        "uploaded_by_id" varchar NULL,
        "file_key" text NOT NULL,
        "original_name" text NULL,
        "mime_type" varchar(100) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "hash_sha256" varchar(64) NOT NULL,
        "watermarked_file_key" text NULL,
        "watermarked_hash_sha256" varchar(64) NULL,
        "watermark_text" text NULL,
        "captured_at" timestamp NULL,
        "uploaded_at" timestamp DEFAULT now() NOT NULL,
        "latitude" numeric(10,7) NULL,
        "longitude" numeric(10,7) NULL,
        "accuracy_m" numeric(10,2) NULL,
        "device_id" varchar(120) NULL,
        "ip_address" varchar(64) NULL,
        "exif_datetime" timestamp NULL,
        "integrity_flags" jsonb NULL,
        CONSTRAINT "FK_apr_risk_evidences_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_risk_evidences_apr_risk_item_id" FOREIGN KEY ("apr_risk_item_id") REFERENCES "apr_risk_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_risk_evidences_uploaded_by_id" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 14. dds (refs companies, sites, users)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dds" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tema" varchar NOT NULL,
        "conteudo" text NULL,
        "data" date NOT NULL,
        "is_modelo" boolean NOT NULL DEFAULT false,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "facilitador_id" uuid NOT NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_dds_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_dds_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_dds_facilitador_id" FOREIGN KEY ("facilitador_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_dds_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 15. pts (refs companies, sites, aprs, users)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pts" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "numero" varchar NOT NULL,
        "titulo" varchar NOT NULL,
        "descricao" text NULL,
        "data_hora_inicio" timestamp NOT NULL,
        "data_hora_fim" timestamp NOT NULL,
        "status" varchar NOT NULL DEFAULT 'Pendente',
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "apr_id" uuid NULL,
        "responsavel_id" uuid NOT NULL,
        "trabalho_altura" boolean NOT NULL DEFAULT false,
        "espaco_confinado" boolean NOT NULL DEFAULT false,
        "trabalho_quente" boolean NOT NULL DEFAULT false,
        "eletricidade" boolean NOT NULL DEFAULT false,
        "escavacao" boolean NOT NULL DEFAULT false,
        "trabalho_altura_checklist" jsonb NULL,
        "trabalho_eletrico_checklist" jsonb NULL,
        "trabalho_quente_checklist" jsonb NULL,
        "trabalho_espaco_confinado_checklist" jsonb NULL,
        "trabalho_escavacao_checklist" jsonb NULL,
        "recomendacoes_gerais_checklist" jsonb NULL,
        "analise_risco_rapida_checklist" jsonb NULL,
        "analise_risco_rapida_observacoes" text NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "aprovado_por_id" uuid NULL,
        "aprovado_em" timestamp NULL,
        "aprovado_motivo" text NULL,
        "reprovado_por_id" uuid NULL,
        "reprovado_em" timestamp NULL,
        "reprovado_motivo" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_pts_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_pts_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_pts_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id"),
        CONSTRAINT "FK_pts_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_pts_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_pts_aprovado_por_id" FOREIGN KEY ("aprovado_por_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_pts_reprovado_por_id" FOREIGN KEY ("reprovado_por_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 16. inspections (refs companies, sites, users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inspections" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "setor_area" varchar NOT NULL,
        "tipo_inspecao" varchar NOT NULL,
        "data_inspecao" date NOT NULL,
        "horario" varchar NOT NULL,
        "responsavel_id" uuid NOT NULL,
        "objetivo" text NULL,
        "descricao_local_atividades" text NULL,
        "metodologia" json NULL,
        "perigos_riscos" json NULL,
        "plano_acao" json NULL,
        "evidencias" json NULL,
        "conclusao" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_inspections_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_inspections_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_inspections_responsavel_id" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 17. checklists (refs companies, sites, users; self-ref template_id)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "checklists" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "titulo" varchar NOT NULL,
        "descricao" text NULL,
        "equipamento" varchar NULL,
        "maquina" varchar NULL,
        "foto_equipamento" text NULL,
        "data" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'Pendente',
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "inspetor_id" uuid NULL,
        "itens" jsonb NULL,
        "is_modelo" boolean NOT NULL DEFAULT false,
        "template_id" uuid NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "categoria" varchar NULL,
        "periodicidade" varchar NULL,
        "nivel_risco_padrao" varchar NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_checklists_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_checklists_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_checklists_inspetor_id" FOREIGN KEY ("inspetor_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_checklists_template_id" FOREIGN KEY ("template_id") REFERENCES "checklists"("id"),
        CONSTRAINT "FK_checklists_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 18. trainings (refs users, companies)
    //     Migration 1771988188582 adds no columns (empty migration)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trainings" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "nome" varchar NOT NULL,
        "nr_codigo" varchar NULL,
        "carga_horaria" integer NULL,
        "obrigatorio_para_funcao" boolean NOT NULL DEFAULT true,
        "bloqueia_operacao_quando_vencido" boolean NOT NULL DEFAULT true,
        "data_conclusao" timestamp NOT NULL,
        "data_vencimento" timestamp NOT NULL,
        "certificado_url" varchar NULL,
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "auditado_por_id" uuid NULL,
        "data_auditoria" timestamp NULL,
        "resultado_auditoria" varchar NULL,
        "notas_auditoria" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_trainings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_trainings_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_trainings_auditado_por_id" FOREIGN KEY ("auditado_por_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 19. audit_logs (no FK constraints declared; stores IDs as plain strings)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "userId" varchar NOT NULL,
        "action" varchar NOT NULL,
        "entity" varchar NOT NULL,
        "entityId" varchar NOT NULL,
        "changes" jsonb NULL,
        "ip" varchar NOT NULL,
        "userAgent" varchar NULL,
        "companyId" varchar NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
      )
    `);

    // -------------------------------------------------------------------------
    // 20. audits (refs companies, sites, users)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audits" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "titulo" varchar NOT NULL,
        "data_auditoria" date NOT NULL,
        "tipo_auditoria" varchar NOT NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "auditor_id" uuid NOT NULL,
        "representantes_empresa" text NULL,
        "objetivo" text NULL,
        "escopo" text NULL,
        "referencias" json NULL,
        "metodologia" text NULL,
        "caracterizacao" json NULL,
        "documentos_avaliados" json NULL,
        "resultados_conformidades" json NULL,
        "resultados_nao_conformidades" json NULL,
        "resultados_observacoes" json NULL,
        "resultados_oportunidades" json NULL,
        "avaliacao_riscos" json NULL,
        "plano_acao" json NULL,
        "conclusao" text NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_audits_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_audits_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_audits_auditor_id" FOREIGN KEY ("auditor_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 21. epi_assignments (refs companies, epis, users, sites)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "epi_assignments" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "epi_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "ca" varchar NULL,
        "validade_ca" date NULL,
        "quantidade" integer NOT NULL DEFAULT 1,
        "status" varchar NOT NULL DEFAULT 'entregue',
        "entregue_em" timestamp NOT NULL,
        "devolvido_em" timestamp NULL,
        "motivo_devolucao" text NULL,
        "observacoes" text NULL,
        "assinatura_entrega" jsonb NOT NULL,
        "assinatura_devolucao" jsonb NULL,
        "created_by_id" uuid NULL,
        "updated_by_id" uuid NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_epi_assignments_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_epi_assignments_epi_id" FOREIGN KEY ("epi_id") REFERENCES "epis"("id"),
        CONSTRAINT "FK_epi_assignments_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_epi_assignments_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_epi_assignments_created_by_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_epi_assignments_updated_by_id" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_status" ON "epi_assignments" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_user" ON "epi_assignments" ("company_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_epi_assignments_company_created_at" ON "epi_assignments" ("company_id", "created_at")`,
    );

    // -------------------------------------------------------------------------
    // 22. notifications (no FK constraints; userId stored as plain string)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "userId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "message" text NOT NULL,
        "data" jsonb NULL,
        "read" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "readAt" timestamp NULL
      )
    `);

    // -------------------------------------------------------------------------
    // 23. signatures (refs users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "signatures" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "document_id" varchar NOT NULL,
        "document_type" varchar NOT NULL,
        "signature_data" text NOT NULL,
        "type" varchar NOT NULL,
        "company_id" varchar NULL,
        "signature_hash" varchar NULL,
        "timestamp_token" varchar NULL,
        "timestamp_authority" varchar NULL,
        "signed_at" timestamp NULL,
        "integrity_payload" jsonb NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_signatures_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 24. reports (refs companies)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "titulo" varchar NOT NULL,
        "descricao" text NULL,
        "mes" integer NOT NULL,
        "ano" integer NOT NULL,
        "estatisticas" jsonb NOT NULL,
        "analise_gandra" text NULL,
        "company_id" uuid NOT NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_reports_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 25. corrective_actions (refs companies, sites, users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corrective_actions" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "title" varchar NOT NULL,
        "description" text NOT NULL,
        "source_type" varchar NOT NULL DEFAULT 'manual',
        "source_id" varchar NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "responsible_user_id" uuid NULL,
        "responsible_name" varchar NULL,
        "due_date" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'open',
        "priority" varchar NOT NULL DEFAULT 'medium',
        "sla_days" integer NULL,
        "evidence_notes" text NULL,
        "evidence_files" jsonb NULL,
        "last_reminder_at" timestamp NULL,
        "escalation_level" integer NOT NULL DEFAULT 0,
        "closed_at" timestamp NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_corrective_actions_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_corrective_actions_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_corrective_actions_responsible_user_id" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 26. nonconformities (refs companies, sites)
    //     pdf columns included from migration 1709000000001
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nonconformities" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "codigo_nc" varchar NOT NULL,
        "tipo" varchar NOT NULL,
        "data_identificacao" date NOT NULL,
        "local_setor_area" varchar NOT NULL,
        "atividade_envolvida" varchar NOT NULL,
        "responsavel_area" varchar NOT NULL,
        "auditor_responsavel" varchar NOT NULL,
        "classificacao" json NULL,
        "descricao" text NOT NULL,
        "evidencia_observada" text NOT NULL,
        "condicao_insegura" text NOT NULL,
        "ato_inseguro" text NULL,
        "requisito_nr" varchar NOT NULL,
        "requisito_item" varchar NOT NULL,
        "requisito_procedimento" varchar NULL,
        "requisito_politica" varchar NULL,
        "risco_perigo" varchar NOT NULL,
        "risco_associado" varchar NOT NULL,
        "risco_consequencias" json NULL,
        "risco_nivel" varchar NOT NULL,
        "causa" json NULL,
        "causa_outro" varchar NULL,
        "acao_imediata_descricao" text NULL,
        "acao_imediata_data" date NULL,
        "acao_imediata_responsavel" varchar NULL,
        "acao_imediata_status" varchar NULL,
        "acao_definitiva_descricao" text NULL,
        "acao_definitiva_prazo" date NULL,
        "acao_definitiva_responsavel" varchar NULL,
        "acao_definitiva_recursos" text NULL,
        "acao_definitiva_data_prevista" date NULL,
        "acao_preventiva_medidas" text NULL,
        "acao_preventiva_treinamento" text NULL,
        "acao_preventiva_revisao_procedimento" text NULL,
        "acao_preventiva_melhoria_processo" text NULL,
        "acao_preventiva_epc_epi" text NULL,
        "verificacao_resultado" varchar NULL,
        "verificacao_evidencias" text NULL,
        "verificacao_data" date NULL,
        "verificacao_responsavel" varchar NULL,
        "status" varchar NOT NULL,
        "observacoes_gerais" text NULL,
        "anexos" json NULL,
        "assinatura_responsavel_area" varchar NULL,
        "assinatura_tecnico_auditor" varchar NULL,
        "assinatura_gestao" varchar NULL,
        "pdf_file_key" text NULL,
        "pdf_folder_path" text NULL,
        "pdf_original_name" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_nonconformities_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_nonconformities_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 27. cats (refs companies, sites, users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cats" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "numero" varchar NOT NULL,
        "company_id" uuid NOT NULL,
        "site_id" uuid NULL,
        "worker_id" uuid NULL,
        "data_ocorrencia" timestamp NOT NULL,
        "tipo" varchar NOT NULL DEFAULT 'tipico',
        "gravidade" varchar NOT NULL DEFAULT 'moderada',
        "descricao" text NOT NULL,
        "local_ocorrencia" text NULL,
        "pessoas_envolvidas" jsonb NULL,
        "acao_imediata" text NULL,
        "investigacao_detalhes" text NULL,
        "causa_raiz" text NULL,
        "plano_acao_fechamento" text NULL,
        "licoes_aprendidas" text NULL,
        "status" varchar NOT NULL DEFAULT 'aberta',
        "opened_by_id" uuid NULL,
        "investigated_by_id" uuid NULL,
        "closed_by_id" uuid NULL,
        "opened_at" timestamp NULL,
        "investigated_at" timestamp NULL,
        "closed_at" timestamp NULL,
        "attachments" jsonb NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_cats_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_cats_site_id" FOREIGN KEY ("site_id") REFERENCES "sites"("id"),
        CONSTRAINT "FK_cats_worker_id" FOREIGN KEY ("worker_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_cats_opened_by_id" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_cats_investigated_by_id" FOREIGN KEY ("investigated_by_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_cats_closed_by_id" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cats_company_status" ON "cats" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cats_company_created_at" ON "cats" ("company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cats_company_worker" ON "cats" ("company_id", "worker_id")`,
    );

    // -------------------------------------------------------------------------
    // 28. mail_logs (refs companies, users; both nullable)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mail_logs" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NULL,
        "user_id" uuid NULL,
        "to" varchar NOT NULL,
        "subject" varchar NOT NULL,
        "filename" varchar NOT NULL,
        "message_id" varchar NULL,
        "accepted" jsonb NULL,
        "rejected" jsonb NULL,
        "provider_response" text NULL,
        "using_test_account" boolean NOT NULL DEFAULT false,
        "status" varchar NOT NULL,
        "error_message" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_mail_logs_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_mail_logs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 29. push_subscriptions (no FK constraints; userId stored as plain string)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "userId" varchar NOT NULL,
        "endpoint" varchar NOT NULL,
        "keys" text NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    // -------------------------------------------------------------------------
    // 30. user_sessions (refs users)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "ip" varchar NOT NULL,
        "device" varchar NULL,
        "country" varchar NULL,
        "state" varchar NULL,
        "city" varchar NULL,
        "token_hash" varchar NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "last_active" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_user_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    // -------------------------------------------------------------------------
    // 31. document_imports (no FK constraints; empresa_id stored as uuid without FK)
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_imports" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "empresa_id" uuid NOT NULL,
        "tipo_documento" varchar(50) NULL,
        "nome_arquivo" varchar(255) NULL,
        "hash" varchar(64) NOT NULL UNIQUE,
        "tamanho" integer NULL,
        "texto_extraido" text NULL,
        "json_estruturado" jsonb NULL,
        "metadata" jsonb NULL,
        "status" varchar NOT NULL DEFAULT 'uploaded',
        "score_confianca" numeric(5,2) NOT NULL DEFAULT 0,
        "data_documento" date NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "mensagem_erro" text NULL
      )
    `);

    // -------------------------------------------------------------------------
    // Junction tables (ManyToMany)
    // -------------------------------------------------------------------------

    // dds_participants
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dds_participants" (
        "dds_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_dds_participants" PRIMARY KEY ("dds_id", "user_id"),
        CONSTRAINT "FK_dds_participants_dds_id" FOREIGN KEY ("dds_id") REFERENCES "dds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dds_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // pt_executantes
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pt_executantes" (
        "pt_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_pt_executantes" PRIMARY KEY ("pt_id", "user_id"),
        CONSTRAINT "FK_pt_executantes_pt_id" FOREIGN KEY ("pt_id") REFERENCES "pts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pt_executantes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // apr_activities
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_activities" (
        "apr_id" uuid NOT NULL,
        "activity_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_activities" PRIMARY KEY ("apr_id", "activity_id"),
        CONSTRAINT "FK_apr_activities_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_activities_activity_id" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE
      )
    `);

    // apr_risks
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_risks" (
        "apr_id" uuid NOT NULL,
        "risk_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_risks" PRIMARY KEY ("apr_id", "risk_id"),
        CONSTRAINT "FK_apr_risks_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_risks_risk_id" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE
      )
    `);

    // apr_epis
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_epis" (
        "apr_id" uuid NOT NULL,
        "epi_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_epis" PRIMARY KEY ("apr_id", "epi_id"),
        CONSTRAINT "FK_apr_epis_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_epis_epi_id" FOREIGN KEY ("epi_id") REFERENCES "epis"("id") ON DELETE CASCADE
      )
    `);

    // apr_tools
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_tools" (
        "apr_id" uuid NOT NULL,
        "tool_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_tools" PRIMARY KEY ("apr_id", "tool_id"),
        CONSTRAINT "FK_apr_tools_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_tools_tool_id" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE
      )
    `);

    // apr_machines
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_machines" (
        "apr_id" uuid NOT NULL,
        "machine_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_machines" PRIMARY KEY ("apr_id", "machine_id"),
        CONSTRAINT "FK_apr_machines_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_machines_machine_id" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE
      )
    `);

    // apr_participants
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_participants" (
        "apr_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_apr_participants" PRIMARY KEY ("apr_id", "user_id"),
        CONSTRAINT "FK_apr_participants_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop junction tables first (no dependents)
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_machines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_tools"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_epis"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_risks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_activities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pt_executantes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dds_participants"`);

    // Drop entity tables in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "document_imports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mail_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nonconformities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "corrective_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "signatures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "epi_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trainings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checklists"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inspections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_risk_evidences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_risk_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aprs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "machines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tools"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "epis"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
  }
}
