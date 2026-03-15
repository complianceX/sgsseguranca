import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentRegistry1709000000041 implements MigrationInterface {
  name = 'CreateDocumentRegistry1709000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_registry" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "module" varchar(50) NOT NULL,
        "document_type" varchar(50) NOT NULL DEFAULT 'pdf',
        "entity_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "document_date" timestamp NULL,
        "iso_year" integer NOT NULL,
        "iso_week" integer NOT NULL,
        "file_key" text NOT NULL,
        "folder_path" text NULL,
        "original_name" text NULL,
        "mime_type" varchar(120) NULL,
        "file_hash" varchar(128) NULL,
        "document_code" varchar(100) NULL,
        "created_by" uuid NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_document_registry_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "UQ_document_registry_source" UNIQUE ("module", "entity_id", "document_type")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_registry_company_week"
      ON "document_registry" ("company_id", "iso_year", "iso_week")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_registry_module_entity"
      ON "document_registry" ("module", "entity_id")
    `);

    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES ('can_view_documents_registry', 'Permite consultar e baixar o registry documental consolidado')
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('ADMIN_GERAL', 'ADMIN_EMPRESA', 'TST', 'SUPERVISOR')
        AND p.name = 'can_view_documents_registry'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id",
        "module",
        "document_type",
        "entity_id",
        "title",
        "document_date",
        "iso_year",
        "iso_week",
        "file_key",
        "folder_path",
        "original_name",
        "mime_type",
        "document_code",
        "created_at",
        "updated_at"
      )
      SELECT
        "company_id",
        'apr',
        'pdf',
        "id",
        COALESCE(NULLIF("titulo", ''), NULLIF("numero", ''), 'APR'),
        COALESCE("data_inicio"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data_inicio"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data_inicio"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'APR-' || EXTRACT(ISOYEAR FROM COALESCE("data_inicio"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data_inicio"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "aprs"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'pt',
        'pdf',
        "id",
        COALESCE(NULLIF("titulo", ''), NULLIF("numero", ''), 'PT'),
        COALESCE("data_hora_inicio", "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data_hora_inicio", "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data_hora_inicio", "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'PT-' || EXTRACT(ISOYEAR FROM COALESCE("data_hora_inicio", "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data_hora_inicio", "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "pts"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'dds',
        'pdf',
        "id",
        COALESCE(NULLIF("tema", ''), 'DDS'),
        COALESCE("data"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'DDS-' || EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "dds"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'checklist',
        'pdf',
        "id",
        COALESCE(NULLIF("titulo", ''), 'Checklist'),
        COALESCE("data"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'CHK-' || EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "checklists"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'audit',
        'pdf',
        "id",
        COALESCE(NULLIF("titulo", ''), 'Auditoria'),
        COALESCE("data_auditoria"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data_auditoria"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data_auditoria"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'AUD-' || EXTRACT(ISOYEAR FROM COALESCE("data_auditoria"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data_auditoria"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "audits"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'nonconformity',
        'pdf',
        "id",
        COALESCE(NULLIF("codigo_nc", ''), NULLIF("tipo", ''), 'Nao Conformidade'),
        COALESCE("data_identificacao"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data_identificacao"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data_identificacao"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'NC-' || EXTRACT(ISOYEAR FROM COALESCE("data_identificacao"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data_identificacao"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "nonconformities"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "document_registry" ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry" FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_registry"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "document_registry"
      USING (
        company_id = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        company_id = current_company()
        OR is_super_admin() = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_registry"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_registry_module_entity"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_registry_company_week"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "document_registry"
    `);

    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE name = 'can_view_documents_registry'
      )
    `);

    await queryRunner.query(`
      DELETE FROM permissions WHERE name = 'can_view_documents_registry'
    `);
  }
}
