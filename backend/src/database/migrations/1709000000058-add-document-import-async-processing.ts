import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentImportAsyncProcessing1709000000058 implements MigrationInterface {
  name = 'AddDocumentImportAsyncProcessing1709000000058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."document_imports_status_enum" ADD VALUE IF NOT EXISTS 'QUEUED';
        ALTER TYPE "public"."document_imports_status_enum" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ADD COLUMN IF NOT EXISTS "mime_type" character varying(120),
      ADD COLUMN IF NOT EXISTS "arquivo_staging" bytea,
      ADD COLUMN IF NOT EXISTS "processing_job_id" character varying(128),
      ADD COLUMN IF NOT EXISTS "processing_attempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "dead_lettered_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_imports"
      DROP COLUMN IF EXISTS "dead_lettered_at",
      DROP COLUMN IF EXISTS "last_attempt_at",
      DROP COLUMN IF EXISTS "processing_attempts",
      DROP COLUMN IF EXISTS "processing_job_id",
      DROP COLUMN IF EXISTS "arquivo_staging",
      DROP COLUMN IF EXISTS "mime_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."document_imports_status_enum"
      RENAME TO "document_imports_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."document_imports_status_enum" AS ENUM(
        'UPLOADED',
        'PROCESSING',
        'INTERPRETING',
        'VALIDATING',
        'COMPLETED',
        'FAILED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ALTER COLUMN "status" TYPE "public"."document_imports_status_enum"
      USING "status"::text::"public"."document_imports_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ALTER COLUMN "status" SET DEFAULT 'UPLOADED'
    `);

    await queryRunner.query(`
      DROP TYPE "public"."document_imports_status_enum_old"
    `);
  }
}
