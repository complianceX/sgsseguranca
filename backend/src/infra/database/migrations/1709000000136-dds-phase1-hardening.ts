import { MigrationInterface, QueryRunner } from 'typeorm';

export class DdsPhase1Hardening1709000000136 implements MigrationInterface {
  name = 'DdsPhase1Hardening1709000000136';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD COLUMN IF NOT EXISTS "document_code" character varying(40),
        ADD COLUMN IF NOT EXISTS "final_pdf_hash_sha256" character varying(64),
        ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp,
        ADD COLUMN IF NOT EXISTS "emitted_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "emitted_ip" character varying(64),
        ADD COLUMN IF NOT EXISTS "emitted_user_agent" text
    `);

    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP CONSTRAINT IF EXISTS "FK_dds_emitted_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD CONSTRAINT "FK_dds_emitted_by_user_id"
        FOREIGN KEY ("emitted_by_user_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      WITH latest_registry AS (
        SELECT DISTINCT ON (dr."company_id", dr."entity_id")
          dr."company_id",
          dr."entity_id",
          dr."document_code",
          dr."file_hash",
          dr."created_at",
          dr."created_by"
        FROM "document_registry" dr
        WHERE dr."module" = 'dds'
        ORDER BY dr."company_id", dr."entity_id", dr."created_at" DESC, dr."id" DESC
      )
      UPDATE "dds" AS d
      SET
        "document_code" = COALESCE(d."document_code", latest_registry."document_code"),
        "final_pdf_hash_sha256" = COALESCE(d."final_pdf_hash_sha256", latest_registry."file_hash"),
        "pdf_generated_at" = COALESCE(d."pdf_generated_at", latest_registry."created_at"),
        "emitted_by_user_id" = COALESCE(d."emitted_by_user_id", latest_registry."created_by")
      FROM latest_registry
      WHERE latest_registry."entity_id" = d."id"
        AND latest_registry."company_id" = d."company_id"
        AND d."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_dds_document_code_active"
      ON "dds" ("document_code")
      WHERE "document_code" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_dds_document_code_active"`,
    );

    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP CONSTRAINT IF EXISTS "FK_dds_emitted_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP COLUMN IF EXISTS "emitted_user_agent",
        DROP COLUMN IF EXISTS "emitted_ip",
        DROP COLUMN IF EXISTS "emitted_by_user_id",
        DROP COLUMN IF EXISTS "pdf_generated_at",
        DROP COLUMN IF EXISTS "final_pdf_hash_sha256",
        DROP COLUMN IF EXISTS "document_code"
    `);
  }
}
