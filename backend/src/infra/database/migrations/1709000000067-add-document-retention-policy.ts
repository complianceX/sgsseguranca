import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentRetentionPolicy1709000000067 implements MigrationInterface {
  name = 'AddDocumentRetentionPolicy1709000000067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'document_registry_status_enum'
        ) THEN
          CREATE TYPE "document_registry_status_enum" AS ENUM ('ACTIVE', 'EXPIRED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "document_registry"
      ADD COLUMN IF NOT EXISTS "status" "document_registry_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry"
      ADD COLUMN IF NOT EXISTS "litigation_hold" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry"
      ADD COLUMN IF NOT EXISTS "expires_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_registry_company_status_expiry"
      ON "document_registry" ("company_id", "status", "expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_registry_company_hold"
      ON "document_registry" ("company_id", "litigation_hold")
    `);

    await queryRunner.query(`
      UPDATE "document_registry"
      SET "expires_at" =
        COALESCE("document_date", "created_at") +
        CASE
          WHEN "module" = 'dds' THEN INTERVAL '730 days'
          WHEN "module" = 'apr' THEN INTERVAL '1825 days'
          WHEN "module" = 'pt' THEN INTERVAL '1825 days'
          ELSE INTERVAL '1825 days'
        END
      WHERE "expires_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_document_policies" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "company_id" uuid NOT NULL UNIQUE,
        "retention_days_apr" integer NOT NULL DEFAULT 1825,
        "retention_days_dds" integer NOT NULL DEFAULT 730,
        "retention_days_pts" integer NOT NULL DEFAULT 1825,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "FK_tenant_document_policies_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      INSERT INTO "tenant_document_policies" ("company_id")
      SELECT "id" FROM "companies"
      ON CONFLICT ("company_id") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_document_policies" ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_document_policies" FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "tenant_document_policies"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "tenant_document_policies"
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
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "tenant_document_policies"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "tenant_document_policies"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_registry_company_hold"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_registry_company_status_expiry"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_registry"
      DROP COLUMN IF EXISTS "expires_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry"
      DROP COLUMN IF EXISTS "litigation_hold"
    `);
    await queryRunner.query(`
      ALTER TABLE "document_registry"
      DROP COLUMN IF EXISTS "status"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'document_registry_status_enum'
        ) THEN
          DROP TYPE "document_registry_status_enum";
        END IF;
      END $$;
    `);
  }
}
