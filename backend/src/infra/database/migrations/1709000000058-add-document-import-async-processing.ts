import { MigrationInterface, QueryRunner } from 'typeorm';

type StatusColumnRow = {
  udt_schema: string;
  udt_name: string;
};

export class AddDocumentImportAsyncProcessing1709000000058 implements MigrationInterface {
  name = 'AddDocumentImportAsyncProcessing1709000000058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statusColumn = (await queryRunner.query(`
      SELECT udt_schema, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'document_imports'
        AND column_name = 'status'
      LIMIT 1
    `)) as StatusColumnRow[];

    const statusUdtSchema: string | null = statusColumn[0]?.udt_schema ?? null;
    const statusUdtName: string | null = statusColumn[0]?.udt_name ?? null;

    const usesNativeEnum =
      statusUdtSchema !== null &&
      statusUdtName !== null &&
      statusUdtName !== 'varchar' &&
      statusUdtName !== 'text';

    if (usesNativeEnum) {
      await queryRunner.query(`
        DO $$
        BEGIN
          EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS ''QUEUED''',
            '${statusUdtSchema}',
            '${statusUdtName}',
          );
          EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS ''DEAD_LETTER''',
            '${statusUdtSchema}',
            '${statusUdtName}',
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
    }

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
    const statusColumn = (await queryRunner.query(`
      SELECT udt_schema, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'document_imports'
        AND column_name = 'status'
      LIMIT 1
    `)) as StatusColumnRow[];

    const statusUdtSchema: string | null = statusColumn[0]?.udt_schema ?? null;
    const statusUdtName: string | null = statusColumn[0]?.udt_name ?? null;

    const usesNativeEnum =
      statusUdtSchema !== null &&
      statusUdtName !== null &&
      statusUdtName !== 'varchar' &&
      statusUdtName !== 'text';

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

    if (!usesNativeEnum) {
      await queryRunner.query(`
        ALTER TABLE "document_imports"
        ALTER COLUMN "status" SET DEFAULT 'UPLOADED'
      `);

      return;
    }

    await queryRunner.query(`
      ALTER TYPE "${statusUdtSchema}"."${statusUdtName}"
      RENAME TO "${statusUdtName}_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "${statusUdtSchema}"."${statusUdtName}" AS ENUM(
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
      ALTER COLUMN "status" TYPE "${statusUdtSchema}"."${statusUdtName}"
      USING "status"::text::"${statusUdtSchema}"."${statusUdtName}"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ALTER COLUMN "status" SET DEFAULT 'UPLOADED'
    `);

    await queryRunner.query(`
      DROP TYPE "${statusUdtSchema}"."${statusUdtName}_old"
    `);
  }
}
