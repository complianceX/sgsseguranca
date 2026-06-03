import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArrPhase1Hardening1709000000137 implements MigrationInterface {
  name = 'ArrPhase1Hardening1709000000137';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "arrs"
        ADD COLUMN IF NOT EXISTS "document_code" character varying(40),
        ADD COLUMN IF NOT EXISTS "final_pdf_hash_sha256" character varying(64),
        ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp,
        ADD COLUMN IF NOT EXISTS "emitted_by_user_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "arrs"
        DROP CONSTRAINT IF EXISTS "FK_arrs_emitted_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "arrs"
        ADD CONSTRAINT "FK_arrs_emitted_by_user_id"
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
        WHERE dr."module" = 'arr'
        ORDER BY dr."company_id", dr."entity_id", dr."created_at" DESC, dr."id" DESC
      )
      UPDATE "arrs" AS a
      SET
        "document_code" = COALESCE(a."document_code", latest_registry."document_code"),
        "final_pdf_hash_sha256" = COALESCE(a."final_pdf_hash_sha256", latest_registry."file_hash"),
        "pdf_generated_at" = COALESCE(a."pdf_generated_at", latest_registry."created_at"),
        "emitted_by_user_id" = COALESCE(a."emitted_by_user_id", latest_registry."created_by")
      FROM latest_registry
      WHERE latest_registry."entity_id" = a."id"
        AND latest_registry."company_id" = a."company_id"
        AND a."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_arrs_document_code_active"
      ON "arrs" ("document_code")
      WHERE "document_code" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_arrs_document_code_active"`,
    );

    await queryRunner.query(`
      ALTER TABLE "arrs"
        DROP CONSTRAINT IF EXISTS "FK_arrs_emitted_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "arrs"
        DROP COLUMN IF EXISTS "emitted_by_user_id",
        DROP COLUMN IF EXISTS "pdf_generated_at",
        DROP COLUMN IF EXISTS "final_pdf_hash_sha256",
        DROP COLUMN IF EXISTS "document_code"
    `);
  }
}
