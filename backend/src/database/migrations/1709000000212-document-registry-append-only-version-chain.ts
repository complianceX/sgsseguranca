import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentRegistryAppendOnlyVersionChain1709000000212 implements MigrationInterface {
  name = 'DocumentRegistryAppendOnlyVersionChain1709000000212';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_registry"
        ADD COLUMN IF NOT EXISTS "finalized_at" timestamp NULL,
        ADD COLUMN IF NOT EXISTS "signed_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_registry_versions" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "document_id" uuid NOT NULL,
        "document_type" varchar(50) NOT NULL,
        "version" integer NOT NULL,
        "status" varchar(32) NOT NULL,
        "supersedes_id" uuid NULL,
        "finalized_at" timestamp NULL,
        "signed_at" timestamp NULL,
        "hash" varchar(128) NULL,
        "company_id" uuid NOT NULL,
        "created_by" uuid NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.document_registry_versions') IS NULL THEN
          RETURN;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_document_registry_versions_company_id'
            AND conrelid = 'public.document_registry_versions'::regclass
        ) THEN
          ALTER TABLE "document_registry_versions"
            ADD CONSTRAINT "FK_document_registry_versions_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_document_registry_versions_created_by'
            AND conrelid = 'public.document_registry_versions'::regclass
        ) THEN
          ALTER TABLE "document_registry_versions"
            ADD CONSTRAINT "FK_document_registry_versions_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users"("id")
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_document_registry_versions_supersedes_id'
            AND conrelid = 'public.document_registry_versions'::regclass
        ) THEN
          ALTER TABLE "document_registry_versions"
            ADD CONSTRAINT "FK_document_registry_versions_supersedes_id"
            FOREIGN KEY ("supersedes_id") REFERENCES "document_registry_versions"("id")
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_document_registry_versions_chain"
      ON "document_registry_versions" ("company_id", "document_id", "document_type", "version")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_registry_versions_company_document"
      ON "document_registry_versions" ("company_id", "document_id", "document_type")
    `);

    await queryRunner.query(`
      ALTER TABLE "document_registry_versions" ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry_versions" FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_registry_versions"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "document_registry_versions"
      FOR ALL
      USING (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
      WITH CHECK (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
    `);

    await queryRunner.query(`
      INSERT INTO "document_registry_versions" (
        "document_id",
        "document_type",
        "version",
        "status",
        "supersedes_id",
        "finalized_at",
        "signed_at",
        "hash",
        "company_id",
        "created_by",
        "created_at"
      )
      SELECT
        dr.entity_id,
        dr.document_type,
        1,
        COALESCE(dr.status::text, 'ACTIVE'),
        NULL,
        dr.finalized_at,
        dr.signed_at,
        dr.file_hash,
        dr.company_id,
        dr.created_by,
        COALESCE(dr.created_at, now())
      FROM "document_registry" dr
      WHERE NOT EXISTS (
        SELECT 1
        FROM "document_registry_versions" drv
        WHERE drv.company_id = dr.company_id
          AND drv.document_id = dr.entity_id
          AND drv.document_type = dr.document_type
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_document_registry_versions_company_document"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_registry_versions"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_document_registry_versions_chain"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "document_registry_versions"`,
    );
    await queryRunner.query(`
      ALTER TABLE "document_registry"
        DROP COLUMN IF EXISTS "signed_at",
        DROP COLUMN IF EXISTS "finalized_at"
    `);
  }
}
